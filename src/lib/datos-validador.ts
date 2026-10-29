import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { diaEnArgentina, sumarDias } from "./fechas";
import { companiaCanonica } from "./importacion";
import { MINUTOS_CAIDA } from "./validador/corrida";
import { desdePagadas, ultimasFuentes, VENTANA, type CuotaValidador } from "./validador/pantalla";

// Lecturas de la pantalla del Validador. Como todo en src/lib/datos*.ts,
// esperan a connection(): son datos vivos y nunca se leen durante el build.

const { cuotas, polizas, asegurados } = schema;

const pagada = sql`(${cuotas.estado} = 'pagada' or coalesce(${cuotas.estadoValidacion}, '') = 'pagada')`;
const cancelada = sql`coalesce(${cuotas.estadoValidacion}, '') = 'cancelada'`;
/** El día en que pagó el asegurado; si no se sabe, el día (en Argentina) en que se registró. */
const diaDePago = sql<string>`coalesce(${cuotas.fechaPago}, (${cuotas.pagadaEl} at time zone 'America/Argentina/Buenos_Aires')::date, ${cuotas.vencimiento})`;

/**
 * Las cuotas que muestra el Validador: las impagas de la ventana (VENTANA),
 * y las pagadas y canceladas de los últimos doce meses.
 */
export async function obtenerCuotasValidador(hoy: string): Promise<CuotaValidador[]> {
  await connection();
  const filas = await db
    .select({
      id: cuotas.id,
      polizaId: polizas.id,
      aseguradoId: asegurados.id,
      asegurado: asegurados.nombre,
      compania: polizas.compania,
      ramo: polizas.ramo,
      poliza: polizas.numero,
      item: cuotas.item,
      endoso: cuotas.endoso,
      cupon: cuotas.cupon,
      numero: cuotas.numero,
      cantidadCuotas: polizas.cantidadCuotas,
      monto: cuotas.monto,
      moneda: cuotas.moneda,
      vencimiento: cuotas.vencimiento,
      medioPago: cuotas.medioPago,
      formaPago: polizas.formaPago,
      estado: cuotas.estado,
      estadoValidacion: cuotas.estadoValidacion,
      pagadaEl: cuotas.pagadaEl,
      fechaPago: cuotas.fechaPago,
      origenConfirmacion: cuotas.origenConfirmacion,
      ultimaRevision: cuotas.ultimaRevision,
      canceladaEl: cuotas.canceladaEl,
      motivoCancelacion: cuotas.motivoCancelacion,
    })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(
      and(
        isNull(asegurados.bajaEl),
        sql`(
          (not ${pagada} and not ${cancelada} and ${cuotas.vencimiento} between ${sumarDias(hoy, -VENTANA.diasAtras)} and ${sumarDias(hoy, VENTANA.diasAdelante)})
          or (${pagada} and ${diaDePago} >= ${desdePagadas(hoy)})
          or (${cancelada} and coalesce(${cuotas.canceladaEl}, ${cuotas.vencimiento}) >= ${desdePagadas(hoy)})
        )`,
      ),
    );
  return filas.map(({ medioPago, formaPago, estado, estadoValidacion, fechaPago, ...c }) => {
    const esPagada = estado === "pagada" || estadoValidacion === "pagada";
    return {
      ...c,
      medio: medioPago ?? formaPago,
      pagada: esPagada,
      cancelada: !esPagada && estadoValidacion === "cancelada",
      fechaPago: esPagada ? (fechaPago ?? (c.pagadaEl ? diaEnArgentina(c.pagadaEl) : c.vencimiento)) : null,
    };
  });
}

/** Las últimas corridas (validación y enriquecimiento), para Actividad. */
export async function obtenerCorridas(cuantas = 20) {
  await connection();
  return db.select().from(schema.validadorCorridas).orderBy(desc(schema.validadorCorridas.iniciadaEl)).limit(cuantas);
}

/** Las corridas en curso: las que empezaron hace menos de MINUTOS_CAIDA y no terminaron. */
export async function obtenerCorridasEnCurso() {
  await connection();
  const c = schema.validadorCorridas;
  return db
    .select({ id: c.id, etapa: c.etapa, progreso: c.progreso, iniciadaEl: c.iniciadaEl })
    .from(c)
    .where(and(eq(c.estado, "en_curso"), gte(c.iniciadaEl, new Date(Date.now() - MINUTOS_CAIDA * 60_000))))
    .orderBy(c.iniciadaEl);
}

/** Los listados que subió el productor, los más nuevos primero, con cuántos pagos coincidieron, quedaron a revisar o no se identificaron. */
export async function obtenerListadosSubidos(cuantos = 8) {
  await connection();
  const f = schema.validadorFuentes;
  const p = schema.validadorPagosDetectados;
  const listados = await db
    .select({
      id: f.id,
      compania: f.compania,
      nombre: f.nombre,
      formato: f.formato,
      estado: f.estado,
      mapeoPropuesto: f.mapeoPropuesto,
      filasExtraidas: f.filasExtraidas,
      problemas: f.problemas,
      errorSeguro: f.errorSeguro,
      creadoEl: f.creadoEl,
    })
    .from(f)
    .where(eq(f.tipo, "archivo"))
    .orderBy(desc(f.creadoEl))
    .limit(cuantos);
  const conteos = listados.length
    ? await db
        .select({ fuenteId: p.fuenteId, estado: p.estado, cuantos: sql<number>`count(*)::int` })
        .from(p)
        .where(inArray(p.fuenteId, listados.map((l) => l.id)))
        .groupBy(p.fuenteId, p.estado)
    : [];
  const cuantosDe = (fuenteId: number, estado: string) => conteos.find((c) => c.fuenteId === fuenteId && c.estado === estado)?.cuantos ?? 0;
  return listados.map((l) => ({
    ...l,
    pagos: { confirmados: cuantosDe(l.id, "confirmado"), aRevisar: cuantosDe(l.id, "a_revisar"), noIdentificados: cuantosDe(l.id, "no_identificado") },
  }));
}

/** Las compañías para elegir al subir un listado: las del catálogo y las de la cartera. */
export async function obtenerNombresCompanias(): Promise<string[]> {
  await connection();
  const [catalogo, cartera] = await Promise.all([
    db.select({ nombre: schema.companias.nombre }).from(schema.companias),
    db.selectDistinct({ nombre: polizas.compania }).from(polizas),
  ]);
  const nombres = [...catalogo, ...cartera].map((c) => c.nombre).filter((n): n is string => Boolean(n?.trim()));
  return [...new Set(nombres.map(companiaCanonica))].sort((a, b) => a.localeCompare(b, "es"));
}

const columnasCuotaCaso = {
  id: cuotas.id,
  aseguradoId: asegurados.id,
  asegurado: asegurados.nombre,
  compania: polizas.compania,
  poliza: polizas.numero,
  ramo: polizas.ramo,
  item: cuotas.item,
  numero: cuotas.numero,
  cantidadCuotas: polizas.cantidadCuotas,
  monto: cuotas.monto,
  moneda: cuotas.moneda,
  vencimiento: cuotas.vencimiento,
  estado: cuotas.estado,
  estadoValidacion: cuotas.estadoValidacion,
};

async function cuotasPorId(ids: number[]) {
  if (!ids.length) return new Map<number, Awaited<ReturnType<typeof leerCuotas>>[number]>();
  return new Map((await leerCuotas(ids)).map((c) => [c.id, c]));
}

function leerCuotas(ids: number[]) {
  return db
    .select(columnasCuotaCaso)
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(inArray(cuotas.id, ids));
}

export type CuotaDeCaso = Awaited<ReturnType<typeof leerCuotas>>[number];

/**
 * Los casos a revisar y los pagos no identificados que el productor no
 * resolvió todavía, solo de la última fuente de cada compañía (el mismo pago
 * se repite en las corridas de cada día), con las cuotas candidatas.
 */
export async function obtenerCasosARevisar() {
  await connection();
  const f = schema.validadorFuentes;
  const p = schema.validadorPagosDetectados;
  const fuentes = await db.select({ id: f.id, compania: f.compania, creadoEl: f.creadoEl }).from(f).where(eq(f.estado, "procesada"));
  const ultimas = [...ultimasFuentes(fuentes)];
  if (!ultimas.length) return { casos: [], noIdentificados: [], cuotas: new Map<number, CuotaDeCaso>() };
  const filas = await db
    .select({
      id: p.id,
      fila: p.fila,
      datos: p.datos,
      cuotaId: p.cuotaId,
      puntaje: p.puntaje,
      estado: p.estado,
      candidatos: p.candidatos,
      motivo: p.motivo,
      explicacion: p.explicacion,
      accionPropuesta: p.accionPropuesta,
      cuotaSugeridaId: p.cuotaSugeridaId,
      creadoEl: p.creadoEl,
      fuenteId: f.id,
      fuente: f.nombre,
      compania: f.compania,
      tipo: f.tipo,
    })
    .from(p)
    .innerJoin(f, eq(f.id, p.fuenteId))
    .where(and(inArray(p.fuenteId, ultimas), inArray(p.estado, ["a_revisar", "no_identificado"]), isNull(p.revisadoEl)))
    .orderBy(f.compania, p.fila, p.id);
  const ids = [...new Set(filas.flatMap((c) => [...c.candidatos.map((x) => x.cuotaId), ...(c.cuotaId ? [c.cuotaId] : [])]))];
  return {
    casos: filas.filter((c) => c.estado === "a_revisar"),
    noIdentificados: filas.filter((c) => c.estado === "no_identificado"),
    cuotas: await cuotasPorId(ids),
  };
}

/** Los comprobantes subidos sueltos que esperan que el productor elija el cobro, con las cuotas de los candidatos. */
export async function obtenerComprobantesSueltos() {
  await connection();
  const c = schema.comprobantes;
  const filas = await db
    .select()
    .from(c)
    .where(and(isNull(c.cuotaId), eq(c.estado, "por_revisar")))
    .orderBy(desc(c.recibidoEl));
  const ids = [...new Set(filas.flatMap((x) => x.candidatos.flatMap((cand) => cand.cuotaIds)))];
  return { comprobantes: filas, cuotas: await cuotasPorId(ids) };
}

/** Todas las pólizas de los asegurados activos, también las dadas de baja: la vigencia anterior de una renovación. */
export async function obtenerPolizasParaRenovaciones() {
  await connection();
  return db
    .select({
      id: polizas.id,
      aseguradoId: polizas.aseguradoId,
      asegurado: asegurados.nombre,
      ramo: polizas.ramo,
      compania: polizas.compania,
      numero: polizas.numero,
      bien: polizas.bien,
      prima: polizas.prima,
      vigenciaDesde: polizas.vigenciaDesde,
      vigenciaHasta: polizas.vigenciaHasta,
      bajaEl: polizas.bajaEl,
      creadoEl: polizas.creadoEl,
    })
    .from(polizas)
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(isNull(asegurados.bajaEl));
}
