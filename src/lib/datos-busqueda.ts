import "server-only";
import { asc, desc, eq, ilike, or } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";

/** Busca clientes, pólizas y siniestros desde el acceso global del encabezado. */
export async function buscarGlobal(consulta: string) {
  await connection();
  const termino = consulta.trim().slice(0, 100);
  if (termino.length < 2) return { asegurados: [], polizas: [], siniestros: [] };

  const patron = `%${termino}%`;
  const digitos = termino.replace(/\D/g, "");
  const coincidenciasAsegurados = [
    ilike(schema.asegurados.nombre, patron),
    ilike(schema.asegurados.documento, patron),
    ilike(schema.asegurados.email, patron),
    ilike(schema.asegurados.telefono, patron),
    ilike(schema.asegurados.domicilio, patron),
    ilike(schema.asegurados.localidad, patron),
    ilike(schema.asegurados.contactoNombre, patron),
    ilike(schema.asegurados.contactoEmail, patron),
    ...(digitos ? [ilike(schema.asegurados.documentoDigitos, `%${digitos}%`)] : []),
  ];

  const [asegurados, polizas, siniestros] = await Promise.all([
    db.select({
      id: schema.asegurados.id,
      nombre: schema.asegurados.nombre,
      documento: schema.asegurados.documento,
      telefono: schema.asegurados.telefono,
      bajaEl: schema.asegurados.bajaEl,
    })
      .from(schema.asegurados)
      .where(or(...coincidenciasAsegurados))
      .orderBy(asc(schema.asegurados.nombre)),
    db.select({
      id: schema.polizas.id,
      aseguradoId: schema.polizas.aseguradoId,
      nombreAsegurado: schema.asegurados.nombre,
      numero: schema.polizas.numero,
      compania: schema.polizas.compania,
      ramo: schema.polizas.ramo,
      bien: schema.polizas.bien,
      bajaEl: schema.polizas.bajaEl,
    })
      .from(schema.polizas)
      .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
      .where(or(
        ilike(schema.polizas.numero, patron),
        ilike(schema.polizas.compania, patron),
        ilike(schema.polizas.ramo, patron),
        ilike(schema.polizas.bien, patron),
        ilike(schema.polizas.cobertura, patron),
        ilike(schema.polizas.producto, patron),
        ilike(schema.asegurados.nombre, patron),
      ))
      .orderBy(asc(schema.asegurados.nombre)),
    db.select({
      id: schema.siniestros.id,
      folio: schema.siniestros.folio,
      descripcion: schema.siniestros.descripcion,
      afectado: schema.siniestros.afectado,
      compania: schema.siniestros.compania,
      cerrado: schema.siniestros.cerrado,
      archivado: schema.siniestros.archivado,
      nombreAsegurado: schema.asegurados.nombre,
      numeroPoliza: schema.polizas.numero,
    })
      .from(schema.siniestros)
      .leftJoin(schema.asegurados, eq(schema.asegurados.id, schema.siniestros.aseguradoId))
      .leftJoin(schema.polizas, eq(schema.polizas.id, schema.siniestros.polizaId))
      .where(or(
        ilike(schema.siniestros.folio, patron),
        ilike(schema.siniestros.descripcion, patron),
        ilike(schema.siniestros.afectado, patron),
        ilike(schema.siniestros.lugar, patron),
        ilike(schema.siniestros.relato, patron),
        ilike(schema.siniestros.compania, patron),
        ilike(schema.siniestros.numeroCompania, patron),
        ilike(schema.asegurados.nombre, patron),
        ilike(schema.polizas.numero, patron),
      ))
      .orderBy(desc(schema.siniestros.fecha)),
  ]);

  return { asegurados, polizas, siniestros };
}
