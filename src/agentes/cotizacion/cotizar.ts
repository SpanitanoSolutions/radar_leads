import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { encolarTrabajo } from "@/lib/ia/cola";
import { elegibleParaCotizar, EVENTO_AUTORIZACION, OPERACIONES_COTIZACION } from "@/lib/cotizacion/orquestador";

// Autorizar a cotizar y encolar los pedidos. Está aparte del orquestador para
// que crearSolicitud() lo use sin importar los manejadores de la cola.

const AGENTE = "cotizacion";
export const ENTIDAD_ENVIO = "cotizacion_envios";

/** "aprobada": el productor tocó "Aprobar y cotizar"; "automatica": tiene "Cotizar automáticamente". */
export type MotivoCotizar = "aprobada" | "automatica";

/** Envíos con un pedido a la compañía en curso (cotizar_envio pendiente o procesándose). */
export async function enviosCotizando(envioIds: number[], tx: Pick<typeof db, "select"> = db): Promise<Set<number>> {
  if (!envioIds.length) return new Set();
  const t = schema.iaTrabajos;
  const filas = await tx.select({ entidadId: t.entidadId }).from(t).where(and(
    eq(t.agente, AGENTE), eq(t.operacion, OPERACIONES_COTIZACION.cotizarEnvio), eq(t.entidad, ENTIDAD_ENVIO),
    inArray(t.entidadId, envioIds), inArray(t.estado, ["pendiente", "procesando"]),
  ));
  return new Set(filas.map((fila) => fila.entidadId));
}

/**
 * Aprobar la solicitud (o "Cotizar automáticamente") autoriza al agente a
 * cotizar por conexión directa o portal. Encola un pedido por compañía que
 * todavía no salió por ningún canal; los correos siguen esperando la
 * aprobación, uno por uno. Devuelve cuántos encoló, o null si la solicitud no
 * existe o está cerrada.
 */
export async function autorizarCotizacion(solicitudId: number, motivo: MotivoCotizar): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from solicitudes_cotizacion where id = ${solicitudId} for update`);
    const [solicitud] = await tx.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
    if (!solicitud || ["ganada", "perdida"].includes(solicitud.estado) || solicitud.completadoEl) return null;
    const envios = await tx.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.solicitudId, solicitudId));
    const enCurso = await enviosCotizando(envios.map((envio) => envio.id), tx);
    const elegibles = envios.filter((envio) => elegibleParaCotizar(envio) && !enCurso.has(envio.id));
    for (const envio of elegibles) {
      await encolarTrabajo({
        agente: AGENTE, operacion: OPERACIONES_COTIZACION.cotizarEnvio, entidad: ENTIDAD_ENVIO, entidadId: envio.id,
        orgId: solicitud.orgId, producerId: solicitud.producerId, datos: { motivo },
      }, tx);
    }
    const quien = motivo === "automatica" ? "\"Cotizar automáticamente\" está activo" : "Aprobaste la solicitud";
    const detalle = elegibles.length
      ? `${quien}: el agente prueba la conexión directa o el portal de ${elegibles.length === 1 ? "1 compañía" : `${elegibles.length} compañías`}. Las que no tengan, quedan con el correo para aprobar.`
      : `${quien}. No quedaban compañías por cotizar.`;
    await tx.insert(schema.cotizacionEventos).values({
      solicitudId, actor: motivo === "automatica" ? "agente" : "productor", tipo: EVENTO_AUTORIZACION, detalle,
      orgId: solicitud.orgId, producerId: solicitud.producerId,
    });
    if (elegibles.length) {
      await tx.update(schema.solicitudesCotizacion)
        .set({ nota: "Aprobada para cotizar con las compañías conectadas. Los correos esperan tu aprobación.", actualizadoEl: new Date() })
        .where(eq(schema.solicitudesCotizacion.id, solicitudId));
    }
    await tx.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia: `solicitud:${solicitud.numero}`, texto: `Solicitud ${solicitud.numero}: ${detalle}` });
    return elegibles.length;
  });
}

/**
 * Procesa la cola al terminar la request, con una vuelta por pedido: cada
 * vuelta toma de a un trabajo (sin pisarse), así las compañías se cotizan en
 * paralelo y ninguna queda para el cron del día siguiente. Fuera de una
 * request, o si falla, la retoma el cron de la cola.
 */
export async function despacharCotizaciones(pedidos: number): Promise<void> {
  try {
    // Import diferido: los manejadores de la cola importan las solicitudes, que usan este archivo.
    const { despachadorTrabajos } = await import("@/lib/ia/manejadores");
    for (let vuelta = 0; vuelta < pedidos; vuelta++) await despachadorTrabajos.despachar(vuelta);
  } catch {
    console.error("No se pudo despachar la cola de Cotización; la retoma el cron.");
  }
}
