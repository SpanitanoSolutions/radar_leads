import "server-only";
import { and, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { igualONulo, type ContextoConector } from "./auditoria";
import { canalesValidos } from "./canales";
import type { AlcanceCredencial } from "./credenciales";
import type { TipoConector } from "./tipos";

/**
 * El alcance de Configuración → Conexiones con las compañías: por ahora todo
 * es de una sola cuenta, el mismo que la cartera del Validador y las claves
 * de Cotización.
 */
export const ALCANCE_CONEXIONES: AlcanceCredencial = { orgId: null, producerId: null };

const t = schema.conectorCompanias;
const delAlcance = (alcance: AlcanceCredencial) => and(igualONulo(t.orgId, alcance.orgId), igualONulo(t.producerId, alcance.producerId));

/**
 * El orden de canales de la compañía (conector_companias), para el alcance de
 * quien llama. Sin fila devuelve undefined: se usan todos los conectores
 * registrados, en el orden de siempre.
 */
export async function canalesDeCompania(compania: string, contexto: Pick<ContextoConector, "orgId" | "producerId">): Promise<TipoConector[] | undefined> {
  const [fila] = await db.select({ canales: t.canales }).from(t).where(and(
    eq(t.compania, compania),
    delAlcance({ orgId: contexto.orgId ?? null, producerId: contexto.producerId ?? null }),
  )).limit(1);
  return fila ? canalesValidos(fila.canales) : undefined;
}

/**
 * Guarda el orden de canales de la compañía. `null` vuelve al automático
 * (borra la fila); `[]` deja solo correo o carga manual. Vale para todos los
 * agentes.
 */
export async function guardarCanalesDeCompania(compania: string, canales: TipoConector[] | null, alcance: AlcanceCredencial): Promise<void> {
  if (canales === null) {
    await db.delete(t).where(and(eq(t.compania, compania), delAlcance(alcance)));
    return;
  }
  await db.insert(t)
    .values({ compania, canales, orgId: alcance.orgId, producerId: alcance.producerId })
    .onConflictDoUpdate({ target: [t.compania, t.orgId, t.producerId], set: { canales, actualizadoEl: new Date() } });
}

/** Lo que guardó cada compañía del alcance: el orden de canales y la salud de cada canal. */
export async function conexionesGuardadas(alcance: AlcanceCredencial) {
  await connection();
  const s = schema.conectorSalud;
  const [canales, salud] = await Promise.all([
    db.select({ compania: t.compania, canales: t.canales }).from(t).where(delAlcance(alcance)),
    db.select().from(s).where(and(igualONulo(s.orgId, alcance.orgId), igualONulo(s.producerId, alcance.producerId))),
  ]);
  return { canales, salud };
}
