import "server-only";

/** Adaptador reemplazable. Esta versión registra la aprobación sin contactar a terceros. */
export interface AdaptadorSalidaCotizacion {
  enviarBorrador(entrada: { compania: string; asunto: string; cuerpo: string }): Promise<{ referencia: string; simulado: boolean }>;
}

export const adaptadorSalidaCotizacion: AdaptadorSalidaCotizacion = {
  async enviarBorrador({ compania }) {
    return { referencia: `simulado-${compania}-${Date.now()}`, simulado: true };
  },
};
