import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { AseguradoConPolizas } from "./asegurados";
import { claveDeAsegurado, claveDePoliza } from "./importacion";

// Lecturas de la cartera. Como todo en src/lib/datos.ts, esperan a connection():
// son datos vivos y nunca se leen durante el build.

const { asegurados, polizas } = schema;

/** Asegurados activos con sus pólizas (sin las dadas de baja). */
export async function obtenerAsegurados(): Promise<AseguradoConPolizas[]> {
  await connection();
  const [filas, pols] = await Promise.all([
    db.select().from(asegurados).where(isNull(asegurados.bajaEl)).orderBy(asc(asegurados.nombre)),
    db.select().from(polizas).where(isNull(polizas.bajaEl)).orderBy(asc(polizas.vigenciaHasta)),
  ]);
  const porAsegurado = new Map<number, AseguradoConPolizas["polizas"]>();
  for (const p of pols) porAsegurado.set(p.aseguradoId, [...(porAsegurado.get(p.aseguradoId) ?? []), p]);
  return filas.map((a) => ({ ...a, polizas: porAsegurado.get(a.id) ?? [] }));
}

export async function obtenerUltimaImportacion() {
  await connection();
  const [fila] = await db.select().from(schema.importaciones).orderBy(desc(schema.importaciones.fecha)).limit(1);
  return fila ?? null;
}

/** Claves de oportunidades que el productor agregó a seguimiento. */
export async function obtenerSeguimientos(aseguradoId: number): Promise<Set<string>> {
  await connection();
  const filas = await db
    .select({ clave: schema.oportunidadesSeguimiento.clave })
    .from(schema.oportunidadesSeguimiento)
    .where(eq(schema.oportunidadesSeguimiento.aseguradoId, aseguradoId));
  return new Set(filas.map((f) => f.clave));
}

/** Todo lo de un asegurado para la ficha: pólizas (también las vencidas), siniestros, notas y documentos. */
export async function obtenerFichaAsegurado(id: number) {
  await connection();
  const [a] = await db.select().from(asegurados).where(eq(asegurados.id, id));
  if (!a) return null;
  const pols = await db
    .select()
    .from(polizas)
    .where(and(eq(polizas.aseguradoId, id), isNull(polizas.bajaEl)))
    .orderBy(asc(polizas.vigenciaHasta));
  const ids = pols.map((p) => p.id);
  const [siniestros, notas, documentos, seguimiento, importacion] = await Promise.all([
    ids.length
      ? db.select().from(schema.siniestros).where(inArray(schema.siniestros.polizaId, ids)).orderBy(desc(schema.siniestros.fecha))
      : Promise.resolve([]),
    db.select().from(schema.notasAsegurado).where(eq(schema.notasAsegurado.aseguradoId, id)).orderBy(desc(schema.notasAsegurado.fecha)),
    db
      .select({
        id: schema.documentosAsegurado.id,
        archivoId: schema.archivos.id,
        nombre: schema.archivos.nombre,
        tamano: schema.archivos.tamano,
        subidoEl: schema.documentosAsegurado.subidoEl,
      })
      .from(schema.documentosAsegurado)
      .innerJoin(schema.archivos, eq(schema.archivos.id, schema.documentosAsegurado.archivoId))
      .where(eq(schema.documentosAsegurado.aseguradoId, id))
      .orderBy(desc(schema.documentosAsegurado.subidoEl)),
    obtenerSeguimientos(id),
    a.importacionId
      ? db.select().from(schema.importaciones).where(eq(schema.importaciones.id, a.importacionId)).then((f) => f[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { asegurado: { ...a, polizas: pols }, siniestros, notas, documentos, seguimiento, importacion };
}

/** Avisos de vencimiento que esperan aprobación. */
export async function obtenerAvisosPendientes() {
  await connection();
  return db
    .select({
      id: schema.mensajes.id,
      canal: schema.mensajes.canal,
      destinatario: schema.mensajes.destinatario,
      texto: schema.mensajes.texto,
      motivo: schema.mensajes.motivo,
      aseguradoId: schema.mensajes.aseguradoId,
      cliente: asegurados.nombre,
    })
    .from(schema.mensajes)
    .leftJoin(asegurados, eq(asegurados.id, schema.mensajes.aseguradoId))
    .where(and(eq(schema.mensajes.agente, "cartera"), eq(schema.mensajes.estado, "borrador")))
    .orderBy(asc(schema.mensajes.creadoEl));
}

/** Cómo se reconoce a cada asegurado cargado (`claveDeAsegurado`): el paso 3 de la importación muestra cuáles son nuevos. */
export async function obtenerClavesDeAsegurados(): Promise<string[]> {
  await connection();
  // También los dados de baja: si vuelven en una importación, se reactivan.
  const filas = await db.select({ documentoDigitos: asegurados.documentoDigitos, nombre: asegurados.nombre }).from(asegurados);
  return filas.map((f) => claveDeAsegurado(f.documentoDigitos, f.nombre));
}

/** Las pólizas cargadas (`claveDePoliza`): por ellas el paso 3 reconoce a quien se le corrigió el documento en la ficha. */
export async function obtenerClavesDePolizas(): Promise<string[]> {
  await connection();
  const filas = await db
    .select({ compania: polizas.compania, numero: polizas.numero })
    .from(polizas)
    .where(and(isNotNull(polizas.compania), isNotNull(polizas.numero)));
  return filas.map((f) => claveDePoliza(f.compania!, f.numero!));
}

export async function obtenerImportaciones(cuantas = 5) {
  await connection();
  return db.select().from(schema.importaciones).orderBy(desc(schema.importaciones.fecha)).limit(cuantas);
}

/** Si hay asegurados de ejemplo (para ofrecer quitarlos al importar). */
export async function obtenerHayEjemplos(): Promise<boolean> {
  await connection();
  const [fila] = await db.select({ id: asegurados.id }).from(asegurados).where(eq(asegurados.esEjemplo, true)).limit(1);
  return Boolean(fila);
}
