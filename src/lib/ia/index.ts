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

export interface ProveedorIA {
  generarEstructurado(solicitud: SolicitudIA, esquema: ZodType): Promise<RespuestaEstructuradaIA>;
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

export function estimarCostoIA(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const precio = PRECIOS_POR_MILLON[modelo] ?? PRECIO_DESCONOCIDO;
  const tramo = precio.largo && tokensEntrada > precio.largo.desdeTokens ? precio.largo : precio;
  return Number(((tokensEntrada * tramo.entrada + tokensSalida * tramo.salida) / 1_000_000).toFixed(6));
}
