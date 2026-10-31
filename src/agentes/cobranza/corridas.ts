import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const c = schema.cobranzaCorridas;

/** La última corrida que lanzó el cron (las manuales no cuentan para la programación). */
export async function ultimaCorridaCron(): Promise<Date | null> {
  const [fila] = await db.select({ iniciadaEl: c.iniciadaEl }).from(c).where(and(eq(c.origen, "cron"))).orderBy(desc(c.iniciadaEl)).limit(1);
  return fila?.iniciadaEl ?? null;
}
