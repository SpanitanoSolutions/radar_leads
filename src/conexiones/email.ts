import "server-only";
import { borrarCredenciales, leerCredenciales, tokenVigente } from "./secretos";
import { leerConexion } from "./estado";
import type { ResultadoEnvio } from "./tipos";

export type MensajeEmail = {
  para: string;
  asunto: string;
  texto: string;
  /** Nombre que ve quien lo recibe, al lado de la dirección conectada. */
  remitente?: string | null;
};

export interface ConexionEmail {
  estado(): Promise<{ conectado: boolean; direccion?: string; proveedor?: string }>;
  conectar(direccion: string, proveedor: string): Promise<void>;
  desconectar(): Promise<void>;
  enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio>;
}

async function gmail(path: string, init: RequestInit = {}) {
  const pedir = async (renovar: boolean) =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await tokenVigente("email", "google", renovar)}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
  let respuesta = await pedir(false);
  // 401: el token se revocó antes de vencer. Renovarlo dice si la autorización sigue en pie.
  if (respuesta.status === 401) respuesta = await pedir(true);
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: { message?: string } };
    if (respuesta.status === 403) throw new Error("Google no dio permiso para enviar correos con esta cuenta. Volvé a autorizar Gmail.");
    throw new Error(`Gmail respondió ${respuesta.status}${cuerpo.error?.message ? `: ${cuerpo.error.message}` : "."}`);
  }
  return respuesta;
}

function base64url(valor: string) {
  return Buffer.from(valor, "utf8").toString("base64url");
}

/** Encabezado con texto que puede tener acentos (RFC 2047). */
function encabezado(valor: string) {
  return `=?UTF-8?B?${Buffer.from(valor, "utf8").toString("base64")}?=`;
}

/** "Juan Pérez <juan@gmail.com>", o solo la dirección si no hay nombre. */
export function remitenteDe(direccion: string, nombre?: string | null) {
  const limpio = nombre?.replace(/[\r\n"<>]+/g, " ").trim();
  return limpio ? `${encabezado(limpio)} <${direccion}>` : direccion;
}

export const email = {
  async estado() {
    const fila = await leerConexion("email");
    return {
      conectado: fila?.estado === "conectado" && Boolean(await leerCredenciales("email")),
      direccion: fila?.datos.direccion ? String(fila.datos.direccion) : undefined,
      proveedor: fila?.datos.proveedor ? String(fila.datos.proveedor) : undefined,
    };
  },
  async conectar() {
    throw new Error("Conectá Gmail desde el botón Autorizar con Google.");
  },
  async desconectar() {
    await borrarCredenciales("email");
  },
  async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
    try {
      const fila = await leerConexion("email");
      if (fila?.estado !== "conectado") return { ok: false, error: "Gmail no está conectado." };
      const credenciales = await leerCredenciales("email");
      if (!credenciales) return { ok: false, error: "Gmail necesita autorización. Volvé a conectarlo." };
      const direccion = String(fila.datos.direccion ?? "");
      const destinatario = mensaje.para.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return { ok: false, error: "El destinatario no es una direccion de email valida." };
      const asunto = mensaje.asunto.replace(/[\r\n]+/g, " ");
      const raw = [
        `To: ${destinatario}`,
        `From: ${remitenteDe(direccion, mensaje.remitente)}`,
        `Subject: ${encabezado(asunto)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(mensaje.texto, "utf8").toString("base64"),
      ].join("\r\n");
      const respuesta = await gmail("messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: base64url(raw) }),
      });
      const resultado = (await respuesta.json()) as { id?: string };
      return resultado.id ? { ok: true, id: resultado.id } : { ok: false, error: "Gmail no devolvió un identificador de envío." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "No se pudo enviar por Gmail." };
    }
  },
};
