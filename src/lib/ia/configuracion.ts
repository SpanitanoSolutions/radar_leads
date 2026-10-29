import { diaEnArgentina } from "@/lib/fechas";

/** En `agente` u `operacion`, vale para todos. */
export const COMODIN = "*";

/** Una fila de ia_configuracion. */
export type FilaConfiguracionIA = {
  agente: string;
  operacion: string;
  proveedor: string | null;
  modelo: string | null;
  activa: boolean;
  limiteCostoUsd: number | null;
  limiteTokensMes: number | null;
  orgId: string | null;
  producerId: string | null;
};

export type AlcanceIA = { agente: string; operacion: string; orgId: string | null; producerId: string | null };

export type LimiteIA = {
  agente: string;
  operacion: string;
  /** El consumo se mide por productor; si no, por organización. */
  porProductor: boolean;
  costoUsd: number | null;
  tokensMes: number | null;
};

export type ConfiguracionIA = { activa: boolean; proveedor: string | null; modelo: string | null; limites: LimiteIA[] };
export type ConsumoIA = { costoUsd: number; tokens: number };

/** Qué filas de ia_uso cuentan para un límite. `null` = sin filtrar por ese campo. */
export type FiltroConsumoIA = { agente: string | null; operacion: string | null; orgId: string | null; producerId: string | null; porProductor: boolean };

function aplica(fila: FilaConfiguracionIA, alcance: AlcanceIA): boolean {
  return (fila.agente === COMODIN || fila.agente === alcance.agente)
    && (fila.operacion === COMODIN || fila.operacion === alcance.operacion)
    && (fila.orgId === null || fila.orgId === alcance.orgId)
    && (fila.producerId === null || fila.producerId === alcance.producerId);
}

/** Primero pesa el alcance (productor > organización > plataforma); después, agente y operación exactos. */
function especificidad(fila: FilaConfiguracionIA): number {
  const nivel = fila.producerId ? 2 : fila.orgId ? 1 : 0;
  return nivel * 4 + (fila.agente !== COMODIN ? 2 : 0) + (fila.operacion !== COMODIN ? 1 : 0);
}

/**
 * Resuelve la configuración en cascada plataforma → organización → productor.
 * La fila más específica decide si la IA está activa (una organización puede
 * apagarla aunque la plataforma la tenga prendida). Proveedor y modelo salen
 * de la fila más específica que los tenga cargados. Para los límites, por cada
 * combinación de agente y operación gana la fila más específica con límite:
 * así la plataforma fija la cuota por defecto de cada organización y la
 * organización o el productor la pisan.
 */
export function resolverConfiguracion(filas: FilaConfiguracionIA[], alcance: AlcanceIA): ConfiguracionIA {
  const aplicables = filas.filter((fila) => aplica(fila, alcance)).sort((a, b) => especificidad(b) - especificidad(a));
  const primeroCon = (campo: "proveedor" | "modelo") => aplicables.find((fila) => fila[campo]?.trim())?.[campo]?.trim() ?? null;
  const limites = new Map<string, LimiteIA>();
  for (const fila of aplicables) {
    if (fila.limiteCostoUsd === null && fila.limiteTokensMes === null) continue;
    const clave = `${fila.agente}|${fila.operacion}`;
    if (limites.has(clave)) continue;
    limites.set(clave, {
      agente: fila.agente,
      operacion: fila.operacion,
      porProductor: fila.producerId !== null,
      costoUsd: fila.limiteCostoUsd,
      tokensMes: fila.limiteTokensMes,
    });
  }
  return { activa: aplicables[0]?.activa ?? false, proveedor: primeroCon("proveedor"), modelo: primeroCon("modelo"), limites: [...limites.values()] };
}

/** La cuota es por organización (o por productor si el límite es suyo), aunque el límite venga de la plataforma. */
export function filtroDeConsumo(limite: LimiteIA, alcance: AlcanceIA): FiltroConsumoIA {
  return {
    agente: limite.agente === COMODIN ? null : limite.agente,
    operacion: limite.operacion === COMODIN ? null : limite.operacion,
    orgId: alcance.orgId,
    producerId: limite.porProductor ? alcance.producerId : null,
    porProductor: limite.porProductor,
  };
}

/** Devuelve el primer límite alcanzado, o null si hay margen. */
export function limiteAlcanzado(consumos: { limite: LimiteIA; consumo: ConsumoIA }[]): LimiteIA | null {
  return consumos.find(({ limite, consumo }) =>
    (limite.costoUsd !== null && consumo.costoUsd >= limite.costoUsd)
    || (limite.tokensMes !== null && consumo.tokens >= limite.tokensMes))?.limite ?? null;
}

/** Comienzo del mes calendario en hora argentina (UTC−3, sin horario de verano). */
export function inicioDelMes(ahora: Date): Date {
  const [anio, mes] = diaEnArgentina(ahora).split("-");
  return new Date(`${anio}-${mes}-01T00:00:00-03:00`);
}
