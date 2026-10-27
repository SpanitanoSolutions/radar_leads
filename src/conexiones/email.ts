import "server-only";
import type { ResultadoEnvio } from "./tipos";

/**
 * Correo electrónico del productor (envío de avisos y reclamos, lectura de
 * liquidaciones y pedidos de cotización).
 *
 * Hoy es SIMULADO: no manda ni lee nada. Lo va a reemplazar la API de Gmail
 * (users.messages.send y users.messages.list con OAuth, credenciales en
 * GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN) o, para otros
 * proveedores, SMTP para enviar e IMAP para leer (EMAIL_SMTP_URL, EMAIL_IMAP_URL).
 */
export interface ConexionEmail {
  enviar(mensaje: { para: string; asunto: string; texto: string }): Promise<ResultadoEnvio>;
  /** Liquidaciones de comisiones que llegaron por email (el conciliador las lee). */
  liquidacionesRecibidas(): Promise<{ compania: string; periodo: string; adjunto: string }[]>;
}

export const emailSimulado: ConexionEmail = {
  async enviar() {
    return { ok: true, id: `email-simulado-${Date.now()}` };
  },
  async liquidacionesRecibidas() {
    return [];
  },
};

export const email: ConexionEmail = emailSimulado;
