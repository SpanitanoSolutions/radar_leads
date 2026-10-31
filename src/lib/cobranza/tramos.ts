import type { TramoCobranza } from "./tipos";

// Tramos de seguimiento ("tiers" en la spec): según los días que faltan para
// el vencimiento (negativo = vencido), el agente usa unas instrucciones u
// otras. Se calculan al momento, nunca se guardan en el caso.

export const TRAMOS_POR_DEFECTO: TramoCobranza[] = [
  { id: "por_vencer_lejos", nombre: "Por vencer en más de 15 días", minDias: 16, maxDias: null, instrucciones: null },
  { id: "por_vencer", nombre: "Por vencer entre 0 y 15 días", minDias: 0, maxDias: 15, instrucciones: null },
  { id: "vencido_reciente", nombre: "Vencido entre 1 y 14 días", minDias: -14, maxDias: -1, instrucciones: null },
  { id: "vencido_urgente", nombre: "Vencido entre 15 y 24 días", minDias: -24, maxDias: -15, instrucciones: null },
  { id: "vencido_critico", nombre: "Vencido más de 24 días", minDias: null, maxDias: -25, instrucciones: null },
];

export function enTramo(dias: number, tramo: Pick<TramoCobranza, "minDias" | "maxDias">): boolean {
  return (tramo.minDias === null || dias >= tramo.minDias) && (tramo.maxDias === null || dias <= tramo.maxDias);
}

/** El primer tramo de la lista que incluye esos días; null si ninguno. */
export function tramoDe(dias: number, tramos: TramoCobranza[]): TramoCobranza | null {
  return tramos.find((t) => enTramo(dias, t)) ?? null;
}

const dias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

/** El rango en palabras: "vence en 0 a 15 días", "vencido hace 25 días o más". */
export function rangoDeTramo(t: Pick<TramoCobranza, "minDias" | "maxDias">): string {
  const { minDias: min, maxDias: max } = t;
  if (min === null && max === null) return "cualquier vencimiento";
  if (min !== null && min >= 0) return max === null ? `vence en ${dias(min)} o más` : min === max ? `vence en ${dias(min)}` : `vence en ${min} a ${dias(max)}`;
  if (max !== null && max < 0) return min === null ? `vencido hace ${dias(-max)} o más` : min === max ? `vencido hace ${dias(-max)}` : `vencido hace ${-max} a ${dias(-min)}`;
  if (min === null) return `hasta ${max === 0 ? "el día del vencimiento" : `${dias(max!)} antes`}`;
  return `de ${dias(-min)} vencido a ${max === null ? "cualquier fecha" : `${dias(max)} antes`}`;
}

/** Id corto para un tramo nuevo, distinto de los que ya hay. */
export function idParaTramo(nombre: string, existentes: string[]): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "tramo";
  let id = base;
  for (let i = 2; existentes.includes(id); i++) id = `${base}_${i}`;
  return id;
}
