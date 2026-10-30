import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { email } from "@/conexiones/email";
import type { ResultadoEnvio } from "@/conexiones/tipos";
import { whatsapp } from "@/conexiones/whatsapp";
import { obtenerCuenta } from "@/lib/datos";
import { conFirma } from "@/lib/plantillas";

/**
 * Envía un mensaje que el productor aprobó (o que es de un paso automático),
 * por la conexión de su canal, y lo deja registrado como enviado con el texto
 * final, ya firmado. Las llamadas no se envían: son tareas.
 */
export async function enviarMensaje(id: number, opciones: { texto?: string } = {}): Promise<ResultadoEnvio> {
  const [m] = await db.select().from(schema.mensajes).where(eq(schema.mensajes.id, id));
  if (!m || (m.estado !== "borrador" && m.estado !== "aprobado")) {
    return { ok: false, error: "Ese mensaje ya no está pendiente." };
  }
  if (m.canal === "llamada") return { ok: false, error: "Las llamadas no se envían: registrá cómo te fue." };
  // Los datos de ejemplo tienen teléfonos y correos inventados que pueden ser de alguien.
  if (m.esEjemplo) return { ok: false, error: "Es un mensaje de ejemplo: no sale por las conexiones reales." };
  const cuenta = await obtenerCuenta();
  const texto = conFirma(opciones.texto?.trim() || m.texto, cuenta.nombre);
  const para = m.destinatario ?? "";
  const resultado =
    m.canal === "whatsapp"
      ? await whatsapp.enviar({ para, texto })
      : await email.enviar({ para, asunto: m.asunto ?? "Mensaje de tu productor de seguros", texto, remitente: cuenta.nombre });
  if (!resultado.ok) return resultado;
  await db
    .update(schema.mensajes)
    .set({ estado: "enviado", texto, enviadoEl: new Date() })
    .where(eq(schema.mensajes.id, id));
  return resultado;
}

/** Envía varios; devuelve cuántos salieron. */
export async function enviarMensajes(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const pendientes = await db
    .select({ id: schema.mensajes.id })
    .from(schema.mensajes)
    .where(inArray(schema.mensajes.id, ids));
  let enviados = 0;
  for (const { id } of pendientes) if ((await enviarMensaje(id)).ok) enviados++;
  return enviados;
}
