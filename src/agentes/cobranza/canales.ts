import "server-only";
import { email } from "@/conexiones/email";
import { leerConexion } from "@/conexiones/estado";
import { whatsapp } from "@/conexiones/whatsapp";
import { NOMBRE_CANAL } from "@/lib/cobranza/configuracion";
import type { CanalCobranza } from "@/lib/cobranza/tipos";

// Canales de salida de Cobranza ("ChannelProvider" en la spec). El real es la
// conexión de UNIQO (Gmail, WhatsApp Business); el simulado no manda nada y
// solo se usa en modo prueba. En modo real, sin conexión el envío falla: nunca
// se finge un mensaje que no salió. Las llamadas no tienen proveedor todavía.

export type EstadoCanales = Record<CanalCobranza, { conectado: boolean; remitente: string | null }>;

export type EnvioCanal = { para: string | null; asunto?: string; texto: string; remitente?: string | null };

export type ResultadoCanal = { ok: true; simulado: boolean; id: string } | { ok: false; error: string };

/** Qué canales tienen una conexión real que anda (sin llamar a la red). */
export async function estadoCanales(): Promise<EstadoCanales> {
  const [w, e] = await Promise.all([leerConexion("whatsapp"), leerConexion("email")]);
  const whatsappListo =
    w?.estado === "conectado" && w.datos.validadoReal === true && Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const emailListo = e?.estado === "conectado" && typeof e.datos.credencialesCifradas === "string";
  return {
    whatsapp: { conectado: whatsappListo, remitente: whatsappListo && w?.datos.numero ? String(w.datos.numero) : null },
    email: { conectado: emailListo, remitente: emailListo && e?.datos.direccion ? String(e.datos.direccion) : null },
    telefono: { conectado: false, remitente: null },
  };
}

let secuencia = 0;
const idSimulado = (canal: CanalCobranza) => `simulado-${canal}-${Date.now()}-${++secuencia}`;

/**
 * Manda un mensaje por el canal. Con la conexión real y un destino, sale de
 * verdad (en modo prueba, al destino de prueba). Si no, en modo prueba se
 * simula; en modo real es un error.
 */
export async function enviarPorCanal(canal: CanalCobranza, envio: EnvioCanal, opciones: { modoPrueba: boolean; estado: EstadoCanales }): Promise<ResultadoCanal> {
  if (canal === "telefono") {
    return opciones.modoPrueba ? { ok: true, simulado: true, id: idSimulado(canal) } : { ok: false, error: "Todavía no hay un proveedor de llamadas: la llamada queda como tarea para vos." };
  }
  const conexion = opciones.estado[canal];
  if (conexion.conectado && envio.para) {
    const r =
      canal === "whatsapp"
        ? await whatsapp.enviar({ para: envio.para, texto: envio.texto })
        : await email.enviar({ para: envio.para, asunto: envio.asunto ?? "Tu seguro", texto: envio.texto, remitente: envio.remitente });
    return r.ok ? { ok: true, simulado: false, id: r.id } : { ok: false, error: r.error };
  }
  if (opciones.modoPrueba) return { ok: true, simulado: true, id: idSimulado(canal) };
  if (!envio.para) return { ok: false, error: `El asegurado no tiene ${canal === "email" ? "correo" : "teléfono"}.` };
  return { ok: false, error: `${NOMBRE_CANAL[canal]} no está conectado (Configuración → Conexiones).` };
}
