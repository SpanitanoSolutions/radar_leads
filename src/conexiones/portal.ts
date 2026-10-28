import "server-only";

export interface ConexionPortal {
  estado(compania: string): Promise<"conectado" | "sin_conectar" | "por_email">;
  conectar(compania: string, usuario: string): Promise<void>;
  porEmail(compania: string, email: string): Promise<void>;
  desconectar(compania: string): Promise<void>;
  pedirCotizacion(compania: string, pedido: {
    solicitudId: number;
    solicitudNumero: number;
    cliente: string;
    tipo: "renovacion" | "mejora" | "nueva";
    ramo: string;
    bien: string | null;
    motivo: string | null;
  }): Promise<{ referencia: string }>;
}

/** No se simula login: cada aseguradora requiere su API y autorización propias. */
export const portal: ConexionPortal = {
  async estado() {
    return "sin_conectar";
  },
  async conectar(compania) {
    throw new Error(`No se marcó ${compania} como conectada: falta su integración oficial y autorización de productor.`);
  },
  async porEmail(compania) {
    throw new Error(`No se guardó ${compania}: todavía no hay una dirección de cotizaciones verificada.`);
  },
  async desconectar() {},
  async pedirCotizacion(compania) {
    throw new Error(`No se envió la solicitud a ${compania}: todavía no hay un conector oficial configurado.`);
  },
};
