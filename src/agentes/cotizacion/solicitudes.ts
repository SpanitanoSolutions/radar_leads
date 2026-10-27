import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { COMPANIAS_CON_PORTAL, COMPANIAS_POR_EMAIL } from "@/conexiones/catalogo";

export type NuevaSolicitud = {
  aseguradoId?: number | null;
  leadId?: number | null;
  cliente: string;
  tipo: "renovacion" | "mejora" | "nueva";
  ramo: string;
  bien?: string | null;
  motivo?: string | null;
  /** Si no se indica, se pide a todas las compañías con las que trabaja. */
  companias?: string[];
};

/**
 * Crea una solicitud de cotización cargada a mano (desde la cartera, una
 * oportunidad o un lead). El agente la toma y le pide precio a las compañías.
 * Devuelve el número visible de la solicitud.
 */
export async function crearSolicitud(s: NuevaSolicitud): Promise<number> {
  const companias = s.companias?.length ? s.companias : [...COMPANIAS_CON_PORTAL, ...COMPANIAS_POR_EMAIL];
  return db.transaction(async (tx) => {
    const [{ numero }] = (await tx.execute(
      sql`select coalesce(max(numero), 1000)::int + 1 as numero from solicitudes_cotizacion`,
    )) as unknown as { numero: number }[];
    await tx.insert(schema.solicitudesCotizacion).values({
      numero,
      aseguradoId: s.aseguradoId ?? null,
      leadId: s.leadId ?? null,
      cliente: s.cliente,
      tipo: s.tipo,
      ramo: s.ramo,
      bien: s.bien ?? null,
      motivo: s.motivo ?? null,
      origen: "manual",
      estado: "esperando",
      nota: "Pidiendo precios",
      companias,
    });
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${numero}`,
      texto: `Recibió la solicitud ${numero} (${s.ramo} · ${s.cliente}) y le pidió precio a ${companias.join(", ")}.`,
    });
    return numero;
  });
}
