import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LeadCapturado } from "./tipos";

const { leads, capturas } = schema;

/**
 * Guarda los leads nuevos. Los que ya están (misma clave: misma empresa y
 * mismo evento) se ignoran, así se puede correr la captura todas las veces
 * que haga falta. Devuelve cuántos se agregaron.
 */
export async function guardarLeads(nuevos: LeadCapturado[]): Promise<number> {
  const unicos = [...new Map(nuevos.map((l) => [l.clave, l])).values()];
  let agregados = 0;
  for (let i = 0; i < unicos.length; i += 200) {
    const filas = await db
      .insert(leads)
      .values(unicos.slice(i, i + 200))
      .onConflictDoNothing({ target: leads.clave })
      .returning({ id: leads.id });
    agregados += filas.length;
  }
  return agregados;
}

/** Borra los leads de ejemplo. Devuelve cuántos borró. */
export async function borrarEjemplos(): Promise<number> {
  const borrados = await db
    .delete(leads)
    .where(eq(leads.esEjemplo, true))
    .returning({ id: leads.id });
  return borrados.length;
}

/** Cuando ya hay leads reales, los de ejemplo sobran (y con ellos la etiqueta "Datos de ejemplo"). */
export async function borrarEjemplosSiHayReales(): Promise<number> {
  const [real] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.esEjemplo, false))
    .limit(1);
  return real ? borrarEjemplos() : 0;
}

export async function versionAnterior(fuente: string): Promise<string | null> {
  const [fila] = await db.select().from(capturas).where(eq(capturas.fuente, fuente));
  return fila?.version ?? null;
}

export async function registrarCaptura(
  fuente: string,
  datos: { version?: string | null; nuevos: number; error?: string | null },
) {
  const valores = {
    nuevos: datos.nuevos,
    error: datos.error ?? null,
    ejecutadoEl: new Date(),
    // Si falló o no hubo novedades se conserva la versión anterior.
    ...(datos.version !== undefined && { version: datos.version }),
  };
  await db
    .insert(capturas)
    .values({ fuente, ...valores })
    .onConflictDoUpdate({ target: capturas.fuente, set: valores });
}
