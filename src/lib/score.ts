import type { Prioridad } from "@/db/schema";

/** Cuánto suma o resta la prioridad que el productor le da a cada sector. */
export const AJUSTE_POR_PRIORIDAD: Record<Prioridad, number> = {
  alta: 5,
  media: 0,
  baja: -15,
};

/** `ajuste`: otras correcciones del día, como la antigüedad del evento (ver lib/evento.ts). */
export function scoreFinal(scoreBase: number, prioridad: Prioridad, ajuste = 0): number {
  const valor = scoreBase + AJUSTE_POR_PRIORIDAD[prioridad] + ajuste;
  return Math.max(0, Math.min(100, Math.round(valor)));
}

export type NivelScore = "alto" | "medio" | "bajo";

export function nivelScore(score: number): NivelScore {
  if (score >= 80) return "alto";
  if (score >= 65) return "medio";
  return "bajo";
}
