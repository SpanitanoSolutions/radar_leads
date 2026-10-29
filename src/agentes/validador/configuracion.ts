import "server-only";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { companiaCanonica } from "@/lib/importacion";
import { filasDe, type CambioGracia } from "@/lib/validador/gracia";
import { OPERACION_LISTADO } from "@/lib/validador/listados";
import type { AlcanceValidador } from "./cartera";

// Configuración del Validador (sección 5.6 de docs/specs/validador-v2.md):
// lo que se guarda desde /agentes/validador/configuracion. Cada nivel de la
// cascada tiene su fila; acá se escribe la del alcance que se edita.

const igualONulo = (columna: AnyPgColumn, valor: string | null): SQL => (valor === null ? isNull(columna) : eq(columna, valor));

type CambiosConfig = Partial<Omit<typeof schema.validadorConfig.$inferInsert, "id" | "orgId" | "producerId" | "actualizadoEl">>;

/** Actualiza (o crea) la fila de validador_config del alcance. Lo que no viene, no se toca. */
export async function guardarConfig(cambios: CambiosConfig, alcance: AlcanceValidador) {
  const v = schema.validadorConfig;
  const delAlcance = and(igualONulo(v.orgId, alcance.orgId), igualONulo(v.producerId, alcance.producerId));
  await db.transaction(async (tx) => {
    const [fila] = await tx.select({ id: v.id }).from(v).where(delAlcance);
    if (fila) await tx.update(v).set({ ...cambios, actualizadoEl: new Date() }).where(eq(v.id, fila.id));
    else await tx.insert(v).values({ ...cambios, ...alcance });
  });
}

/**
 * Guarda la grilla de gracia de un ramo. Cada compañía se busca por su
 * nombre canónico (puede haber filas viejas como "SANCOR"): con días, se
 * actualiza o se crea; sin días, se borra.
 */
export async function guardarGracia(ramo: string, cambios: CambioGracia[], alcance: AlcanceValidador): Promise<number> {
  const g = schema.validadorGracia;
  return db.transaction(async (tx) => {
    const filas = await tx.select().from(g);
    let cambiadas = 0;
    for (const cambio of cambios) {
      const actuales = filasDe(filas, cambio.compania, ramo, alcance);
      const [primera, ...sobrantes] = actuales;
      if (!cambio.dias) {
        if (actuales.length) await tx.delete(g).where(inArray(g.id, actuales.map((f) => f.id)));
        cambiadas += actuales.length ? 1 : 0;
        continue;
      }
      const { diasPrimera, diasSiguientes } = cambio.dias;
      if (primera && primera.habilitado && primera.diasPrimera === diasPrimera && primera.diasSiguientes === diasSiguientes && !sobrantes.length) continue;
      if (sobrantes.length) await tx.delete(g).where(inArray(g.id, sobrantes.map((f) => f.id)));
      if (primera) await tx.update(g).set({ diasPrimera, diasSiguientes, habilitado: true, actualizadoEl: new Date() }).where(eq(g.id, primera.id));
      else await tx.insert(g).values({ compania: companiaCanonica(cambio.compania), ramo, diasPrimera, diasSiguientes, habilitado: true, ...alcance });
      cambiadas++;
    }
    if (cambiadas) {
      await tx.insert(schema.actividadAgentes).values({
        agente: "validador",
        texto: `Cambiaste la gracia de ${cambiadas === 1 ? "1 compañía" : `${cambiadas} compañías`} (${ramo === "*" ? "todos los ramos" : ramo}).`,
      });
    }
    return cambiadas;
  });
}

/**
 * La plantilla de listado de una compañía deja de usarse: el próximo listado
 * se vuelve a proponer y a confirmar. No se borra (queda la historia).
 */
export async function desconfirmarPlantilla(id: number, alcance: AlcanceValidador) {
  const m = schema.conectorMapeos;
  const [fila] = await db
    .update(m)
    .set({ confirmado: false })
    .where(and(eq(m.id, id), eq(m.operacion, OPERACION_LISTADO), igualONulo(m.orgId, alcance.orgId), igualONulo(m.producerId, alcance.producerId)))
    .returning({ compania: m.compania, version: m.version });
  if (fila) {
    await db.insert(schema.actividadAgentes).values({
      agente: "validador",
      texto: `Dejaste de usar la plantilla ${fila.version} del listado de ${fila.compania}: el próximo listado se vuelve a confirmar.`,
    });
  }
}
