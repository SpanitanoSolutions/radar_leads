import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { fechaCorta } from "@/lib/fechas";
import {
  claveDeAsegurado,
  claveDePoliza,
  combinarDatosCompania,
  type DatoProvisorio,
  type FilaCartera,
  type ValidacionCartera,
} from "@/lib/importacion";
import { borrarEjemplosDeCartera } from "./ejemplos";
import { db, schema } from "./index";
import type { DatoCompania, ResumenImportacion } from "./schema";

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

/** Sin espacios ni mayúsculas: "4410-3321908 " y "4410-3321908" son el mismo número. */
function numeroNormal(numero: string): string {
  return numero.replace(/\s/g, "").toLowerCase();
}

/**
 * Guarda una importación de cartera. Reimportar es la forma en que el
 * productor actualiza su cartera, así que nunca se borra nada: lo que ya está
 * se actualiza con lo que trae el archivo, lo nuevo se suma, y lo que el
 * archivo no trae (o trae de relleno, como "Sin ramo") queda como estaba. Los
 * asegurados se reconocen por DNI o CUIT (sin documento, por el nombre) y las
 * pólizas por compañía y número: nunca se duplican. Al reemplazar, lo que no
 * vino se da de baja, sin borrarlo.
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

    // Asegurados: uno por documento o, los que no tienen, uno por nombre.
    const porAsegurado = new Map<string, FilaCartera[]>();
    for (const f of v.filas) porAsegurado.set(f.clave, [...(porAsegurado.get(f.clave) ?? []), f]);
    const documentos = [...new Set(v.filas.map((f) => f.documentoDigitos).filter((d): d is string => Boolean(d)))];
    const sinDocumento = [...new Set(v.filas.filter((f) => !f.documentoDigitos).map((f) => f.nombre))];
    const existentes = new Map<string, number>();
    for (const pedazo of enPedazos(documentos)) {
      const filas = await tx
        .select({ id: asegurados.id, documentoDigitos: asegurados.documentoDigitos })
        .from(asegurados)
        .where(inArray(asegurados.documentoDigitos, pedazo));
      for (const f of filas) if (f.documentoDigitos) existentes.set(f.documentoDigitos, f.id);
    }
    for (const pedazo of enPedazos(sinDocumento)) {
      const filas = await tx
        .select({ id: asegurados.id, nombre: asegurados.nombre })
        .from(asegurados)
        .where(and(isNull(asegurados.documentoDigitos), inArray(asegurados.nombre, pedazo)));
      for (const f of filas) existentes.set(claveDeAsegurado(null, f.nombre), f.id);
    }

    // Las pólizas que ya están, por compañía y número: se reconocen aunque el
    // productor haya corregido el documento o el nombre del asegurado en la ficha.
    const numeros = [...new Set(v.filas.map((f) => f.numero).filter((n): n is string => Boolean(n)))];
    type PolizaCargada = { id: number; aseguradoId: number; vigenciaHasta: string | null; datosCompania: DatoCompania[] | null };
    const porNumero = new Map<string, PolizaCargada[]>();
    for (const pedazo of enPedazos(numeros)) {
      const filas = await tx
        .select({
          id: polizas.id,
          aseguradoId: polizas.aseguradoId,
          numero: polizas.numero,
          compania: polizas.compania,
          vigenciaHasta: polizas.vigenciaHasta,
          datosCompania: polizas.datosCompania,
        })
        .from(polizas)
        .where(inArray(polizas.numero, pedazo));
      for (const p of filas) {
        const k = claveDePoliza(p.compania ?? "", p.numero ?? "");
        porNumero.set(k, [...(porNumero.get(k) ?? []), p]);
      }
    }
    /** La póliza de la fila si ya está cargada y no hay dudas de cuál es. */
    const polizaCargada = (f: FilaCartera): PolizaCargada | null => {
      if (!f.numero || !f.compania) return null;
      const encontradas = porNumero.get(claveDePoliza(f.compania, f.numero)) ?? [];
      return encontradas.length === 1 ? encontradas[0] : null;
    };

    let aseguradosNuevos = 0;
    let aseguradosActualizados = 0;
    const idDe = new Map<string, number>();
    const nuevos: (typeof asegurados.$inferInsert)[] = [];
    const clavesNuevas: string[] = [];
    for (const [clave, filas] of porAsegurado) {
      // De los datos que pueden venir de relleno, el de la primera fila que los trae de verdad.
      const real = (dato: DatoProvisorio) => filas.find((f) => !f.provisorios.includes(dato));
      const datos = {
        tipo: (real("tipo") ?? filas[0]).tipo,
        nombre: (real("nombre") ?? filas[0]).nombre,
        documento: (real("documento") ?? filas[0]).documento,
        documentoDigitos: (real("documento") ?? filas[0]).documentoDigitos,
        localidad: primero(filas, "localidad"),
        telefono: primero(filas, "telefono"),
        email: primero(filas, "email"),
        domicilio: primero(filas, "domicilio"),
        codigoPostal: primero(filas, "codigoPostal"),
        fechaNacimiento: primero(filas, "fechaNacimiento"),
        contactoNombre: filas[0].tipo === "empresa" ? primero(filas, "contacto") : null,
      };
      const id = existentes.get(clave) ?? filas.map(polizaCargada).find((p) => p !== null)?.aseguradoId;
      if (id) {
        // Lo vacío y lo de relleno no pisan lo cargado (por ejemplo, lo que el productor corrigió).
        const cambios = sinVacios(datos);
        if (!real("tipo")) delete cambios.tipo;
        if (!real("nombre")) delete cambios.nombre;
        if (!real("documento")) {
          delete cambios.documento;
          delete cambios.documentoDigitos;
        }
        await tx
          .update(asegurados)
          .set({ ...cambios, esEjemplo: false, bajaEl: null, importacionId: imp.id, actualizadoEl: ahora })
          .where(eq(asegurados.id, id));
        idDe.set(clave, id);
        aseguradosActualizados++;
      } else {
        nuevos.push({ ...datos, importacionId: imp.id });
        clavesNuevas.push(clave);
      }
    }
    // Postgres devuelve las filas insertadas en el mismo orden en que se mandan.
    for (const [i, pedazo] of enPedazos(nuevos, 500).entries()) {
      const filas = await tx.insert(asegurados).values(pedazo).returning({ id: asegurados.id });
      filas.forEach((f, j) => idDe.set(clavesNuevas[i * 500 + j], f.id));
      aseguradosNuevos += filas.length;
    }

    // Pólizas: por compañía y número o, si no, por número dentro del asegurado o, sin número, por ramo y compañía.
    const ids = [...new Set(idDe.values())];
    const actuales: (PolizaCargada & { numero: string | null; ramo: string; compania: string | null })[] = [];
    for (const pedazo of enPedazos(ids)) {
      actuales.push(
        ...(await tx
          .select({
            id: polizas.id,
            aseguradoId: polizas.aseguradoId,
            numero: polizas.numero,
            ramo: polizas.ramo,
            compania: polizas.compania,
            vigenciaHasta: polizas.vigenciaHasta,
            datosCompania: polizas.datosCompania,
          })
          .from(polizas)
          .where(inArray(polizas.aseguradoId, pedazo))),
      );
    }
    const clave = (aseguradoId: number, numero: string | null, ramo: string, compania: string | null) =>
      numero ? `${aseguradoId}#${numeroNormal(numero)}` : `${aseguradoId}|${ramo}|${compania ?? ""}`;
    const porClave = new Map(actuales.map((p) => [clave(p.aseguradoId, p.numero, p.ramo, p.compania), p]));

    let polizasNuevas = 0;
    let polizasActualizadas = 0;
    const tocadas: number[] = [];
    const nuevasPolizas: (typeof polizas.$inferInsert)[] = [];
    for (const f of v.filas) {
      const aseguradoId = idDe.get(f.clave)!;
      const datos = {
        ramo: f.ramo,
        compania: f.compania,
        numero: f.numero,
        bien: f.bien,
        cobertura: f.cobertura,
        producto: f.producto,
        vigenciaDesde: f.vigenciaDesde,
        vigenciaHasta: f.vigenciaHasta,
        prima: f.prima,
        premio: f.premio,
        sumaAsegurada: f.sumaAsegurada,
        cantidadCuotas: f.cuotas,
        formaPago: f.formaPago,
        datosCompania: f.datosCompania.length ? f.datosCompania : null,
      };
      const actual = polizaCargada(f) ?? porClave.get(clave(aseguradoId, f.numero, f.ramo, f.compania));
      if (actual) {
        // Si la compañía factura un período que llega hasta el vencimiento cargado o lo pasa, ese
        // vencimiento quedó viejo (el fin de un mes ya facturado, de una importación anterior): la
        // póliza sigue vigente mientras venga en la cartera. La fecha anterior queda en los otros datos.
        const vencimientoViejo =
          f.finDelPeriodo && actual.vigenciaHasta && actual.vigenciaHasta <= f.finDelPeriodo ? actual.vigenciaHasta : null;
        const datosCompania = combinarDatosCompania(actual.datosCompania, [
          ...f.datosCompania,
          ...(vencimientoViejo ? [{ etiqueta: "Fin de vigencia anterior", valor: fechaCorta(vencimientoViejo) }] : []),
        ]);
        // Lo vacío no pisa, un ramo de relleno tampoco, y de los otros datos no se pierde ninguno.
        const cambios = sinVacios({ ...datos, datosCompania });
        if (f.provisorios.includes("ramo")) delete cambios.ramo;
        await tx
          .update(polizas)
          .set({ ...cambios, ...(vencimientoViejo ? { vigenciaHasta: null } : {}), bajaEl: null, importacionId: imp.id, actualizadoEl: ahora })
          .where(eq(polizas.id, actual.id));
        tocadas.push(actual.id);
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

    // Reemplazar: las pólizas de esas compañías que no vinieron quedan de baja (no se borran).
    // Si el archivo no dice de qué compañía es, no se da de baja nada.
    let dadosDeBaja = 0;
    const companias = [...new Set(v.filas.map((f) => f.compania).filter((c): c is string => Boolean(c)))];
    if (o.modo === "reemplazar" && companias.length) {
      const condiciones = [
        isNull(polizas.bajaEl),
        sql`${polizas.aseguradoId} in (select id from asegurados where not es_ejemplo)`,
        inArray(polizas.compania, companias),
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

