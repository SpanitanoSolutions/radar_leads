import type { NotificacionesValidador } from "@/db/schema";

// Configuración del Validador en cascada plataforma → organización →
// productor: cada campo sale de la fila más específica que lo tenga cargado;
// si ninguna lo tiene, del valor por defecto.

export type Frecuencia = "diaria" | "semanal" | "mensual";

export type ConfigValidador = {
  frecuencia: Frecuencia;
  horaEjecucion: string;
  horaEnriquecimiento: string;
  zonaHoraria: string;
  toleranciaMonto: number;
  graciaHabilitada: boolean;
  notificaciones: NotificacionesValidador;
};

/** Una fila de validador_config: null hereda del nivel de arriba. */
export type FilaConfigValidador = {
  [K in keyof ConfigValidador]: K extends "frecuencia" ? string | null : ConfigValidador[K] | null;
} & { orgId: string | null; producerId: string | null };

export const CONFIG_POR_DEFECTO: ConfigValidador = {
  frecuencia: "diaria",
  horaEjecucion: "07:00",
  horaEnriquecimiento: "08:00",
  zonaHoraria: "America/Argentina/Buenos_Aires",
  toleranciaMonto: 1,
  graciaHabilitada: true,
  notificaciones: {},
};

const FRECUENCIAS: Frecuencia[] = ["diaria", "semanal", "mensual"];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Los valores que no se entienden se ignoran: hereda el nivel de arriba. */
function valido<K extends keyof ConfigValidador>(campo: K, valor: unknown): valor is ConfigValidador[K] {
  if (valor === null || valor === undefined) return false;
  if (campo === "frecuencia") return FRECUENCIAS.includes(valor as Frecuencia);
  if (campo === "horaEjecucion" || campo === "horaEnriquecimiento") return typeof valor === "string" && HORA.test(valor);
  if (campo === "zonaHoraria") return typeof valor === "string" && valor.trim() !== "";
  if (campo === "toleranciaMonto") return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
  return true;
}

export function resolverConfigValidador(filas: FilaConfigValidador[], alcance: { orgId: string | null; producerId: string | null }): ConfigValidador {
  const nivel = (f: FilaConfigValidador) => (f.producerId ? 2 : f.orgId ? 1 : 0);
  const aplicables = filas
    .filter((f) => (f.orgId === null || f.orgId === alcance.orgId) && (f.producerId === null || f.producerId === alcance.producerId))
    .sort((a, b) => nivel(b) - nivel(a));
  const resuelta = { ...CONFIG_POR_DEFECTO };
  for (const campo of Object.keys(CONFIG_POR_DEFECTO) as (keyof ConfigValidador)[]) {
    const fila = aplicables.find((f) => valido(campo, f[campo]));
    if (fila) (resuelta as Record<string, unknown>)[campo] = fila[campo];
  }
  return resuelta;
}
