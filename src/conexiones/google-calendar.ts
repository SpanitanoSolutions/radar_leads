import "server-only";
import { guardarConexion, leerConexion } from "./estado";

/**
 * Google Calendar: vencimientos, recordatorios de leads y reuniones en el
 * calendario del productor.
 *
 * Hoy es SIMULADO: guarda qué calendario eligió y no crea eventos. Lo va a
 * reemplazar la API de Google Calendar (events.insert con OAuth; credenciales
 * en GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET y
 * GOOGLE_CALENDAR_REFRESH_TOKEN).
 */
export interface ConexionCalendario {
  conectado(): Promise<boolean>;
  conectar(calendario: string): Promise<void>;
  desconectar(): Promise<void>;
  crearEvento(evento: { titulo: string; dia: string; detalle?: string }): Promise<{ id: string } | null>;
}

export const calendarioSimulado: ConexionCalendario = {
  async conectado() {
    return (await leerConexion("google_calendar"))?.estado === "conectado";
  },
  async conectar(calendario) {
    await guardarConexion("google_calendar", "conectado", { calendario });
  },
  async desconectar() {
    await guardarConexion("google_calendar", "sin_conectar");
  },
  async crearEvento() {
    return null;
  },
};

export const calendario: ConexionCalendario = calendarioSimulado;
