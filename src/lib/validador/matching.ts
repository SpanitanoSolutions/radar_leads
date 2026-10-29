import type { CandidatoPago } from "@/db/schema";
import { normalizar } from "@/fuentes/clasificacion";
import type { Cancelacion, Moneda, PagoNormalizado } from "@/lib/conectores/tipos";
import { diasEntre, fechaCorta } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import { companiaCanonica } from "@/lib/importacion";

// Matching determinista cuota ↔ pago (sección 6, paso 3, de
// docs/specs/validador-v2.md). La IA puede extraer o explicar, pero quién
// coincide con quién lo decide este código.

export type CuotaCartera = {
  id: number;
  compania: string | null;
  /** Número de póliza. */
  poliza: string | null;
  item: string | null;
  endoso: string | null;
  numero: number;
  cantidadCuotas: number;
  cupon: string | null;
  monto: number;
  moneda: Moneda;
  vencimiento: string;
  pagada: boolean;
  cancelada: boolean;
};

export type EstadoMatch = "confirmado" | "a_revisar" | "no_identificado";

export type ResultadoMatch = {
  estado: EstadoMatch;
  /** Confirmado: la cuota. A revisar: la candidata más probable, o null si hay empate. */
  cuotaId: number | null;
  puntaje: number;
  candidatos: CandidatoPago[];
  motivo: string;
};

export type OpcionesMatch = { toleranciaMonto: number };

/** Suman 100. La póliza vale también si coincide el cupón. */
export const PESOS_PAGO = { poliza: 30, cuota: 25, monto: 20, vencimiento: 15, moneda: 10 } as const;
export const MAX_CANDIDATOS = 5;

/** "0664794781" → "664794781"; "UY 41999728" → "uy41999728". */
export function claveNumero(texto: string | null): string {
  return normalizar(texto ?? "").replace(/[^a-z0-9]/g, "").replace(/^0+(?=.)/, "");
}

/** "Ítem 1", "Item 01" y "1" son el mismo ítem. */
function claveItem(texto: string | null): string {
  return claveNumero(normalizar(texto ?? "").replace(/^(item|unidad|inciso)\s*/, ""));
}

const mismaCompania = (a: string | null, b: string | null) => a !== null && b !== null && companiaCanonica(a) === companiaCanonica(b);
const dentroDeTolerancia = (a: number, b: number, tolerancia: number) => Math.abs(a - b) <= tolerancia + 0.005;

type Evaluacion = { cuota: CuotaCartera; puntaje: number; completa: boolean; motivos: string[] };

function evaluar(pago: PagoNormalizado, cuota: CuotaCartera, opciones: OpcionesMatch): Evaluacion | null {
  if (!mismaCompania(cuota.compania, pago.compania)) return null;
  const poliza = claveNumero(cuota.poliza) !== "" && claveNumero(cuota.poliza) === claveNumero(pago.poliza);
  const cupon = claveNumero(cuota.cupon) !== "" && claveNumero(cuota.cupon) === claveNumero(pago.cupon);
  if (!poliza && !cupon) return null;
  // En flotas, un ítem distinto es otra cuota.
  if (claveItem(cuota.item) && claveItem(pago.item) && claveItem(cuota.item) !== claveItem(pago.item)) return null;

  const moneda = cuota.moneda === pago.moneda;
  const criterios = {
    poliza: true,
    cuota: cuota.numero === pago.cuotaN,
    monto: moneda && dentroDeTolerancia(cuota.monto, pago.monto, opciones.toleranciaMonto),
    vencimiento: cuota.vencimiento === pago.vencimiento,
    moneda,
  };
  const motivos: string[] = [];
  if (!poliza) motivos.push(`Coincide el cupón, pero la póliza figura como ${pago.poliza}.`);
  if (!criterios.cuota) motivos.push(`Es la cuota ${cuota.numero} de ${cuota.cantidadCuotas} y la compañía informa la ${pago.cuotaN} de ${pago.cuotaTotal}.`);
  if (!moneda) motivos.push(`La cuota es en ${cuota.moneda} y la compañía informa ${pago.moneda}.`);
  else if (!criterios.monto) {
    motivos.push(`La compañía informa ${importe(pago.monto, pago.moneda)} y la cuota es de ${importe(cuota.monto, cuota.moneda)}.`);
  }
  if (!criterios.vencimiento) motivos.push(`Vence el ${fechaCorta(cuota.vencimiento)} y la compañía informa el ${fechaCorta(pago.vencimiento)}.`);

  const puntaje = (Object.keys(criterios) as (keyof typeof criterios)[]).reduce((s, k) => s + (criterios[k] ? PESOS_PAGO[k] : 0), 0);
  return { cuota, puntaje, completa: Object.values(criterios).every(Boolean), motivos };
}

const aCandidato = (e: Evaluacion): CandidatoPago => ({ cuotaId: e.cuota.id, puntaje: e.puntaje, motivos: e.motivos });

/**
 * Una fila normalizada de un listado o de un conector contra las cuotas de la
 * cartera. Candidatas: misma compañía y misma póliza (o mismo cupón).
 * Coincidencia exacta y única: confirmado. Parcial o con empate: a revisar,
 * con candidatos y puntaje. Sin candidatas: no identificado.
 */
export function matchearPago(pago: PagoNormalizado, cuotas: CuotaCartera[], opciones: OpcionesMatch): ResultadoMatch {
  const evaluadas = cuotas
    .map((c) => evaluar(pago, c, opciones))
    .filter((e): e is Evaluacion => e !== null)
    .sort((a, b) => b.puntaje - a.puntaje
      || Math.abs(diasEntre(pago.vencimiento, a.cuota.vencimiento)) - Math.abs(diasEntre(pago.vencimiento, b.cuota.vencimiento))
      || a.cuota.id - b.cuota.id);

  if (evaluadas.length === 0) {
    return { estado: "no_identificado", cuotaId: null, puntaje: 0, candidatos: [], motivo: "Ninguna cuota de la cartera coincide con la póliza ni con el cupón." };
  }

  const completas = evaluadas.filter((e) => e.completa);
  if (completas.length === 1) {
    const [e] = completas;
    return { estado: "confirmado", cuotaId: e.cuota.id, puntaje: e.puntaje, candidatos: [aCandidato(e)], motivo: "Coinciden póliza, cuota, monto, moneda y vencimiento." };
  }
  if (completas.length > 1) {
    return {
      estado: "a_revisar",
      cuotaId: null,
      puntaje: completas[0].puntaje,
      candidatos: completas.slice(0, MAX_CANDIDATOS).map(aCandidato),
      motivo: `Coincide con ${completas.length} cuotas (por ejemplo, ítems de una flota): hay que elegir cuál.`,
    };
  }

  // Pago agrupado: una sola fila por la cuota de todos los ítems de una flota.
  const delGrupo = evaluadas.filter((e) => e.cuota.numero === pago.cuotaN && e.cuota.moneda === pago.moneda && e.cuota.vencimiento === pago.vencimiento);
  const suma = delGrupo.reduce((s, e) => s + e.cuota.monto, 0);
  if (!pago.item && delGrupo.length > 1 && dentroDeTolerancia(suma, pago.monto, opciones.toleranciaMonto)) {
    return {
      estado: "a_revisar",
      cuotaId: null,
      puntaje: delGrupo[0].puntaje,
      candidatos: delGrupo.slice(0, MAX_CANDIDATOS).map(aCandidato),
      motivo: `El monto coincide con la suma de ${delGrupo.length} cuotas que vencen el ${fechaCorta(pago.vencimiento)}: puede ser un pago agrupado.`,
    };
  }

  const [mejor] = evaluadas;
  const empate = evaluadas.length > 1 && evaluadas[1].puntaje === mejor.puntaje;
  return {
    estado: "a_revisar",
    cuotaId: empate ? null : mejor.cuota.id,
    puntaje: mejor.puntaje,
    candidatos: evaluadas.slice(0, MAX_CANDIDATOS).map(aCandidato),
    motivo: mejor.motivos.join(" "),
  };
}

/**
 * Todas las filas de una fuente. Si dos filas confirman la misma cuota, la
 * segunda queda a revisar: una cuota no se paga dos veces en el mismo listado.
 */
export function matchearPagos(pagos: PagoNormalizado[], cuotas: CuotaCartera[], opciones: OpcionesMatch): ResultadoMatch[] {
  const usadas = new Set<number>();
  return pagos.map((pago) => {
    const r = matchearPago(pago, cuotas, opciones);
    if (r.estado !== "confirmado" || r.cuotaId === null) return r;
    if (usadas.has(r.cuotaId)) return { ...r, estado: "a_revisar", motivo: "Otra fila de la misma fuente ya coincidió con esta cuota." };
    usadas.add(r.cuotaId);
    return r;
  });
}

const MOTIVOS_CANCELACION: Record<Cancelacion["motivo"], string> = {
  falta_de_pago: "Anulación por falta de pago.",
  pedido_del_asegurado: "Anulada a pedido del asegurado.",
  otro: "Anulada por la compañía.",
};

/**
 * Las cuotas que cancela una anulación de póliza (o de un ítem): las impagas
 * que no estaban canceladas. Las pagadas siguen pagadas.
 */
export function cuotasDeCancelacion(cancelacion: Cancelacion, cuotas: CuotaCartera[]): { cuotaIds: number[]; motivo: string } {
  const poliza = claveNumero(cancelacion.poliza);
  const item = claveItem(cancelacion.item);
  const cuotaIds = cuotas
    .filter((c) => mismaCompania(c.compania, cancelacion.compania) && poliza !== "" && claveNumero(c.poliza) === poliza)
    .filter((c) => !item || claveItem(c.item) === item)
    .filter((c) => !c.pagada && !c.cancelada)
    .map((c) => c.id);
  return { cuotaIds, motivo: MOTIVOS_CANCELACION[cancelacion.motivo] };
}

// ---------- Comprobantes del asegurado ----------

/** Lo que se lee de un comprobante (a mano o con IA). Fechas AAAA-MM-DD. */
export type ComprobanteParaMatch = {
  monto: number | null;
  /** Sin dato se asume ARS. */
  moneda: Moneda | null;
  fecha: string | null;
  /** Número de operación, código de pago o concepto de la transferencia. */
  referencia: string | null;
  pagador: string | null;
  documentoPagador: string | null;
  /** La compañía dueña de la cuenta de destino, si se reconoció. */
  compania: string | null;
};

/** Las cuotas que se cobran juntas (ver agruparCobros en src/lib/validador.ts). */
export type CobroCandidato = {
  cuotaIds: number[];
  asegurado: string;
  documento: string | null;
  compania: string | null;
  polizas: string[];
  cupones: string[];
  monto: number;
  moneda: Moneda;
  vencimiento: string;
};

export type CandidatoComprobante = CandidatoPago & { cuotaIds: number[] };

export type PropuestaComprobante = {
  /** Un comprobante nunca se confirma solo: lo confirma el productor. */
  estado: "a_revisar" | "no_identificado";
  candidatos: CandidatoComprobante[];
  motivo: string;
};

/** Suman 100. */
export const PESOS_COMPROBANTE = { monto: 40, referencia: 25, pagador: 20, compania: 10, fecha: 5 } as const;
/** Con menos, el cobro no se propone. Un monto exacto alcanza. */
export const PUNTAJE_MINIMO_COMPROBANTE = 40;

const PALABRAS_VACIAS = new Set(["del", "las", "los", "srl", "sas", "sociedad", "anonima"]);

function palabras(nombre: string): Set<string> {
  return new Set(normalizar(nombre).split(/[^a-z]+/).filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p)));
}

/** "García, Juan" y "JUAN GARCIA" son la misma persona; "María García", no. */
export function mismoNombre(a: string, b: string): boolean {
  const pa = palabras(a);
  const pb = palabras(b);
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  return comunes >= 2 || (comunes === 1 && Math.min(pa.size, pb.size) === 1);
}

/** El CUIL contiene el DNI: 20-12345678-3 y 12.345.678 son el mismo documento. */
export function mismoDocumento(a: string, b: string): boolean {
  // Del CUIT o CUIL, el DNI del medio (con ceros a la izquierda si tiene 7 dígitos).
  const dni = (texto: string) => {
    const digitos = texto.replace(/\D/g, "");
    return (digitos.length === 11 ? digitos.slice(2, 10) : digitos).replace(/^0+/, "");
  };
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (da.length < 7 || db.length < 7) return false;
  return da === db || dni(da) === dni(db);
}

function evaluarComprobante(comprobante: ComprobanteParaMatch, cobro: CobroCandidato, opciones: OpcionesMatch): CandidatoComprobante | null {
  if ((comprobante.moneda ?? "ARS") !== cobro.moneda) return null;
  let puntaje = 0;
  const motivos: string[] = [];

  if (comprobante.monto !== null) {
    if (dentroDeTolerancia(comprobante.monto, cobro.monto, opciones.toleranciaMonto)) {
      puntaje += PESOS_COMPROBANTE.monto;
      motivos.push("El monto coincide.");
    } else if (Math.abs(comprobante.monto - cobro.monto) <= cobro.monto * 0.05) {
      puntaje += 15;
      motivos.push(`El monto se parece: pagó ${importe(comprobante.monto, cobro.moneda)} y el cobro es de ${importe(cobro.monto, cobro.moneda)}.`);
    }
  }

  const referencia = claveNumero(comprobante.referencia);
  const citada = [...cobro.polizas, ...cobro.cupones].map(claveNumero).find((n) => n.length >= 4 && referencia.includes(n));
  if (citada) {
    puntaje += PESOS_COMPROBANTE.referencia;
    motivos.push("La referencia del pago menciona la póliza o el cupón.");
  }

  if (comprobante.documentoPagador && cobro.documento && mismoDocumento(comprobante.documentoPagador, cobro.documento)) {
    puntaje += PESOS_COMPROBANTE.pagador;
    motivos.push("Pagó el asegurado (coincide el documento).");
  } else if (comprobante.pagador && mismoNombre(comprobante.pagador, cobro.asegurado)) {
    puntaje += 15;
    motivos.push("El nombre del que pagó coincide con el asegurado.");
  }

  if (comprobante.compania && mismaCompania(comprobante.compania, cobro.compania)) {
    puntaje += PESOS_COMPROBANTE.compania;
    motivos.push("Se pagó a una cuenta de la compañía de la póliza.");
  }

  if (comprobante.fecha) {
    const dias = diasEntre(cobro.vencimiento, comprobante.fecha);
    if (dias >= -10 && dias <= 30) {
      puntaje += PESOS_COMPROBANTE.fecha;
      motivos.push("La fecha del pago es cercana al vencimiento.");
    }
  }

  return { cuotaId: cobro.cuotaIds[0], cuotaIds: cobro.cuotaIds, puntaje, motivos };
}

/**
 * Propone a qué cobro corresponde un comprobante, con puntaje y motivos. Nunca
 * lo da por pagado: queda a revisar hasta que el productor lo confirme.
 */
export function proponerCobros(comprobante: ComprobanteParaMatch, cobros: CobroCandidato[], opciones: OpcionesMatch): PropuestaComprobante {
  const candidatos = cobros
    .map((c) => evaluarComprobante(comprobante, c, opciones))
    .filter((c): c is CandidatoComprobante => c !== null && c.puntaje >= PUNTAJE_MINIMO_COMPROBANTE)
    .sort((a, b) => b.puntaje - a.puntaje || a.cuotaId - b.cuotaId)
    .slice(0, MAX_CANDIDATOS);
  if (candidatos.length === 0) {
    return { estado: "no_identificado", candidatos: [], motivo: "Ningún cobro abierto se parece a este comprobante." };
  }
  return {
    estado: "a_revisar",
    candidatos,
    motivo: candidatos.length === 1 ? "Hay un cobro posible: confirmalo antes de marcarlo pagado." : `Hay ${candidatos.length} cobros posibles: elegí cuál pagó.`,
  };
}
