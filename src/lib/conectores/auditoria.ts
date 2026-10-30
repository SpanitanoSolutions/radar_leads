import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { efectoEnSalud, type IntentoCanal, type SaludCanal } from "./canales";
import type { ConectorCompania, TipoConector } from "./tipos";

/** Quién llama y para qué entidad. Nunca datos del asegurado. */
export type ContextoConector = {
  agente: string;
  orgId?: string | null;
  producerId?: string | null;
  entidad?: string;
  entidadId?: number;
};

export const igualONulo = (columna: AnyPgColumn, valor: string | null) => valor === null ? isNull(columna) : eq(columna, valor);

function filtroSalud(compania: string, canal: TipoConector, contexto: ContextoConector) {
  return and(
    eq(schema.conectorSalud.compania, compania),
    eq(schema.conectorSalud.canal, canal),
    igualONulo(schema.conectorSalud.orgId, contexto.orgId ?? null),
    igualONulo(schema.conectorSalud.producerId, contexto.producerId ?? null),
  );
}

async function actualizarSalud(intento: IntentoCanal, contexto: ContextoConector) {
  const efecto = efectoEnSalud(intento);
  if (!efecto) return;
  const ahora = new Date();
  const cambios = efecto === "exito"
    ? { ultimoExitoEl: ahora, latenciaMs: intento.duracionMs, credencialVencida: false, portalCambiado: false, actualizadoEl: ahora }
    : {
        ultimoErrorEl: ahora,
        codigoUltimoError: intento.codigoError,
        ...(intento.codigoError === "credencial_vencida" ? { credencialVencida: true } : {}),
        ...(intento.codigoError === "portal_cambiado" ? { portalCambiado: true } : {}),
        actualizadoEl: ahora,
      };
  const filtro = filtroSalud(intento.compania, intento.canal, contexto);
  const [actual] = await db.select({ id: schema.conectorSalud.id }).from(schema.conectorSalud).where(filtro).limit(1);
  if (actual) await db.update(schema.conectorSalud).set(cambios).where(eq(schema.conectorSalud.id, actual.id));
  else {
    await db.insert(schema.conectorSalud).values({
      compania: intento.compania,
      canal: intento.canal,
      orgId: contexto.orgId ?? null,
      producerId: contexto.producerId ?? null,
      ...cambios,
    });
  }
}

/** Registra un intento en conector_llamadas y actualiza la salud del canal. Si la base falla, no corta la operación. */
export function auditar(contexto: ContextoConector) {
  return async (intento: IntentoCanal) => {
    try {
      await db.insert(schema.conectorLlamadas).values({
        compania: intento.compania,
        canal: intento.canal,
        agente: contexto.agente,
        operacion: intento.operacion,
        resultado: intento.resultado,
        codigoError: intento.codigoError,
        duracionMs: Math.round(intento.duracionMs),
        entidad: contexto.entidad ?? null,
        entidadId: contexto.entidadId ?? null,
        orgId: contexto.orgId ?? null,
        producerId: contexto.producerId ?? null,
      });
      await actualizarSalud(intento, contexto);
    } catch {
      console.error(`No se pudo auditar la llamada a ${intento.compania} por ${intento.canal}.`);
    }
  };
}

/** Salud guardada de los canales de una compañía, para saltear los que tienen la credencial vencida o el portal cambiado. */
export async function saludDe(compania: string, contexto: ContextoConector): Promise<(conector: ConectorCompania) => SaludCanal | undefined> {
  const filas = await db.select().from(schema.conectorSalud).where(and(
    eq(schema.conectorSalud.compania, compania),
    igualONulo(schema.conectorSalud.orgId, contexto.orgId ?? null),
    igualONulo(schema.conectorSalud.producerId, contexto.producerId ?? null),
  ));
  const porCanal = new Map(filas.map((fila) => [fila.canal, { credencialVencida: fila.credencialVencida, portalCambiado: fila.portalCambiado }]));
  return (conector) => porCanal.get(conector.tipo);
}
