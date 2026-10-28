export type SolicitudIA = { system: string; mensaje: string; maxTokens?: number };
export type RespuestaIA = { texto: string; modelo: string; tokensEntrada: number; tokensSalida: number; costoUsd: number };

export interface ProveedorIA {
  generar(solicitud: SolicitudIA): Promise<RespuestaIA>;
}

export function estimarCostoIA(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const preciosPorMillon: Record<string, [number, number]> = {
    "claude-haiku-5-5": [0.1, 0.5],
    "claude-sonnet-4-6": [3, 15],
  };
  const [entrada, salida] = preciosPorMillon[modelo] ?? [0, 0];
  return Number(((tokensEntrada * entrada + tokensSalida * salida) / 1_000_000).toFixed(6));
}
