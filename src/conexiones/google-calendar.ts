import "server-only";
import { borrarCredenciales, leerCredenciales, tokenVigente } from "./secretos";
import { leerConexion } from "./estado";

export interface ConexionCalendario {
  conectado(): Promise<boolean>;
  conectar(calendario: string): Promise<void>;
  desconectar(): Promise<void>;
  crearEvento(evento: { titulo: string; dia: string; detalle?: string }): Promise<{ id: string } | null>;
}

export const calendario: ConexionCalendario = {
  async conectado() {
    const fila = await leerConexion("google_calendar");
    return fila?.estado === "conectado" && Boolean(await leerCredenciales("google_calendar"));
  },
  async conectar() {
    throw new Error("Conectá Google Calendar desde el botón Autorizar con Google.");
  },
  async desconectar() {
    await borrarCredenciales("google_calendar");
  },
  async crearEvento(evento) {
    if (!(await this.conectado())) throw new Error("Google Calendar no está conectado.");
    const accessToken = await tokenVigente("google_calendar", "google");
    const fin = new Date(`${evento.dia}T00:00:00Z`);
    fin.setUTCDate(fin.getUTCDate() + 1);
    const respuesta = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: evento.titulo,
        description: evento.detalle,
        start: { date: evento.dia },
        end: { date: fin.toISOString().slice(0, 10) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!respuesta.ok) throw new Error(`Google Calendar respondió ${respuesta.status}.`);
    const resultado = (await respuesta.json()) as { id?: string };
    return resultado.id ? { id: resultado.id } : null;
  },
};
