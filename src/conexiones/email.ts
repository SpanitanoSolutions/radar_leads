import "server-only";
import { guardarConexion, leerConexion } from "./estado";
import type { ResultadoEnvio } from "./tipos";

/**
 * Correo electrónico del productor (envío de avisos y reclamos, lectura de
 * liquidaciones y pedidos de cotización).
 *
 * Hoy es SIMULADO: no manda ni lee nada; guarda el estado en la tabla
 * conexiones. Lo va a reemplazar la API de Gmail (users.messages.send y
 * users.messages.list con OAuth; credenciales en GMAIL_CLIENT_ID,
 * GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN) o, para otros proveedores, SMTP
 * para enviar e IMAP para leer (EMAIL_SMTP_URL, EMAIL_IMAP_URL).
 */
export interface ConexionEmail {
  estado(): Promise<{ conectado: boolean; direccion?: string; proveedor?: string }>;
  conectar(direccion: string, proveedor: string): Promise<void>;
  desconectar(): Promise<void>;
  enviar(mensaje: { para: string; asunto: string; texto: string }): Promise<ResultadoEnvio>;
  /** Liquidaciones de comisiones que llegaron por email (el conciliador las lee). */
  liquidacionesRecibidas(): Promise<{ compania: string; periodo: string; adjunto: string }[]>;
}

export const emailSimulado: ConexionEmail = {
  async estado() {
    const fila = await leerConexion("email");
    return {
      conectado: fila?.estado === "conectado",
      direccion: fila?.datos.direccion ? String(fila.datos.direccion) : undefined,
      proveedor: fila?.datos.proveedor ? String(fila.datos.proveedor) : undefined,
    };
  },
  async conectar(direccion, proveedor) {
    await guardarConexion("email", "conectado", { direccion, proveedor });
  },
  async desconectar() {
    await guardarConexion("email", "sin_conectar");
  },
  async enviar() {
    return { ok: false, error: "El correo no está conectado a un servicio de envío real. El mensaje sigue pendiente." };
  },
  async liquidacionesRecibidas() {
    return [];
  },
};

export const email: ConexionEmail = emailSimulado;
