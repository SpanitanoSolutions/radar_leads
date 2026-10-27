import "server-only";
import { and, desc, eq, isNull, lt, lte, gte, or } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { diaEnArgentina, sumarDias } from "@/lib/fechas";

/** Alertas accionables y actividad reciente para el inicio privado. */
export async function obtenerDatosDashboard() {
  await connection();
  const hoy = diaEnArgentina(new Date());
  const en30 = sumarDias(hoy, 30);
  const [vencimientos, cobrosVencidos, comprobantes, mensajes, cotizaciones, siniestros, actividad, eventos] = await Promise.all([
    db
      .select({ id: schema.polizas.id, aseguradoId: schema.asegurados.id, cliente: schema.asegurados.nombre, ramo: schema.polizas.ramo, compania: schema.polizas.compania, vigenciaHasta: schema.polizas.vigenciaHasta })
      .from(schema.polizas)
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl), gte(schema.polizas.vigenciaHasta, hoy), lte(schema.polizas.vigenciaHasta, en30)))
      .orderBy(schema.polizas.vigenciaHasta),
    db
      .select({ id: schema.cuotas.id, aseguradoId: schema.asegurados.id, cliente: schema.asegurados.nombre, ramo: schema.polizas.ramo, numeroPoliza: schema.polizas.numero, numeroCuota: schema.cuotas.numero, cantidadCuotas: schema.polizas.cantidadCuotas, vencimiento: schema.cuotas.vencimiento, monto: schema.cuotas.monto })
      .from(schema.cuotas)
      .innerJoin(schema.polizas, eq(schema.polizas.id, schema.cuotas.polizaId))
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl), lt(schema.cuotas.vencimiento, hoy), or(eq(schema.cuotas.estado, "pendiente"), eq(schema.cuotas.estado, "vencida"))))
      .orderBy(schema.cuotas.vencimiento)
      .limit(5),
    db.select({ id: schema.comprobantes.id }).from(schema.comprobantes).where(eq(schema.comprobantes.estado, "por_revisar")),
    db
      .select({ id: schema.mensajes.id })
      .from(schema.mensajes)
      .where(and(eq(schema.mensajes.agente, "cobranza"), eq(schema.mensajes.estado, "borrador"), or(isNull(schema.mensajes.mostrarDesde), lte(schema.mensajes.mostrarDesde, hoy)))),
    db.select({ id: schema.solicitudesCotizacion.id }).from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.estado, "atencion")),
    db
      .select({ id: schema.siniestros.id })
      .from(schema.siniestros)
      .innerJoin(schema.polizas, eq(schema.polizas.id, schema.siniestros.polizaId))
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(and(eq(schema.siniestros.cerrado, false), isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl))),
    db.select({ id: schema.actividadAgentes.id, fecha: schema.actividadAgentes.fecha, texto: schema.actividadAgentes.texto, agente: schema.actividadAgentes.agente }).from(schema.actividadAgentes).orderBy(desc(schema.actividadAgentes.fecha)).limit(8),
    db
      .select({ id: schema.siniestroEventos.id, fecha: schema.siniestroEventos.fecha, texto: schema.siniestroEventos.texto, quien: schema.siniestroEventos.quien, cliente: schema.asegurados.nombre })
      .from(schema.siniestroEventos)
      .innerJoin(schema.siniestros, eq(schema.siniestros.id, schema.siniestroEventos.siniestroId))
      .innerJoin(schema.polizas, eq(schema.polizas.id, schema.siniestros.polizaId))
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl)))
      .orderBy(desc(schema.siniestroEventos.fecha))
      .limit(8),
  ]);

  const actividadReciente = [
    ...actividad.map((fila) => ({ id: `agente-${fila.id}`, fecha: fila.fecha, origen: fila.agente, cliente: null, texto: fila.texto })),
    ...eventos.map((fila) => ({ id: `siniestro-${fila.id}`, fecha: fila.fecha, origen: fila.quien, cliente: fila.cliente, texto: fila.texto })),
  ]
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, 8);

  return {
    hoy,
    vencimientos,
    cobrosVencidos,
    avisos: {
      comprobantes: comprobantes.length,
      cobranza: mensajes.length,
      cotizaciones: cotizaciones.length,
      siniestros: siniestros.length,
    },
    actividad: actividadReciente,
  };
}
