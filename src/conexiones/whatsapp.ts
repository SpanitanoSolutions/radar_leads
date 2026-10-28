import "server-only";
import { guardarConexion, leerConexion } from "./estado";
import type { ResultadoEnvio } from "./tipos";

export type PlantillaWhatsApp = { nombre: string; estado: "En revisión" | "Aprobada" | "Rechazada" };
export type EstadoWhatsApp = { paso: "sin_conectar" } | { paso: "conectado"; numero: string; plantillas: PlantillaWhatsApp[] };

export interface ConexionWhatsApp {
  estado(): Promise<EstadoWhatsApp>;
  conectar(): Promise<{ numero: string; nombre: string }>;
  desconectar(): Promise<void>;
  enviar(mensaje: { para: string; texto: string }): Promise<ResultadoEnvio>;
}

function configuracion() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  if (!token || !numeroId || !version) {
    throw new Error("Falta configurar WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_GRAPH_VERSION en el servidor.");
  }
  return { token, numeroId, version };
}

async function graph(path: string, init: RequestInit = {}) {
  const { token, version } = configuracion();
  const respuesta = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!respuesta.ok) throw new Error(cuerpo.error?.message || `Meta Graph respondió ${respuesta.status}.`);
  return cuerpo;
}

export const whatsapp: ConexionWhatsApp = {
  async estado() {
    const fila = await leerConexion("whatsapp");
    if (fila?.estado !== "conectado" || fila.datos.validadoReal !== true) return { paso: "sin_conectar" };
    try {
      configuracion();
    } catch {
      return { paso: "sin_conectar" };
    }
    const numero = String(fila.datos.numero ?? "");
    try {
      await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`);
    } catch {
      return { paso: "sin_conectar" };
    }
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!wabaId) return { paso: "conectado", numero, plantillas: [] };
    try {
      const respuesta = await graph(`${wabaId}/message_templates?fields=name,status&limit=100`);
      const filas = (respuesta as { data?: { name: string; status: string }[] }).data ?? [];
      return {
        paso: "conectado",
        numero,
        plantillas: filas.map((plantilla) => ({
          nombre: plantilla.name,
          estado: plantilla.status === "APPROVED" ? "Aprobada" : plantilla.status === "REJECTED" ? "Rechazada" : "En revisión",
        })),
      };
    } catch {
      return { paso: "conectado", numero, plantillas: [] };
    }
  },
  async conectar() {
    const { numeroId } = configuracion();
    const cuenta = (await graph(`${numeroId}?fields=display_phone_number,verified_name`)) as {
      display_phone_number?: string;
      verified_name?: string;
    };
    if (!cuenta.display_phone_number) throw new Error("Meta no devolvió un número de WhatsApp registrado.");
    await guardarConexion("whatsapp", "conectado", { numero: cuenta.display_phone_number, nombre: cuenta.verified_name ?? "", validadoReal: true });
    return { numero: cuenta.display_phone_number, nombre: cuenta.verified_name ?? "" };
  },
  async desconectar() {
    await guardarConexion("whatsapp", "sin_conectar");
  },
  async enviar({ para, texto }) {
    try {
      const fila = await leerConexion("whatsapp");
      if (fila?.estado !== "conectado" || fila.datos.validadoReal !== true) return { ok: false, error: "WhatsApp Business no está conectado." };
      const { numeroId } = configuracion();
      const destino = para.replace(/\D/g, "");
      if (destino.length < 10) return { ok: false, error: "El teléfono de destino no tiene un formato válido." };
      const plantilla = process.env.WHATSAPP_TEMPLATE_NAME;
      const mensaje = plantilla
        ? {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: destino,
            type: "template",
            template: {
              name: plantilla,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es_AR" },
              components: [{ type: "body", parameters: [{ type: "text", text: texto.slice(0, 1024) }] }],
            },
          }
        : { messaging_product: "whatsapp", recipient_type: "individual", to: destino, type: "text", text: { body: texto } };
      const respuesta = (await graph(`${numeroId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mensaje),
      })) as { messages?: { id?: string }[] };
      const id = respuesta.messages?.[0]?.id;
      return id ? { ok: true, id } : { ok: false, error: "Meta no confirmó el envío del mensaje." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "No se pudo enviar el mensaje por WhatsApp." };
    }
  },
};
