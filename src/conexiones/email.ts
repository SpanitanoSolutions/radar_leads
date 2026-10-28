import "server-only";
import { borrarCredenciales, leerCredenciales, tokenVigente } from "./secretos";
import { leerConexion } from "./estado";
import type { ResultadoEnvio } from "./tipos";

export interface ConexionEmail {
  estado(): Promise<{ conectado: boolean; direccion?: string; proveedor?: string }>;
  conectar(direccion: string, proveedor: string): Promise<void>;
  desconectar(): Promise<void>;
  enviar(mensaje: { para: string; asunto: string; texto: string }): Promise<ResultadoEnvio>;
  liquidacionesRecibidas(): Promise<{ compania: string; periodo: string; adjunto: string }[]>;
}

async function gmail(path: string, init: RequestInit = {}) {
  const accessToken = await tokenVigente("email", "google");
  const respuesta = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) throw new Error(`Gmail respondió ${respuesta.status}.`);
  return respuesta;
}

function base64url(valor: string) {
  return Buffer.from(valor, "utf8").toString("base64url");
}

function hallarAdjuntos(partes: GmailParte[] = []): GmailParte[] {
  return partes.flatMap((parte) => [
    ...(parte.filename && parte.body?.attachmentId ? [parte] : []),
    ...hallarAdjuntos(parte.parts ?? []),
  ]);
}

type GmailParte = { filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string }; parts?: GmailParte[] };

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
  async enviar(mensaje: { para: string; asunto: string; texto: string }): Promise<ResultadoEnvio> {
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
        `From: ${direccion}`,
        `Subject: =?UTF-8?B?${Buffer.from(asunto).toString("base64")}?=`,
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
  async liquidacionesRecibidas() {
    const listado = (await gmail("messages?q=has%3Aattachment+newer_than%3A90d&maxResults=30").then((r) => r.json())) as {
      messages?: { id: string }[];
    };
    const salidas: { compania: string; periodo: string; adjunto: string }[] = [];
    for (const mensaje of listado.messages ?? []) {
      const completo = (await gmail(`messages/${mensaje.id}?format=full`).then((r) => r.json())) as {
        internalDate?: string;
        payload?: { headers?: { name: string; value: string }[]; parts?: GmailParte[] };
      };
      const cabecera = (nombre: string) => completo.payload?.headers?.find((h) => h.name.toLowerCase() === nombre)?.value ?? "";
      const asunto = cabecera("subject");
      const fecha = completo.internalDate ? new Date(Number(completo.internalDate)).toISOString().slice(0, 7) : "";
      for (const parte of hallarAdjuntos(completo.payload?.parts)) {
        const idAdjunto = parte.body?.attachmentId;
        if (!idAdjunto) continue;
        const recurso = (await gmail(`messages/${mensaje.id}/attachments/${idAdjunto}`).then((r) => r.json())) as { data?: string };
        salidas.push({
          compania: cabecera("from").split(/[<@]/)[0].trim() || "Compañía",
          periodo: fecha || asunto,
          adjunto: `base64:${parte.filename}:${recurso.data ?? ""}`,
        });
      }
    }
    return salidas;
  },
};
