import type { ZodType } from "zod";

export type AdjuntoIA = { nombre: string; tipoMime: string; contenido: Buffer };
export type EsfuerzoIA = "low" | "medium" | "high";
export type SolicitudIA = {
  system: string;
  mensaje: string;
  adjuntos?: AdjuntoIA[];
  maxTokens?: number;
  /** Sin modelo, el proveedor usa el suyo por defecto. */
  modelo?: string;
  esfuerzo?: EsfuerzoIA;
};
export type RespuestaIA = { texto: string; modelo: string; tokensEntrada: number; tokensSalida: number; costoUsd: number };
/** `datos` es el JSON tal como vino; quien llama lo valida con su esquema. */
export type RespuestaEstructuradaIA = RespuestaIA & { datos: unknown; rechazada: boolean };

// ---------- Conversación con herramientas (agentes que actúan) ----------

/** Una herramienta que la IA puede pedir: nombre, para qué sirve y el JSON Schema de su entrada. */
export type HerramientaIA = { nombre: string; descripcion: string; esquema: Record<string, unknown> };
export type LlamadaHerramientaIA = { id: string; nombre: string; entrada: unknown };
export type ResultadoHerramientaIA = { id: string; contenido: string; esError?: boolean };

/**
 * Un turno de la conversación. El del asistente guarda el contenido tal cual
 * lo devolvió el proveedor (con su razonamiento): se le devuelve sin tocar.
 */
export type TurnoIA = { rol: "usuario"; texto?: string; resultados?: ResultadoHerramientaIA[] } | { rol: "asistente"; contenido: unknown };

export type SolicitudConversacionIA = {
  system: string;
  herramientas: HerramientaIA[];
  turnos: TurnoIA[];
  modelo?: string;
  esfuerzo?: EsfuerzoIA;
  maxTokens?: number;
};

export type RespuestaConversacionIA = RespuestaIA & {
  llamadas: LlamadaHerramientaIA[];
  /** Lo que hay que agregar como turno del asistente. */
  contenido: unknown;
  rechazada: boolean;
  /** Se cortó por el tope de tokens. */
  cortada: boolean;
};

export interface ProveedorIA {
  generarEstructurado(solicitud: SolicitudIA, esquema: ZodType): Promise<RespuestaEstructuradaIA>;
  /** Un turno de una conversación con herramientas. Opcional: no todo proveedor lo tiene. */
  conversar?(solicitud: SolicitudConversacionIA): Promise<RespuestaConversacionIA>;
}

type Precio = { entrada: number; salida: number; largo?: { desdeTokens: number; entrada: number; salida: number } };

/** USD por millón de tokens, precios de lista de Anthropic. */
const PRECIOS_POR_MILLON: Record<string, Precio> = {
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5, largo: { desdeTokens: 100_000, entrada: 0.5, salida: 2.5 } },
  "claude-sonnet-5-5": { entrada: 2, salida: 10 },
  "claude-opus-5-5": { entrada: 4, salida: 20 },
  "claude-sonnet-4-6": { entrada: 3, salida: 15 },
};

/** Un modelo sin precio cargado se estima con el más caro, para que la cuota no quede corta. */
const PRECIO_DESCONOCIDO: Precio = { entrada: 4, salida: 20 };

/**
 * Con caché de prompts, la lectura cuesta el 10 % de la entrada y la
 * escritura el 125 %: se cuentan como tokens de entrada equivalentes.
 */
export function entradaEquivalente(uso: { entrada: number; escrituraCache?: number | null; lecturaCache?: number | null }): number {
  return Math.round(uso.entrada + (uso.escrituraCache ?? 0) * 1.25 + (uso.lecturaCache ?? 0) * 0.1);
}

export function estimarCostoIA(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const precio = PRECIOS_POR_MILLON[modelo] ?? PRECIO_DESCONOCIDO;
  const tramo = precio.largo && tokensEntrada > precio.largo.desdeTokens ? precio.largo : precio;
  return Number(((tokensEntrada * tramo.entrada + tokensSalida * tramo.salida) / 1_000_000).toFixed(6));
}
