import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { igualONulo, type ContextoConector } from "./auditoria";
import { canalesValidos } from "./canales";
import type { TipoConector } from "./tipos";

/**
 * El orden de canales de la compañía (conector_companias), para el alcance de
 * quien llama. Sin fila devuelve undefined: se usan todos los conectores
 * registrados, en el orden de siempre.
 */
export async function canalesDeCompania(compania: string, contexto: Pick<ContextoConector, "orgId" | "producerId">): Promise<TipoConector[] | undefined> {
  const t = schema.conectorCompanias;
  const [fila] = await db.select({ canales: t.canales }).from(t).where(and(
    eq(t.compania, compania),
    igualONulo(t.orgId, contexto.orgId ?? null),
    igualONulo(t.producerId, contexto.producerId ?? null),
  )).limit(1);
  return fila ? canalesValidos(fila.canales) : undefined;
}
