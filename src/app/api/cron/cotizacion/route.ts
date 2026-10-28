import { and, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { cronAutorizado } from "@/lib/cron";
import { interpretarEstrategiaSeguimiento } from "@/lib/cotizacion";

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const [config] = await db.select().from(schema.cotizacionConfig).limit(1);
  if (!config?.agenteActivo) return Response.json({ desactivado: true, mensaje: "El agente de cotización está desactivado." });
  const estrategia = interpretarEstrategiaSeguimiento(config.estrategiaSeguimiento);
  if (!estrategia) return Response.json({ error: "La estrategia guardada no es válida." }, { status: 422 });
  const ahora = new Date();
  const vencidos = await db.select().from(schema.cotizacionEnvios).where(and(
    inArray(schema.cotizacionEnvios.estado, ["enviado", "en_seguimiento"]),
    lte(schema.cotizacionEnvios.proximoSeguimiento, ahora),
  ));
  let borradores = 0;
  let requierenAtencion = 0;
  for (const envio of vencidos) {
    if (envio.estadoBorrador === "pendiente") continue;
    if (envio.folio && estrategia.esperarConFolio) continue;
    if (envio.cantidadSeguimientos >= config.maxSeguimientos) {
      await db.update(schema.cotizacionEnvios).set({ estado: "requiere_atencion", proximoSeguimiento: null, ultimaActividad: ahora }).where(eq(schema.cotizacionEnvios.id, envio.id));
      await db.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId: envio.id, actor: "agente", tipo: "seguimientos_agotados", detalle: `Se alcanzó el máximo de seguimientos para ${envio.compania}; requiere atención del productor.` });
      requierenAtencion++;
      continue;
    }
    const asunto = envio.asuntoBorrador?.startsWith("Seguimiento:") ? envio.asuntoBorrador : `Seguimiento: ${envio.asuntoBorrador ?? `Solicitud para ${envio.compania}`}`;
    const cuerpo = `${envio.cuerpoBorrador ?? ""}\n\nSeguimiento ${envio.cantidadSeguimientos + 1}: ¿pudieron revisar la solicitud? Quedamos atentos a su respuesta.`.trim();
    await db.update(schema.cotizacionEnvios).set({
      estado: "en_seguimiento", estadoBorrador: "pendiente", asuntoBorrador: asunto, cuerpoBorrador: cuerpo, ultimaActividad: ahora,
    }).where(eq(schema.cotizacionEnvios.id, envio.id));
    await db.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId: envio.id, actor: "agente", tipo: "seguimiento_borrador", detalle: `Preparó un borrador de seguimiento para ${envio.compania}; espera aprobación del productor.` });
    borradores++;
  }
  await db.insert(schema.actividadAgentes).values({ agente: "cotizacion", texto: `Preparó ${borradores} borradores de seguimiento y marcó ${requierenAtencion} envíos para revisión.` });
  return Response.json({ revisados: vencidos.length, borradores, requierenAtencion });
}
