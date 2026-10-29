import type { EstadoCuota, EstadoValidacion, OrigenConfirmacion } from "@/db/schema";
import type { EstadoCompaniaCuota, MedioPago, Moneda } from "@/lib/conectores/tipos";
import { diasEntre, finDeSemana, sumarDias } from "@/lib/fechas";
import { diasDeGracia, type Gracia } from "./gracia";

// Cálculo del estado de cada cuota (sección 6, paso 4, de
// docs/specs/validador-v2.md): pendiente, por vencer, vencida (después de la
// gracia), pagada o cancelada. Puro y determinista: la IA nunca decide esto.
// "Esta semana" (por vencer) es la semana calendario, de lunes a domingo: lo que
// vence hasta el domingo, más lo que ya venció y sigue en gracia.

export type CuotaParaEstado = { numero: number; vencimiento: string; pagada: boolean; cancelada: boolean };

export type ResultadoEstado = {
  estado: EstadoValidacion;
  /** Días hasta el vencimiento; negativo si ya venció. */
  diasParaVencer: number;
  /** Último día de gracia: desde el día siguiente la cuota está vencida. */
  finDeGracia: string;
  /** Ya venció, pero sigue dentro de la gracia. */
  enGracia: boolean;
};

/**
 * Una cuota pagada sigue pagada aunque después se anule la póliza (la plata
 * entró y cuenta para comisiones). Vencida es cuando pasaron más días que la
 * gracia: con 15 días, la que vence hoy pasa a vencida el día 16.
 */
export function calcularEstado(cuota: CuotaParaEstado, contexto: { hoy: string; gracia: Gracia }): ResultadoEstado {
  const gracia = diasDeGracia(contexto.gracia, cuota.numero);
  const diasParaVencer = diasEntre(contexto.hoy, cuota.vencimiento);
  const finDeGracia = sumarDias(cuota.vencimiento, gracia);
  const vencida = contexto.hoy > finDeGracia;
  const base = { diasParaVencer, finDeGracia, enGracia: diasParaVencer < 0 && !vencida };
  if (cuota.pagada) return { ...base, estado: "pagada", enGracia: false };
  if (cuota.cancelada) return { ...base, estado: "cancelada", enGracia: false };
  if (vencida) return { ...base, estado: "vencida" };
  if (cuota.vencimiento <= finDeSemana(contexto.hoy)) return { ...base, estado: "por_vencer" };
  return { ...base, estado: "pendiente" };
}

/**
 * El estado que lee el resto de UNIQO (cuotas.estado: Inicio, Estadísticas).
 * La que sigue en gracia todavía no está vencida. Una cancelada no se toca:
 * esas pantallas la excluyen por estado_validacion.
 */
export function estadoCuotaDe(estado: EstadoValidacion): EstadoCuota | null {
  if (estado === "pagada" || estado === "vencida") return estado;
  if (estado === "cancelada") return null;
  return "pendiente";
}

/** Cómo se muestra el medio de pago en la cuota (cuotas.medio_pago). */
export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  debito_tarjeta: "Débito con tarjeta",
  debito_cbu: "Débito por CBU",
  pago_facil: "Pago Fácil",
  rapipago: "Rapipago",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  efectivo_productor: "Efectivo al productor",
};

// ---------- Totales de la vista Cobranza ----------

export type BloqueCobranza = "semana" | "proximos" | "vencidos";

/** Esta semana = por vencer; Próximos = pendiente; Vencidos = vencida. */
export function bloqueDe(estado: EstadoValidacion): BloqueCobranza | null {
  if (estado === "por_vencer") return "semana";
  if (estado === "pendiente") return "proximos";
  if (estado === "vencida") return "vencidos";
  return null;
}

export type Total = {
  /** Una línea por moneda: ARS y USD nunca se suman. */
  montos: { moneda: Moneda; monto: number }[];
  pagos: number;
  asegurados: number;
};

const ORDEN_MONEDAS: Moneda[] = ["ARS", "USD"];

export function totalizar(cuotas: { monto: number; moneda: Moneda; aseguradoId: number }[]): Total {
  const porMoneda = new Map<Moneda, number>();
  for (const c of cuotas) porMoneda.set(c.moneda, (porMoneda.get(c.moneda) ?? 0) + c.monto);
  return {
    montos: [...porMoneda]
      .sort(([a], [b]) => ORDEN_MONEDAS.indexOf(a) - ORDEN_MONEDAS.indexOf(b))
      .map(([moneda, monto]) => ({ moneda, monto: Math.round(monto * 100) / 100 })),
    pagos: cuotas.length,
    asegurados: new Set(cuotas.map((c) => c.aseguradoId)).size,
  };
}

export function totalesPorBloque(
  cuotas: { estado: EstadoValidacion; monto: number; moneda: Moneda; aseguradoId: number }[],
): Record<BloqueCobranza, Total> {
  const de = (bloque: BloqueCobranza) => totalizar(cuotas.filter((c) => bloqueDe(c.estado) === bloque));
  return { semana: de("semana"), proximos: de("proximos"), vencidos: de("vencidos") };
}

// ---------- Qué hacer con lo que informa la compañía ----------

export type CambioCuota =
  | { tipo: "marcar_pagada"; fechaPago: string | null; medio: MedioPago | null }
  | { tipo: "marcar_cancelada"; motivo: string }
  | { tipo: "sin_cambios"; motivo: string | null }
  | { tipo: "a_revisar"; motivo: string };

export type CuotaActual = { pagada: boolean; cancelada: boolean; origenConfirmacion: OrigenConfirmacion | null };

/**
 * Lo que se hace con una cuota que ya coincidió con una fila del listado o del
 * conector. Nunca pisa un dato en conflicto: si la compañía contradice lo que
 * hay en la cartera, queda a revisar. Que la compañía diga "vencida" no cambia
 * nada: el vencimiento lo calcula calcularEstado con la gracia configurada.
 */
export function cambioPorInforme(
  actual: CuotaActual,
  informado: { estadoCompania: EstadoCompaniaCuota; fechaPago: string | null; medio: MedioPago | null },
): CambioCuota {
  const { estadoCompania } = informado;
  if (estadoCompania === "pagada") {
    if (actual.pagada) return { tipo: "sin_cambios", motivo: null };
    if (actual.cancelada) return { tipo: "a_revisar", motivo: "La cuota está cancelada y la compañía la informa pagada." };
    return { tipo: "marcar_pagada", fechaPago: informado.fechaPago, medio: informado.medio };
  }
  if (estadoCompania === "anulada") {
    if (actual.pagada) return { tipo: "a_revisar", motivo: "La cuota figura pagada y la compañía la informa anulada." };
    if (actual.cancelada) return { tipo: "sin_cambios", motivo: null };
    return { tipo: "marcar_cancelada", motivo: "Anulada según la compañía." };
  }
  // pendiente o vencida según la compañía
  if (actual.cancelada) return { tipo: "a_revisar", motivo: "La cuota está cancelada y la compañía la informa impaga: puede ser una rehabilitación." };
  if (actual.pagada) {
    return actual.origenConfirmacion === "listado" || actual.origenConfirmacion === "portal"
      ? { tipo: "a_revisar", motivo: "La compañía la había informado pagada y ahora figura impaga." }
      : { tipo: "sin_cambios", motivo: "Se confirmó en UNIQO y la compañía todavía no registra el pago." };
  }
  return { tipo: "sin_cambios", motivo: null };
}
