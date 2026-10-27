import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { FilaCartera, ValidacionCartera } from "@/lib/importacion";
import { borrarEjemplosDeCartera } from "./ejemplos";
import { db, schema } from "./index";
import type { ResumenImportacion } from "./schema";

const { asegurados, polizas } = schema;

export type OpcionesImportacion = {
  archivo: string;
  validacion: ValidacionCartera;
  /** "combinar" actualiza y suma; "reemplazar" además da de baja las pólizas de esas compañías que no vinieron. */
  modo: "combinar" | "reemplazar";
  quitarEjemplos: boolean;
};

/** De a pedazos, para no pasar el límite de parámetros de Postgres. */
function enPedazos<T>(lista: T[], tamano = 1000): T[][] {
  const pedazos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) pedazos.push(lista.slice(i, i + tamano));
  return pedazos;
}

/** El primer valor no vacío entre las filas del mismo asegurado. */
function primero<K extends keyof FilaCartera>(filas: FilaCartera[], campo: K): FilaCartera[K] | null {
  return filas.find((f) => f[campo] !== null && f[campo] !== "")?.[campo] ?? null;
}

/** Solo los datos que vinieron: lo que ya estaba cargado no se pisa con vacíos. */
function sinVacios<T extends Record<string, unknown>>(datos: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null && v !== undefined && v !== "")) as {
    [K in keyof T]?: NonNullable<T[K]>;
  };
}

/**
 * Guarda una importación de cartera. Los asegurados se reconocen por DNI o
 * CUIT y las pólizas por número (o, si no tienen, por ramo y compañía): nunca
 * se duplican. Nada se borra: al reemplazar, lo que no vino se da de baja.
 */
export async function guardarImportacion(o: OpcionesImportacion): Promise<ResumenImportacion & { importacionId: number }> {
  const { validacion: v } = o;
  const errores = new Set(v.problemas.filter((p) => p.tipo === "error").map((p) => p.fila)).size;
  const advertencias = v.problemas.filter((p) => p.tipo === "advertencia").length;

  return db.transaction(async (tx) => {
    if (o.quitarEjemplos) await borrarEjemplosDeCartera(tx);
    const ahora = new Date();
    const [imp] = await tx
      .insert(schema.importaciones)
      .values({ archivo: o.archivo, modo: o.modo, filas: v.totalFilas, errores, advertencias })
      .returning({ id: schema.importaciones.id });

    // Asegurados: uno por documento.
    const porDocumento = new Map<string, FilaCartera[]>();
    for (const f of v.filas) porDocumento.set(f.documentoDigitos, [...(porDocumento.get(f.documentoDigitos) ?? []), f]);
    const documentos = [...porDocumento.keys()];
    const existentes = new Map<string, number>();
    for (const pedazo of enPedazos(documentos)) {
      const filas = await tx
        .select({ id: asegurados.id, documentoDigitos: asegurados.documentoDigitos })
        .from(asegurados)
        .where(inArray(asegurados.documentoDigitos, pedazo));
      for (const f of filas) if (f.documentoDigitos) existentes.set(f.documentoDigitos, f.id);
    }

    let aseguradosNuevos = 0;
    let aseguradosActualizados = 0;
    const idDe = new Map<string, number>();
    const nuevos: (typeof asegurados.$inferInsert)[] = [];
    for (const [doc, filas] of porDocumento) {
      const datos = {
        tipo: filas[0].tipo,
        nombre: filas[0].nombre,
        documento: filas[0].documento,
        documentoDigitos: doc,
        localidad: primero(filas, "localidad"),
        telefono: primero(filas, "telefono"),
        email: primero(filas, "email"),
        domicilio: primero(filas, "domicilio"),
        contactoNombre: filas[0].tipo === "empresa" ? primero(filas, "contacto") : null,
      };
      const id = existentes.get(doc);
      if (id) {
        await tx
          .update(asegurados)
          .set({ ...sinVacios(datos), esEjemplo: false, bajaEl: null, importacionId: imp.id, actualizadoEl: ahora })
          .where(eq(asegurados.id, id));
        idDe.set(doc, id);
        aseguradosActualizados++;
      } else {
        nuevos.push({ ...datos, importacionId: imp.id });
      }
    }
    for (const pedazo of enPedazos(nuevos, 500)) {
      const filas = await tx.insert(asegurados).values(pedazo).returning({ id: asegurados.id, documentoDigitos: asegurados.documentoDigitos });
      for (const f of filas) idDe.set(f.documentoDigitos!, f.id);
      aseguradosNuevos += filas.length;
    }

    // Pólizas: por número dentro del asegurado o, sin número, por ramo y compañía.
    const ids = [...idDe.values()];
    const actuales: { id: number; aseguradoId: number; numero: string | null; ramo: string; compania: string | null }[] = [];
    for (const pedazo of enPedazos(ids)) {
      actuales.push(
        ...(await tx
          .select({ id: polizas.id, aseguradoId: polizas.aseguradoId, numero: polizas.numero, ramo: polizas.ramo, compania: polizas.compania })
          .from(polizas)
          .where(inArray(polizas.aseguradoId, pedazo))),
      );
    }
    const clave = (aseguradoId: number, numero: string | null, ramo: string, compania: string | null) =>
      numero ? `${aseguradoId}#${numero.replace(/\s/g, "").toLowerCase()}` : `${aseguradoId}|${ramo}|${compania ?? ""}`;
    const porClave = new Map(actuales.map((p) => [clave(p.aseguradoId, p.numero, p.ramo, p.compania), p.id]));

    let polizasNuevas = 0;
    let polizasActualizadas = 0;
    const tocadas: number[] = [];
    const nuevasPolizas: (typeof polizas.$inferInsert)[] = [];
    for (const f of v.filas) {
      const aseguradoId = idDe.get(f.documentoDigitos)!;
      const datos = {
        ramo: f.ramo,
        compania: f.compania,
        numero: f.numero,
        bien: f.bien,
        cobertura: f.cobertura,
        vigenciaDesde: f.vigenciaDesde,
        vigenciaHasta: f.vigenciaHasta,
        prima: f.prima,
        cantidadCuotas: f.cuotas,
        formaPago: f.formaPago,
      };
      const id = porClave.get(clave(aseguradoId, f.numero, f.ramo, f.compania));
      if (id) {
        await tx
          .update(polizas)
          .set({ ...sinVacios(datos), bajaEl: null, importacionId: imp.id, actualizadoEl: ahora })
          .where(eq(polizas.id, id));
        tocadas.push(id);
        polizasActualizadas++;
      } else {
        nuevasPolizas.push({
          ...datos,
          aseguradoId,
          cantidadCuotas: f.cuotas ?? 12,
          vigenciaDesde: f.vigenciaDesde,
          importacionId: imp.id,
        });
      }
    }
    for (const pedazo of enPedazos(nuevasPolizas, 500)) {
      const filas = await tx.insert(polizas).values(pedazo).returning({ id: polizas.id });
      tocadas.push(...filas.map((f) => f.id));
      polizasNuevas += filas.length;
    }

    // Reemplazar: las pólizas de esas compañías que no vinieron quedan de baja.
    let dadosDeBaja = 0;
    if (o.modo === "reemplazar") {
      const companias = [...new Set(v.filas.map((f) => f.compania).filter((c): c is string => Boolean(c)))];
      const condiciones = [
        isNull(polizas.bajaEl),
        sql`${polizas.aseguradoId} in (select id from asegurados where not es_ejemplo)`,
        ...(companias.length ? [inArray(polizas.compania, companias)] : []),
        ...(tocadas.length ? [notInArray(polizas.id, tocadas)] : []),
      ];
      const bajas = await tx.update(polizas).set({ bajaEl: ahora }).where(and(...condiciones)).returning({ id: polizas.id });
      dadosDeBaja = bajas.length;
    }

    // Queda registrado en la actividad de cada asegurado.
    for (const pedazo of enPedazos(ids, 500)) {
      await tx
        .insert(schema.notasAsegurado)
        .values(pedazo.map((aseguradoId) => ({ aseguradoId, tipo: "sistema", texto: `Datos actualizados desde ${o.archivo}.` })));
    }

    const resumen: ResumenImportacion = {
      aseguradosNuevos,
      aseguradosActualizados,
      polizasNuevas,
      polizasActualizadas,
      dadosDeBaja,
      avisos: v.problemas.slice(0, 20).map((p) => `Fila ${p.fila}: ${p.mensaje}`),
    };
    await tx.update(schema.importaciones).set({ resumen }).where(eq(schema.importaciones.id, imp.id));
    return { ...resumen, importacionId: imp.id };
  });
}

