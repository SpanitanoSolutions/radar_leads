import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

// Lecturas de las corridas del agente (Ejecuciones, Instrucciones y la API).

const c = schema.cobranzaCorridas;

/** La última corrida que lanzó el cron (las manuales no cuentan para la programación). */
export async function ultimaCorridaCron(): Promise<Date | null> {
  const [fila] = await db.select({ iniciadaEl: c.iniciadaEl }).from(c).where(eq(c.origen, "cron")).orderBy(desc(c.iniciadaEl)).limit(1);
  return fila?.iniciadaEl ?? null;
}

export async function listarCorridas(limite = 50) {
  return db.select().from(c).orderBy(desc(c.iniciadaEl), desc(c.id)).limit(limite);
}

export async function obtenerCorrida(id: number) {
  const [fila] = await db.select().from(c).where(eq(c.id, id));
  return fila ?? null;
}

/** Lo que hizo una corrida, caso por caso, lo más nuevo primero. */
export async function eventosDeCorrida(id: number) {
  return db
    .select({
      id: schema.cobranzaEventos.id,
      casoId: schema.cobranzaEventos.casoId,
      tipo: schema.cobranzaEventos.tipo,
      canal: schema.cobranzaEventos.canal,
      resumen: schema.cobranzaEventos.resumen,
      datos: schema.cobranzaEventos.datos,
      esPrueba: schema.cobranzaEventos.esPrueba,
      creadoEl: schema.cobranzaEventos.creadoEl,
      asegurado: schema.asegurados.nombre,
    })
    .from(schema.cobranzaEventos)
    .innerJoin(schema.cobranzaCasos, eq(schema.cobranzaCasos.id, schema.cobranzaEventos.casoId))
    .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.cobranzaCasos.aseguradoId))
    .where(eq(schema.cobranzaEventos.corridaId, id))
    .orderBy(desc(schema.cobranzaEventos.creadoEl), desc(schema.cobranzaEventos.id));
}
