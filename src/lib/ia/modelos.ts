import type { EsfuerzoIA } from "./index";

/** Qué tipo de trabajo le pide un agente a la IA. El modelo sale de acá, no del agente. */
export type TareaIA = "extraer" | "clasificar" | "normalizar" | "mapear" | "redactar" | "explicar" | "analizar" | "portal";

export const MODELO_HAIKU = "claude-haiku-5-5";
export const MODELO_SONNET = "claude-sonnet-5-5";

type PlanBase = { modelo: string; esfuerzo: EsfuerzoIA; maxTokens: number };

const PLAN_POR_TAREA: Record<TareaIA, PlanBase> = {
  extraer: { modelo: MODELO_HAIKU, esfuerzo: "medium", maxTokens: 16_000 },
  clasificar: { modelo: MODELO_HAIKU, esfuerzo: "low", maxTokens: 4_000 },
  normalizar: { modelo: MODELO_HAIKU, esfuerzo: "low", maxTokens: 16_000 },
  mapear: { modelo: MODELO_HAIKU, esfuerzo: "medium", maxTokens: 8_000 },
  redactar: { modelo: MODELO_HAIKU, esfuerzo: "low", maxTokens: 4_000 },
  explicar: { modelo: MODELO_SONNET, esfuerzo: "medium", maxTokens: 8_000 },
  analizar: { modelo: MODELO_SONNET, esfuerzo: "high", maxTokens: 16_000 },
  portal: { modelo: MODELO_SONNET, esfuerzo: "medium", maxTokens: 16_000 },
};

export type PlanIA = PlanBase & {
  /** Si la salida no pasa la validación, se reintenta una vez con este modelo. */
  modeloReintento: string | null;
};

/**
 * Modelo, esfuerzo y tope de tokens de una tarea. `modeloConfigurado` (de
 * ia_configuracion) pisa el modelo por defecto. Solo se reintenta cuando el
 * primer intento fue con Haiku: el reintento es con Sonnet 5.5.
 */
export function planDeTarea(tarea: TareaIA, modeloConfigurado?: string | null): PlanIA {
  const base = PLAN_POR_TAREA[tarea];
  const modelo = modeloConfigurado?.trim() || base.modelo;
  return { ...base, modelo, modeloReintento: modelo.startsWith("claude-haiku") ? MODELO_SONNET : null };
}
