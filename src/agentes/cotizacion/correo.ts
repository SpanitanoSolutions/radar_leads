import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { enviarMensaje } from "@/agentes/envio";
import { destinatarioCotizacion, estadoTrasEnvio, motivoSinEnviar } from "@/lib/cotizacion/correo";
import { calcularProximoSeguimiento } from "@/lib/cotizacion/seguimientos";
import { provinciaValida } from "@/lib/provincias";

// El correo a la compañía sale por la salida común (src/agentes/envio.ts):
// solo con el correo de la cuenta conectado. Si no, queda aprobado y sin
// enviar, la pantalla dice por qué y se puede volver a intentar.

const AGENTE = "cotizacion";
type Envio = typeof schema.cotizacionEnvios.$inferSelect;
type Mensaje = typeof schema.mensajes.$inferSelect;

export type ResultadoCorreo = { enviado: true; solicitudId: number } | { enviado: false; solicitudId: number; motivo: string };

const referenciaDe = (envioId: number) => `cotizacion:envio:${envioId}`;

async function destinatarioDe(envio: Envio): Promise<string | null> {
  const t = schema.cotizacionAseguradoras;
  const [aseguradora] = await db.select({ contactos: t.contactos }).from(t)
    .where(envio.aseguradoraId != null ? or(eq(t.id, envio.aseguradoraId), eq(t.nombre, envio.compania)) : eq(t.nombre, envio.compania))
    .limit(1);
  return destinatarioCotizacion(aseguradora?.contactos ?? []);
}

/** Manda el mensaje ya aprobado y deja el envío como corresponde: enviado, o aprobado y sin enviar con el motivo. */
async function enviar(envio: Envio, mensaje: Mensaje): Promise<ResultadoCorreo> {
  const r = await enviarMensaje(mensaje.id);
  const ahora = new Date();
  const [solicitud] = await db.select({ numero: schema.solicitudesCotizacion.numero, ramo: schema.solicitudesCotizacion.ramo })
    .from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, envio.solicitudId));
  const referencia = `solicitud:${solicitud?.numero ?? envio.solicitudId}`;
  if (!r.ok) {
    const motivo = motivoSinEnviar(r.error, mensaje.destinatario);
    // Sin próximo seguimiento: el cron no prepara otro mientras este no salga.
    await db.update(schema.cotizacionEnvios).set({
      ultimoError: motivo, proximoSeguimiento: null, ultimaActividad: ahora,
      intentos: [...envio.intentos, { canal: "correo", resultado: "error", codigo: "sin_enviar", detalle: motivo, fecha: ahora.toISOString() }],
    }).where(eq(schema.cotizacionEnvios.id, envio.id));
    await db.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId: envio.id, actor: "agente", tipo: "correo_sin_enviar", detalle: `El correo a ${envio.compania} está aprobado, pero no salió. ${motivo}` });
    await db.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia, texto: `El correo a ${envio.compania} está aprobado, pero no salió: falta conectar el correo o el contacto de la compañía.` });
    return { enviado: false, solicitudId: envio.solicitudId, motivo };
  }
  const [[config], [ajustes]] = await Promise.all([
    db.select().from(schema.cotizacionConfig).limit(1),
    db.select({ provincia: schema.ajustes.provincia }).from(schema.ajustes).where(eq(schema.ajustes.id, 1)),
  ]);
  const siguiente = estadoTrasEnvio(envio, config?.maxSeguimientos ?? 3);
  const proximoSeguimiento = siguiente.programarSeguimiento && solicitud
    ? calcularProximoSeguimiento(ahora, solicitud.ramo, config?.estrategiaSeguimiento ?? "Cada 3 días hábiles", { provincia: provinciaValida(ajustes?.provincia) })
    : null;
  await db.update(schema.cotizacionEnvios).set({
    estado: siguiente.estado, cantidadSeguimientos: siguiente.cantidadSeguimientos, proximoSeguimiento,
    canalUsado: "correo", ultimoError: null, ultimaActividad: ahora,
    intentos: [...envio.intentos, { canal: "correo", resultado: "enviado", fecha: ahora.toISOString() }],
  }).where(eq(schema.cotizacionEnvios.id, envio.id));
  await db.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId: envio.id, actor: "agente", tipo: "correo_enviado", detalle: `Salió el correo a ${envio.compania} desde tu correo conectado.` });
  if (siguiente.estado === "requiere_atencion") {
    await db.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId: envio.id, actor: "agente", tipo: "seguimientos_agotados", detalle: `Se alcanzó el máximo de seguimientos para ${envio.compania}; requiere atención del productor.` });
  }
  await db.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia, texto: `Salió el correo a ${envio.compania} que aprobaste.` });
  return { enviado: true, solicitudId: envio.solicitudId };
}

/**
 * El productor aprueba el borrador del correo (el pedido o un seguimiento).
 * La aprobación queda aunque el correo no salga. Devuelve null si el borrador
 * ya no está pendiente.
 */
export async function aprobarCorreoCotizacion(envioId: number): Promise<ResultadoCorreo | null> {
  const [envio] = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, envioId));
  if (!envio || envio.estadoBorrador !== "pendiente" || !envio.asuntoBorrador || !envio.cuerpoBorrador) return null;
  const [solicitud] = await db.select({ aseguradoId: schema.solicitudesCotizacion.aseguradoId, esEjemplo: schema.solicitudesCotizacion.esEjemplo })
    .from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, envio.solicitudId));
  const destinatario = await destinatarioDe(envio);
  const mensaje = await db.transaction(async (tx) => {
    // Solo una aprobación por borrador, aunque se toque dos veces.
    const aprobado = await tx.update(schema.cotizacionEnvios).set({ estadoBorrador: "aprobado", aprobadoEl: new Date() })
      .where(and(eq(schema.cotizacionEnvios.id, envioId), eq(schema.cotizacionEnvios.estadoBorrador, "pendiente")))
      .returning({ id: schema.cotizacionEnvios.id });
    if (!aprobado.length) return null;
    const [creado] = await tx.insert(schema.mensajes).values({
      aseguradoId: solicitud?.aseguradoId ?? null,
      agente: AGENTE,
      canal: "email",
      destinatario,
      asunto: envio.asuntoBorrador,
      texto: envio.cuerpoBorrador!,
      estado: "aprobado",
      motivo: `${envio.estado === "en_seguimiento" ? "Seguimiento del pedido" : "Pedido"} de cotización a ${envio.compania}`,
      referencia: referenciaDe(envio.id),
      esEjemplo: solicitud?.esEjemplo ?? false,
    }).returning();
    await tx.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId, actor: "productor", tipo: "borrador_aprobado", detalle: `El productor aprobó el correo para ${envio.compania}.` });
    return creado;
  });
  if (!mensaje) return null;
  return enviar(envio, mensaje);
}

/** Vuelve a intentar un correo aprobado que no salió (por ejemplo, después de conectar el correo). */
export async function reenviarCorreoCotizacion(envioId: number): Promise<ResultadoCorreo | null> {
  const [envio] = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, envioId));
  if (!envio || envio.estadoBorrador !== "aprobado") return null;
  const [mensaje] = await db.select().from(schema.mensajes)
    .where(and(eq(schema.mensajes.referencia, referenciaDe(envio.id)), eq(schema.mensajes.estado, "aprobado")))
    .orderBy(desc(schema.mensajes.id)).limit(1);
  if (!mensaje) return null;
  // Si mientras tanto se cargó el contacto de la compañía, va a esa dirección.
  const destinatario = mensaje.destinatario ?? await destinatarioDe(envio);
  if (destinatario !== mensaje.destinatario) await db.update(schema.mensajes).set({ destinatario }).where(eq(schema.mensajes.id, mensaje.id));
  return enviar(envio, { ...mensaje, destinatario });
}

/** Los correos aprobados que esperan salir, por envío, para mostrar "Enviar ahora". */
export async function correosSinEnviar(envioIds: number[]): Promise<Set<number>> {
  if (!envioIds.length) return new Set();
  const filas = await db.select({ referencia: schema.mensajes.referencia }).from(schema.mensajes)
    .where(and(eq(schema.mensajes.agente, AGENTE), eq(schema.mensajes.estado, "aprobado"), inArray(schema.mensajes.referencia, envioIds.map(referenciaDe))));
  return new Set(envioIds.filter((id) => filas.some((fila) => fila.referencia === referenciaDe(id))));
}
