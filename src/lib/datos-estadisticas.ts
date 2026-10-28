import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";

/** Lee los datos necesarios para el resumen estadístico, siempre en tiempo de pedido. */
export async function obtenerDatosEstadisticas() {
  await connection();
  const [asegurados, polizas, cuotas, acuerdos, liquidaciones, siniestros, solicitudes] = await Promise.all([
    db.select({ id: schema.asegurados.id }).from(schema.asegurados).where(isNull(schema.asegurados.bajaEl)),
    db
      .select({
        id: schema.polizas.id,
        aseguradoId: schema.polizas.aseguradoId,
        ramo: schema.polizas.ramo,
        compania: schema.polizas.compania,
        prima: schema.polizas.prima,
        vigenciaDesde: schema.polizas.vigenciaDesde,
        vigenciaHasta: schema.polizas.vigenciaHasta,
      })
      .from(schema.polizas)
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl))),
    db
      .select({
        polizaId: schema.cuotas.polizaId,
        monto: schema.cuotas.monto,
        estado: schema.cuotas.estado,
        vencimiento: schema.cuotas.vencimiento,
        pagadaEl: schema.cuotas.pagadaEl,
      })
      .from(schema.cuotas)
      .innerJoin(schema.polizas, eq(schema.polizas.id, schema.cuotas.polizaId))
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl))),
    db.select().from(schema.acuerdosComision),
    db.select({ compania: schema.liquidacionesComision.compania, periodo: schema.liquidacionesComision.periodo, montoLiquidado: schema.liquidacionesComision.montoLiquidado, depositado: schema.liquidacionesComision.depositado, depositadoEl: schema.liquidacionesComision.depositadoEl }).from(schema.liquidacionesComision),
    db
      .select({ etapa: schema.siniestros.etapa, fecha: schema.siniestros.fecha, cerrado: schema.siniestros.cerrado, cerradoEl: schema.siniestros.cerradoEl, montoAprobado: schema.siniestros.montoAprobado, montoPagado: schema.siniestros.montoPagado })
      .from(schema.siniestros)
      .orderBy(desc(schema.siniestros.fecha)),
    db.select({ estado: schema.solicitudesCotizacion.estado, creadoEl: schema.solicitudesCotizacion.creadoEl }).from(schema.solicitudesCotizacion),
  ]);

  return { asegurados, polizas, cuotas, acuerdos, liquidaciones, siniestros, solicitudes };
}
