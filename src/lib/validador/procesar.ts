import type { CandidatoPago, OrigenConfirmacion } from "@/db/schema";
import type { Cancelacion, MedioPago, PagoNormalizado } from "@/lib/conectores/tipos";
import { cambioPorInforme, type CambioCuota } from "./estados";
import { plantillaParaTabla, type PlantillaListado } from "./listados";
import { cuotasDeCancelacion, matchearPagos, type CuotaCartera, type EstadoMatch, type OpcionesMatch } from "./matching";

// Qué hacer con cada fuente (listado o conector) y qué cambia en la cartera.
// Puro: la base y la IA quedan del lado del agente (src/agentes/validador).

// ---------- Qué hacer con una fuente ----------

export type PlanFuente =
  /** Formato conocido: se lee con la plantilla, sin IA. */
  | { paso: "leer_con_plantilla"; plantilla: PlantillaListado }
  /** Formato nuevo: se propone un mapeo y el productor lo confirma. */
  | { paso: "proponer_mapeo"; con: "ia" | "sinonimos" }
  /** PDF: la IA transcribe la tabla (y propone el mapeo si no hay plantilla). */
  | { paso: "extraer_con_ia" }
  | { paso: "sin_ia"; motivo: string };

export function planDeFuente(datos: {
  formato: "xlsx" | "csv" | "pdf";
  /** Null en un PDF que todavía no se transcribió. */
  encabezados: string[] | null;
  compania: string;
  plantillas: PlantillaListado[];
  iaDisponible: boolean;
}): PlanFuente {
  if (!datos.encabezados) {
    return datos.iaDisponible
      ? { paso: "extraer_con_ia" }
      : { paso: "sin_ia", motivo: "Para leer un PDF hace falta la IA. Bajá el listado de la compañía en Excel o CSV." };
  }
  const plantilla = plantillaParaTabla(datos.encabezados, datos.compania, datos.plantillas);
  if (plantilla) return { paso: "leer_con_plantilla", plantilla };
  return { paso: "proponer_mapeo", con: datos.iaDisponible ? "ia" : "sinonimos" };
}

// ---------- Cruce con la cartera ----------

export type CuotaParaProcesar = CuotaCartera & { origenConfirmacion: OrigenConfirmacion | null };

export type EntradaPago = {
  /** Número de fila del archivo; null si vino de un conector. */
  fila: number | null;
  original: Record<string, string> | null;
  pago: PagoNormalizado;
};

export type PagoProcesado = EntradaPago & {
  estado: EstadoMatch;
  cuotaId: number | null;
  puntaje: number;
  candidatos: CandidatoPago[];
  motivo: string;
  /** Lo que se decidió con la cuota, si coincidió. */
  cambio: CambioCuota | null;
};

export type CambioAplicable =
  | { cuotaId: number; tipo: "marcar_pagada"; fechaPago: string | null; medio: MedioPago | null }
  | { cuotaId: number; tipo: "marcar_cancelada"; motivo: string; fecha: string | null };

export type ResultadoProceso = {
  pagos: PagoProcesado[];
  /** Las cuotas que cambian de estado. */
  cambios: CambioAplicable[];
  /** Las cuotas que la compañía informó, cambien o no: se les actualiza la última revisión. */
  revisadas: number[];
  totales: { confirmados: number; aRevisar: number; noIdentificados: number; pagadas: number; canceladas: number };
};

/**
 * Cruza lo que informa una fuente con las cuotas de la cartera. Un pago que
 * coincide del todo cambia la cuota según cambioPorInforme; si la compañía
 * contradice la cartera, queda a revisar y no se pisa nada. Las anulaciones
 * cancelan las cuotas impagas, salvo las que esta misma fuente informó pagas.
 */
export function procesarFuente(
  fuente: { pagos: EntradaPago[]; cancelaciones?: Cancelacion[] },
  cuotas: CuotaParaProcesar[],
  opciones: OpcionesMatch,
): ResultadoProceso {
  const porId = new Map(cuotas.map((c) => [c.id, c]));
  const matches = matchearPagos(fuente.pagos.map((e) => e.pago), cuotas, opciones);
  const cambios: CambioAplicable[] = [];
  const revisadas = new Set<number>();

  const pagos = fuente.pagos.map((entrada, i): PagoProcesado => {
    const match = matches[i];
    const base = { ...entrada, ...match, cambio: null };
    const cuota = match.estado === "confirmado" && match.cuotaId !== null ? porId.get(match.cuotaId) : undefined;
    if (!cuota) return base;
    revisadas.add(cuota.id);
    const cambio = cambioPorInforme(cuota, entrada.pago);
    if (cambio.tipo === "a_revisar") return { ...base, estado: "a_revisar", motivo: cambio.motivo, cambio };
    if (cambio.tipo === "marcar_pagada") cambios.push({ cuotaId: cuota.id, tipo: "marcar_pagada", fechaPago: cambio.fechaPago, medio: cambio.medio });
    if (cambio.tipo === "marcar_cancelada") cambios.push({ cuotaId: cuota.id, tipo: "marcar_cancelada", motivo: cambio.motivo, fecha: null });
    return { ...base, cambio };
  });

  const pagadasAhora = new Set(cambios.filter((c) => c.tipo === "marcar_pagada").map((c) => c.cuotaId));
  const yaCanceladas = new Set(cambios.filter((c) => c.tipo === "marcar_cancelada").map((c) => c.cuotaId));
  for (const cancelacion of fuente.cancelaciones ?? []) {
    const { cuotaIds, motivo } = cuotasDeCancelacion(cancelacion, cuotas);
    for (const id of cuotaIds) {
      revisadas.add(id);
      if (pagadasAhora.has(id) || yaCanceladas.has(id)) continue;
      yaCanceladas.add(id);
      cambios.push({ cuotaId: id, tipo: "marcar_cancelada", motivo, fecha: cancelacion.fecha });
    }
  }

  return {
    pagos,
    cambios,
    revisadas: [...revisadas],
    totales: {
      confirmados: pagos.filter((p) => p.estado === "confirmado").length,
      aRevisar: pagos.filter((p) => p.estado === "a_revisar").length,
      noIdentificados: pagos.filter((p) => p.estado === "no_identificado").length,
      pagadas: cambios.filter((c) => c.tipo === "marcar_pagada").length,
      canceladas: cambios.filter((c) => c.tipo === "marcar_cancelada").length,
    },
  };
}
