import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Ajustes } from "@/db/schema";

const AJUSTES_POR_DEFECTO: Pick<Ajustes, "zonas" | "licitaciones"> = {
  zonas: { mdp: true, costa: true, provincia: true },
  licitaciones: { municipal: true, provincial: true, nacional: true },
};

export async function obtenerSectores() {
  return db.select().from(schema.sectores).orderBy(asc(schema.sectores.orden));
}

export async function obtenerAjustes() {
  const [fila] = await db.select().from(schema.ajustes).where(eq(schema.ajustes.id, 1));
  return fila ?? AJUSTES_POR_DEFECTO;
}

export async function obtenerLeads() {
  return db.select().from(schema.leads);
}

export async function obtenerLead(id: number) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) return null;
  const [sector] = await db
    .select()
    .from(schema.sectores)
    .where(eq(schema.sectores.id, lead.sectorId));
  return { lead, sector };
}
