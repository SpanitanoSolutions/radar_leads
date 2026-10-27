import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { enviarMensaje } from "@/agentes/envio";
import type { FilaConciliacion } from "@/lib/conciliacion";

/** Envía el reclamo aprobado por email simulado y deja registro de actividad. */
export async function enviarReclamoComision(datos: { fila: FilaConciliacion; asunto: string; texto: string }) {
  const [compania] = await db.select().from(schema.companias).where(eq(schema.companias.nombre, datos.fila.compania));
  const destinatario = compania?.emailComisiones ?? `Comisiones ${datos.fila.compania}`;
  const [mensaje] = await db
    .insert(schema.mensajes)
    .values({
      canal: "email",
      destinatario,
      asunto: datos.asunto,
      texto: datos.texto,
      agente: "conciliador",
      motivo: `Diferencias en la liquidación de ${datos.fila.periodo}`,
      referencia: `conciliacion:${datos.fila.periodo}:${datos.fila.compania}`,
    })
    .returning({ id: schema.mensajes.id });
  const resultado = await enviarMensaje(mensaje.id);
  if (!resultado.ok) return resultado;
  await db.insert(schema.actividadAgentes).values({
    agente: "conciliador",
    referencia: `conciliacion:${datos.fila.periodo}:${datos.fila.compania}`,
    texto: `Enviaste un reclamo a ${datos.fila.compania} por la liquidación de ${datos.fila.periodo}.`,
  });
  return resultado;
}