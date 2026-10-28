import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { Ajustes, Productor } from "@/db/schema";
import { diaEnArgentina, sumarDias } from "./fechas";
import { conexionesPendientes } from "@/conexiones/catalogo";
import type { AgenteId, ContadoresMenu } from "./menu";

export const AJUSTES_POR_DEFECTO: Pick<Ajustes, "zonas" | "licitaciones"> = {
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

/**
 * Pólizas vigentes con el formato que usan el resumen diario y el análisis de
 * cartera (una fila por póliza, con el cliente y su CUIT).
 */
export async function obtenerCartera() {
  await connection();
  const filas = await db
    .select({
      cliente: schema.asegurados.nombre,
      cuit: schema.asegurados.documento,
      ramo: schema.polizas.ramo,
      compania: schema.polizas.compania,
      vencimiento: schema.polizas.vigenciaHasta,
    })
    .from(schema.polizas)
    .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
    .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl)))
    .orderBy(asc(schema.asegurados.nombre));
  return filas.map(({ ramo, ...f }) => ({ ...f, ramos: [ramo] }));
}

/** Solo los documentos de los asegurados, para marcar los leads que ya son clientes. */
export async function obtenerCuitsDeCartera() {
  await connection();
  return db
    .select({ id: schema.asegurados.id, nombre: schema.asegurados.nombre, cuit: schema.asegurados.documento })
    .from(schema.asegurados)
    .where(isNull(schema.asegurados.bajaEl));
}

export type Cuenta = {
  nombre: string | null;
  matricula: string | null;
  productores: Productor[];
  organizacion: string | null;
  logoEmpresa: boolean;
  telefono: string | null;
  email: string | null;
};

function productoresDe(
  productores: Productor[] | null | undefined,
  nombre: string | null,
  matricula: string | null,
): Productor[] {
  if (productores?.length) return productores;
  return nombre || matricula ? [{ nombre: nombre ?? "", matricula: matricula ?? "" }] : [];
}

/** Datos del productor ("Mi cuenta"). El nombre cae a NOMBRE_PRODUCTOR si no lo cargó. */
export async function obtenerCuenta(): Promise<Cuenta> {
  await connection();
  const [a] = await db.select().from(schema.ajustes).where(eq(schema.ajustes.id, 1));
  return {
    nombre: a?.productorNombre ?? process.env.NOMBRE_PRODUCTOR ?? null,
    matricula: a?.productorMatricula ?? null,
    productores: productoresDe(a?.productores, a?.productorNombre ?? null, a?.productorMatricula ?? null),
    organizacion: a ? a.productorOrganizacion : "HR Productores",
    logoEmpresa: Boolean(a?.productorLogo),
    telefono: a?.productorTelefono ?? null,
    email: a?.productorEmail ?? null,
  };
}

/** Devuelve el logo guardado para servirlo desde un Route Handler autenticado. */
export async function obtenerLogoEmpresa(): Promise<string | null> {
  await connection();
  const [a] = await db.select({ logo: schema.ajustes.productorLogo }).from(schema.ajustes).where(eq(schema.ajustes.id, 1));
  return a?.logo ?? null;
}

type FilaMarco = {
  asegurados: number;
  vencen30: number;
  leads: number;
  importacion_fecha: string | null;
  importacion_archivo: string | null;
  importacion_filas: number | null;
  conectadas: string[];
  configurados: string[];
  cotizacion: number;
  validador: number;
  cobranza: number;
  nombre: string | null;
  matricula: string | null;
  productores: Productor[] | null;
  organizacion: string | null;
  logo_empresa: boolean | null;
  telefono: string | null;
  email: string | null;
  avisos_comprobantes: number;
  avisos_cobranza: number;
  avisos_cotizaciones: number;
  avisos_siniestros: number;
  avisos_cuotas_vencidas: number;
};

/**
 * Lo que necesita el marco de todas las pantallas (barra superior y menú):
 * datos del productor y contadores, en una sola consulta.
 */
export async function obtenerMarco(): Promise<{
  cuenta: Cuenta;
  contadores: ContadoresMenu;
  notificaciones: { comprobantes: number; cobranza: number; cotizaciones: number; siniestros: number; cuotasVencidas: number };
}> {
  await connection();
  const hoy = diaEnArgentina(new Date());
  const en30 = sumarDias(hoy, 30);
  const [f] = (await db.execute(sql`
    select
      (select count(*)::int from asegurados where baja_el is null) as asegurados,
      (select count(distinct p.asegurado_id)::int from polizas p
        join asegurados x on x.id = p.asegurado_id and x.baja_el is null
        where p.baja_el is null and p.vigencia_hasta between ${hoy} and ${en30}) as vencen30,
      (select count(*)::int from leads l
        join sectores s on s.id = l.sector_id and s.activo
        left join ajustes a on a.id = 1
        where l.estado <> 'descartado'
          and coalesce((a.zonas ->> l.zona::text)::boolean, true)
          and (l.alcance_licitacion is null
            or coalesce((a.licitaciones ->> l.alcance_licitacion::text)::boolean, true))) as leads,
      (select count(*)::int from comprobantes where estado = 'por_revisar') as avisos_comprobantes,
      (select count(*)::int from mensajes
        where agente = 'cobranza' and estado = 'borrador'
          and (mostrar_desde is null or mostrar_desde <= ${hoy})) as avisos_cobranza,
      (select count(*)::int from solicitudes_cotizacion where estado = 'atencion') as avisos_cotizaciones,
      (select count(*)::int from siniestros where cerrado = false) as avisos_siniestros,
      (select count(distinct c.poliza_id)::int from cuotas c
        join polizas p on p.id = c.poliza_id and p.baja_el is null
        join asegurados x on x.id = p.asegurado_id and x.baja_el is null
        where c.vencimiento < ${hoy} and c.estado in ('pendiente', 'vencida')) as avisos_cuotas_vencidas,
      i.fecha as importacion_fecha,
      i.archivo as importacion_archivo,
      i.filas as importacion_filas,
      (select coalesce(array_agg(clave), '{}') from conexiones where estado = 'conectado') as conectadas,
      (select coalesce(array_agg(agente), '{}') from configuracion_agentes where configurado) as configurados,
      (select count(*)::int from solicitudes_cotizacion where estado = 'atencion') as cotizacion,
      (select count(*)::int from comprobantes c
        where c.estado = 'por_revisar'
          and exists (select 1 from jsonb_array_elements(c.chequeos) ch where ch ->> 'resultado' <> 'ok')) as validador,
      (select count(*)::int from mensajes
        where agente = 'cobranza' and estado = 'borrador'
          and (mostrar_desde is null or mostrar_desde <= ${hoy})) as cobranza,
      a.productor_nombre as nombre,
      a.productor_matricula as matricula,
      a.productores as productores,
      a.productor_organizacion as organizacion,
      (a.productor_logo is not null) as logo_empresa,
      a.productor_telefono as telefono,
      a.productor_email as email
    from (select 1) uno
    left join ajustes a on a.id = 1
    left join lateral (
      select to_char(fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') as fecha, archivo, filas
      from importaciones order by fecha desc limit 1
    ) i on true
  `)) as unknown as FilaMarco[];

  const configurado = new Set(f.configurados);
  const siEsta = (agente: AgenteId, valor: number) => (configurado.has(agente) ? valor : null);
  return {
    cuenta: {
      nombre: f.nombre ?? process.env.NOMBRE_PRODUCTOR ?? null,
      matricula: f.matricula,
      productores: productoresDe(f.productores, f.nombre, f.matricula),
      organizacion: f.organizacion ?? "HR Productores",
      logoEmpresa: Boolean(f.logo_empresa),
      telefono: f.telefono,
      email: f.email,
    },
    contadores: {
      asegurados: f.asegurados,
      vencen30: f.vencen30,
      leads: f.leads,
      agentes: {
        cotizacion: siEsta("cotizacion", f.cotizacion),
        validador: siEsta("validador", f.validador),
        // Siniestros y conciliador se cuentan con sus reglas (fase de agentes).
        siniestros: siEsta("siniestros", 0),
        cobranza: siEsta("cobranza", f.cobranza),
        conciliador: siEsta("conciliador", 0),
      },
      conexionesPendientes: conexionesPendientes(f.conectadas).length,
      ultimaImportacion: f.importacion_fecha
        ? { fecha: f.importacion_fecha, archivo: f.importacion_archivo, filas: f.importacion_filas ?? undefined }
        : null,
    },
    notificaciones: {
      comprobantes: f.avisos_comprobantes,
      cobranza: f.avisos_cobranza,
      cotizaciones: f.avisos_cotizaciones,
      siniestros: f.avisos_siniestros,
      cuotasVencidas: f.avisos_cuotas_vencidas,
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

/** Conexiones guardadas (el catálogo dice cuáles existen). */
export async function obtenerConexiones() {
  await connection();
  return db.select().from(schema.conexiones);
}
