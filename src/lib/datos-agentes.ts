import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { Comprobante, CuentaCompania } from "@/db/schema";
import { sumarDias } from "./fechas";
import type { CuotaConPoliza } from "./validador";

// Lecturas de los agentes. Como todo en src/lib/datos*.ts, esperan a
// connection(): son datos vivos y nunca se leen durante el build.

const { cuotas, polizas, asegurados } = schema;

export async function agenteConfigurado(agente: string): Promise<boolean> {
  await connection();
  const [fila] = await db
    .select({ configurado: schema.configuracionAgentes.configurado })
    .from(schema.configuracionAgentes)
    .where(eq(schema.configuracionAgentes.agente, agente));
  return fila?.configurado ?? false;
}

export async function obtenerConfigAgente<T>(agente: string): Promise<T | null> {
  await connection();
  const [fila] = await db.select().from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, agente));
  return (fila?.config as T) ?? null;
}

/** Claves de las conexiones que están conectadas. */
export async function conexionesConectadas(): Promise<Set<string>> {
  await connection();
  const filas = await db
    .select({ clave: schema.conexiones.clave })
    .from(schema.conexiones)
    .where(eq(schema.conexiones.estado, "conectado"));
  return new Set(filas.map((f) => f.clave));
}

const columnasCuota = {
  id: cuotas.id,
  numero: cuotas.numero,
  monto: cuotas.monto,
  vencimiento: cuotas.vencimiento,
  estado: cuotas.estado,
  pagadaEl: cuotas.pagadaEl,
  medioPago: cuotas.medioPago,
  polizaId: polizas.id,
  polizaNumero: polizas.numero,
  ramo: polizas.ramo,
  compania: polizas.compania,
  cantidadCuotas: polizas.cantidadCuotas,
  aseguradoId: asegurados.id,
  asegurado: asegurados.nombre,
};

/**
 * Cuotas que importan hoy: las impagas que vencen desde hace 60 días hasta
 * dentro de 30, y las pagadas en la última semana.
 */
export async function obtenerCuotasRecientes(hoy: string): Promise<CuotaConPoliza[]> {
  await connection();
  const haceUnaSemana = new Date(`${sumarDias(hoy, -7)}T00:00:00-03:00`);
  return db
    .select(columnasCuota)
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(
      and(
        isNull(asegurados.bajaEl),
        or(
          and(sql`${cuotas.estado} <> 'pagada'`, gte(cuotas.vencimiento, sumarDias(hoy, -60)), lte(cuotas.vencimiento, sumarDias(hoy, 30))),
          and(eq(cuotas.estado, "pagada"), gte(cuotas.pagadaEl, haceUnaSemana)),
        ),
      ),
    );
}

/** Cuotas por id (para confirmar un cobro completo desde su primera cuota). */
export async function obtenerCuotas(ids: number[]): Promise<CuotaConPoliza[]> {
  await connection();
  if (!ids.length) return [];
  return db
    .select(columnasCuota)
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(inArray(cuotas.id, ids));
}

/** El último comprobante de cada cuota. */
export async function obtenerComprobantes(cuotaIds: number[]): Promise<Map<number, Comprobante>> {
  await connection();
  if (!cuotaIds.length) return new Map();
  const filas = await db
    .select()
    .from(schema.comprobantes)
    .where(inArray(schema.comprobantes.cuotaId, cuotaIds))
    .orderBy(desc(schema.comprobantes.recibidoEl));
  const porCuota = new Map<number, Comprobante>();
  for (const c of filas) if (!porCuota.has(c.cuotaId)) porCuota.set(c.cuotaId, c);
  return porCuota;
}

export async function obtenerCuentasCompanias(): Promise<Map<string, CuentaCompania[]>> {
  await connection();
  const filas = await db.select({ nombre: schema.companias.nombre, cuentas: schema.companias.cuentas }).from(schema.companias);
  return new Map(filas.map((f) => [f.nombre, f.cuentas]));
}

export async function obtenerCompanias() {
  await connection();
  return db.select().from(schema.companias);
}

/** Datos de contacto de varios asegurados. */
export async function obtenerContactos(ids: number[]) {
  await connection();
  if (!ids.length) return new Map<number, typeof asegurados.$inferSelect>();
  const filas = await db.select().from(asegurados).where(inArray(asegurados.id, ids));
  return new Map(filas.map((a) => [a.id, a]));
}

export async function obtenerActividad(agente: string, cuantas = 30) {
  await connection();
  return db
    .select()
    .from(schema.actividadAgentes)
    .where(eq(schema.actividadAgentes.agente, agente))
    .orderBy(desc(schema.actividadAgentes.fecha))
    .limit(cuantas);
}

/** El último mensaje enviado de cada cobro (para "Recordatorio enviado ayer por WhatsApp"). */
export async function obtenerUltimosEnvios(cabezaIds: number[]) {
  await connection();
  const resultado = new Map<number, { canal: string; enviadoEl: Date }>();
  if (!cabezaIds.length) return resultado;
  const filas = await db
    .select({ referencia: schema.mensajes.referencia, canal: schema.mensajes.canal, enviadoEl: schema.mensajes.enviadoEl })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.estado, "enviado"), sql`${schema.mensajes.referencia} like 'cuota:%'`))
    .orderBy(desc(schema.mensajes.enviadoEl));
  const buscadas = new Set(cabezaIds);
  for (const f of filas) {
    const id = Number(/^cuota:(\d+):/.exec(f.referencia ?? "")?.[1]);
    if (buscadas.has(id) && f.enviadoEl && !resultado.has(id)) resultado.set(id, { canal: f.canal, enviadoEl: f.enviadoEl });
  }
  return resultado;
}

/** Borradores que esperan aprobación en Cobranza (incluye los del validador y las llamadas). */
export async function obtenerPendientesCobranza(hoy: string) {
  await connection();
  return db
    .select({
      id: schema.mensajes.id,
      canal: schema.mensajes.canal,
      destinatario: schema.mensajes.destinatario,
      texto: schema.mensajes.texto,
      motivo: schema.mensajes.motivo,
      referencia: schema.mensajes.referencia,
      aseguradoId: schema.mensajes.aseguradoId,
      creadoEl: schema.mensajes.creadoEl,
      tipo: asegurados.tipo,
      contactoNombre: asegurados.contactoNombre,
    })
    .from(schema.mensajes)
    .leftJoin(asegurados, eq(asegurados.id, schema.mensajes.aseguradoId))
    .where(
      and(
        eq(schema.mensajes.estado, "borrador"),
        inArray(schema.mensajes.agente, ["cobranza", "validador"]),
        or(isNull(schema.mensajes.mostrarDesde), lte(schema.mensajes.mostrarDesde, hoy)),
      ),
    )
    .orderBy(schema.mensajes.creadoEl);
}

export async function obtenerSeguimientosActivos() {
  await connection();
  return db.select().from(schema.seguimientosCobranza).where(sql`${schema.seguimientosCobranza.estado} <> 'terminado'`);
}

/** Todas las cuotas que vencen en el mes de hoy (para "Por cobrar" y "Cobrado"). */
export async function obtenerCuotasDelMes(hoy: string): Promise<CuotaConPoliza[]> {
  await connection();
  const desde = `${hoy.slice(0, 7)}-01`;
  const hasta = sumarDias(sumarDias(desde, 32).slice(0, 8) + "01", -1);
  return db
    .select(columnasCuota)
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(and(isNull(asegurados.bajaEl), gte(cuotas.vencimiento, desde), lte(cuotas.vencimiento, hasta)));
}
