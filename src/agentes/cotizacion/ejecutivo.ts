import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { enviarMensaje } from "@/agentes/envio";
import { motivoSinEnviar } from "@/lib/cotizacion/correo";
import { huellaDeTexto, resumenParaEjecutivo } from "@/lib/cotizacion/ejecutivo";
import { contextoDeEnvios } from "./detalle";

// El correo del agente al ejecutivo: el resumen de la solicitud, para aprobar.
// Decisión de Julian (30/10/2026): el ejecutivo es el productor de la cuenta,
// así que va al correo de Mi cuenta. Se arma en vivo con los datos de la
// solicitud y, al aprobarlo, queda en `mensajes` y sale por la salida común;
// sin el correo conectado queda aprobado y sin enviar, como los de las compañías.

const AGENTE = "cotizacion";
const FALTA_CORREO_CUENTA = "falta tu correo (cargalo en Configuración → Mi cuenta)";

export const referenciaEjecutivo = (solicitudId: number) => `cotizacion:ejecutivo:${solicitudId}`;

export type BorradorEjecutivo = { para: string | null; asunto: string; cuerpo: string; huella: string };

/** El resumen tal como está ahora. Null si la solicitud no existe. */
export async function borradorEjecutivo(solicitudId: number): Promise<BorradorEjecutivo | null> {
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  if (!solicitud) return null;
  const [envios, [ajustes]] = await Promise.all([
    db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.solicitudId, solicitudId)).orderBy(schema.cotizacionEnvios.id),
    db.select({ nombre: schema.ajustes.productorNombre, email: schema.ajustes.productorEmail }).from(schema.ajustes).where(eq(schema.ajustes.id, 1)),
  ]);
  const resultados = envios.length
    ? await db.select().from(schema.cotizacionResultados).where(inArray(schema.cotizacionResultados.envioId, envios.map((envio) => envio.id)))
    : [];
  const ctx = await contextoDeEnvios(envios, resultados);
  const { asunto, cuerpo } = resumenParaEjecutivo({ solicitud, envios, ctx, saludo: solicitud.ejecutivo ?? ajustes?.nombre ?? null });
  const para = ajustes?.email?.trim() || null;
  return { para, asunto, cuerpo, huella: huellaDeTexto(`${para ?? ""}\n${asunto}\n${cuerpo}`) };
}

/** Los resúmenes ya aprobados de la solicitud, el último primero. */
export async function resumenesAprobados(solicitudId: number) {
  return db.select({ id: schema.mensajes.id, estado: schema.mensajes.estado, destinatario: schema.mensajes.destinatario, creadoEl: schema.mensajes.creadoEl, enviadoEl: schema.mensajes.enviadoEl })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.agente, AGENTE), eq(schema.mensajes.referencia, referenciaEjecutivo(solicitudId))))
    .orderBy(desc(schema.mensajes.id));
}

export type ResultadoResumen = { enviado: true } | { enviado: false; motivo: string } | { cambio: true };

async function enviar(solicitudId: number, mensaje: { id: number; destinatario: string | null }): Promise<ResultadoResumen> {
  const r = await enviarMensaje(mensaje.id);
  if (r.ok) {
    await db.insert(schema.cotizacionEventos).values({ solicitudId, actor: "agente", tipo: "resumen_ejecutivo_enviado", detalle: "Salió el resumen de la solicitud a tu correo." });
    return { enviado: true };
  }
  const motivo = motivoSinEnviar(r.error, mensaje.destinatario, FALTA_CORREO_CUENTA);
  await db.insert(schema.cotizacionEventos).values({ solicitudId, actor: "agente", tipo: "resumen_ejecutivo_sin_enviar", detalle: `El resumen está aprobado, pero no salió. ${motivo}` });
  return { enviado: false, motivo };
}

/**
 * El productor aprueba el resumen que vio. Se vuelve a armar y, si cambió
 * mientras tanto (llegó una respuesta, por ejemplo), no sale: hay que verlo
 * de nuevo. Devuelve null si la solicitud no existe.
 */
export async function aprobarResumenEjecutivo(solicitudId: number, huella: string): Promise<ResultadoResumen | null> {
  const borrador = await borradorEjecutivo(solicitudId);
  if (!borrador) return null;
  if (borrador.huella !== huella) return { cambio: true };
  const [solicitud] = await db.select({ aseguradoId: schema.solicitudesCotizacion.aseguradoId, esEjemplo: schema.solicitudesCotizacion.esEjemplo, numero: schema.solicitudesCotizacion.numero })
    .from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  const [mensaje] = await db.insert(schema.mensajes).values({
    aseguradoId: solicitud?.aseguradoId ?? null,
    agente: AGENTE,
    canal: "email",
    destinatario: borrador.para,
    asunto: borrador.asunto,
    texto: borrador.cuerpo,
    estado: "aprobado",
    motivo: `Resumen de la solicitud ${solicitud?.numero ?? solicitudId} para el ejecutivo`,
    referencia: referenciaEjecutivo(solicitudId),
    esEjemplo: solicitud?.esEjemplo ?? false,
  }).returning({ id: schema.mensajes.id, destinatario: schema.mensajes.destinatario });
  await db.insert(schema.cotizacionEventos).values({ solicitudId, actor: "productor", tipo: "resumen_ejecutivo_aprobado", detalle: "El productor aprobó el resumen de la solicitud para el ejecutivo." });
  return enviar(solicitudId, mensaje);
}

/** "Enviar ahora": vuelve a intentar el último resumen aprobado que no salió. */
export async function reenviarResumenEjecutivo(solicitudId: number): Promise<ResultadoResumen | null> {
  const [mensaje] = await db.select({ id: schema.mensajes.id, destinatario: schema.mensajes.destinatario }).from(schema.mensajes)
    .where(and(eq(schema.mensajes.agente, AGENTE), eq(schema.mensajes.referencia, referenciaEjecutivo(solicitudId)), eq(schema.mensajes.estado, "aprobado")))
    .orderBy(desc(schema.mensajes.id)).limit(1);
  if (!mensaje) return null;
  // Si mientras tanto cargó su correo en Mi cuenta, va a esa dirección.
  if (!mensaje.destinatario) {
    const [ajustes] = await db.select({ email: schema.ajustes.productorEmail }).from(schema.ajustes).where(eq(schema.ajustes.id, 1));
    const para = ajustes?.email?.trim() || null;
    if (para) {
      await db.update(schema.mensajes).set({ destinatario: para }).where(eq(schema.mensajes.id, mensaje.id));
      mensaje.destinatario = para;
    }
  }
  return enviar(solicitudId, mensaje);
}
