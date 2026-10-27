import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { Ajustes } from "@/db/schema";
import { diaEnArgentina, sumarDias } from "./fechas";
import type { ContadoresMenu } from "./menu";

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

export async function obtenerCartera() {
  await connection();
  return db.select().from(schema.cartera).orderBy(asc(schema.cartera.cliente));
}

/** Solo los CUIT de la cartera, para marcar los leads que ya son clientes. */
export async function obtenerCuitsDeCartera() {
  await connection();
  return db.select({ cuit: schema.cartera.cuit }).from(schema.cartera);
}

export type Cuenta = {
  nombre: string | null;
  matricula: string | null;
  organizacion: string | null;
  telefono: string | null;
  email: string | null;
};

type FilaMarco = {
  asegurados: number;
  vencen30: number;
  leads: number;
  ultima_importacion: string | null;
  nombre: string | null;
  matricula: string | null;
  organizacion: string | null;
  telefono: string | null;
  email: string | null;
};

// Un cliente de la cartera se reconoce por su CUIT o, si no tiene, por su nombre.
const CLAVE_CLIENTE = sql.raw(`coalesce(nullif(regexp_replace(cuit, '\\D', '', 'g'), ''), lower(cliente))`);

/**
 * Lo que necesita el marco de todas las pantallas (barra superior y menú):
 * datos del productor y contadores, en una sola consulta.
 */
export async function obtenerMarco(): Promise<{ cuenta: Cuenta; contadores: ContadoresMenu }> {
  await connection();
  const hoy = diaEnArgentina(new Date());
  const en30 = sumarDias(hoy, 30);
  const [f] = (await db.execute(sql`
    select
      (select count(distinct ${CLAVE_CLIENTE})::int from cartera) as asegurados,
      (select count(distinct ${CLAVE_CLIENTE})::int from cartera
        where vencimiento between ${hoy} and ${en30}) as vencen30,
      (select count(*)::int from leads l
        join sectores s on s.id = l.sector_id and s.activo
        left join ajustes a on a.id = 1
        where l.estado <> 'descartado'
          and coalesce((a.zonas ->> l.zona::text)::boolean, true)
          and (l.alcance_licitacion is null
            or coalesce((a.licitaciones ->> l.alcance_licitacion::text)::boolean, true))) as leads,
      (select to_char(max(cargado_el) at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') from cartera)
        as ultima_importacion,
      a.productor_nombre as nombre,
      a.productor_matricula as matricula,
      a.productor_organizacion as organizacion,
      a.productor_telefono as telefono,
      a.productor_email as email
    from (select 1) uno
    left join ajustes a on a.id = 1
  `)) as unknown as FilaMarco[];

  return {
    cuenta: {
      nombre: f.nombre ?? process.env.NOMBRE_PRODUCTOR ?? null,
      matricula: f.matricula,
      organizacion: f.organizacion,
      telefono: f.telefono,
      email: f.email,
    },
    contadores: {
      asegurados: f.asegurados,
      vencen30: f.vencen30,
      leads: f.leads,
      // Los agentes llegan en las fases siguientes: por ahora, sin configurar.
      agentes: { cotizacion: null, validador: null, siniestros: null, cobranza: null, conciliador: null },
      conexionesPendientes: 0,
      ultimaImportacion: f.ultima_importacion ? { fecha: f.ultima_importacion, archivo: null } : null,
    },
  };
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
