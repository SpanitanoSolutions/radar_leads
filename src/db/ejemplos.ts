import { eq, sql } from "drizzle-orm";
import { db, schema } from "./index";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Borra la cartera de ejemplo: asegurados (y con ellos sus pólizas, cuotas,
 * comprobantes, seguimientos y siniestros), mensajes, solicitudes,
 * liquidaciones, bitácora e importaciones marcadas como ejemplo. Las
 * conexiones que se sembraron como conectadas vuelven a "sin conectar".
 * No toca nada que haya cargado el productor.
 */
export async function borrarEjemplosDeCartera(tx: Tx | typeof db = db): Promise<number> {
  const borrados = await tx
    .delete(schema.asegurados)
    .where(eq(schema.asegurados.esEjemplo, true))
    .returning({ id: schema.asegurados.id });
  await tx.delete(schema.mensajes).where(eq(schema.mensajes.esEjemplo, true));
  await tx.delete(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.esEjemplo, true));
  await tx.delete(schema.liquidacionesComision).where(eq(schema.liquidacionesComision.esEjemplo, true));
  await tx.delete(schema.actividadAgentes).where(eq(schema.actividadAgentes.esEjemplo, true));
  await tx.delete(schema.importaciones).where(eq(schema.importaciones.esEjemplo, true));
  await tx
    .update(schema.conexiones)
    .set({ estado: "sin_conectar", datos: {}, actualizadoEl: new Date() })
    .where(sql`${schema.conexiones.datos} ->> 'ejemplo' = 'true'`);
  // Los archivos que quedaron sin comprobante ni documento que los use.
  await tx.execute(sql`
    delete from archivos a
    where not exists (select 1 from comprobantes c where c.archivo_id = a.id)
      and not exists (select 1 from documentos_asegurado d where d.archivo_id = a.id)
      and not exists (select 1 from siniestro_documentos s where s.archivo_id = a.id)
  `);
  return borrados.length;
}

/** Si hay asegurados de ejemplo (para la etiqueta "Datos de ejemplo"). */
export async function hayEjemplosDeCartera(): Promise<boolean> {
  const [fila] = await db
    .select({ id: schema.asegurados.id })
    .from(schema.asegurados)
    .where(eq(schema.asegurados.esEjemplo, true))
    .limit(1);
  return Boolean(fila);
}
