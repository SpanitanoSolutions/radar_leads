import "server-only";
import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { Ajustes } from "@/db/schema";

const AJUSTES_POR_DEFECTO: Pick<Ajustes, "zonas" | "licitaciones"> = {
  zonas: { mdp: true, costa: true, provincia: true },
  licitaciones: { municipal: true, provincial: true, nacional: true },
};

// Todas las lecturas esperan a connection(): son datos vivos, se leen en cada
// pedido y nunca durante el build.

export async function obtenerSectores() {
  await connection();
  return db.select().from(schema.sectores).orderBy(asc(schema.sectores.orden));
}

export async function obtenerAjustes() {
  await connection();
  const [fila] = await db.select().from(schema.ajustes).where(eq(schema.ajustes.id, 1));
  return fila ?? AJUSTES_POR_DEFECTO;
}

export async function obtenerLeads() {
  await connection();
  return db.select().from(schema.leads);
}

export async function obtenerLead(id: number) {
  await connection();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) return null;
  const [sector] = await db
    .select()
    .from(schema.sectores)
    .where(eq(schema.sectores.id, lead.sectorId));
  return { lead, sector };
}
