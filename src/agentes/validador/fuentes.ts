import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ErrorCorridaValidador } from "@/db/schema";
import { ejecutarEnCompania } from "@/lib/conectores/ejecutar";
import { autorizacion } from "@/lib/conectores/permisos";
import type { Cancelacion, PagoNormalizado, TipoConector } from "@/lib/conectores/tipos";
import { encolarTrabajo } from "@/lib/ia/cola";
import { ErrorTrabajo } from "@/lib/ia/trabajos";
import { companiaCanonica, leerArchivoTabla, TAMANO_MAXIMO_ARCHIVO, type Tabla } from "@/lib/importacion";
import {
  faltanEnMapeo,
  leerListado,
  leerMapeoListado,
  mapeoDePropuestaIA,
  OPERACION_LISTADO,
  proponerMapeoPorSinonimos,
  type MapeoListado,
  type PlantillaListado,
} from "@/lib/validador/listados";
import { planDeFuente, procesarFuente } from "@/lib/validador/procesar";
import { configValidador, cuotasDeCompania, guardarProceso, type AlcanceValidador } from "./cartera";
import { extraerListadoPdf, iaDisponible, OPERACIONES_IA, proponerMapeoConIA } from "./ia";

// Fuentes del Validador (sección 4 de docs/specs/validador-v2.md): listados
// de cobranza que sube el productor y lo que traen los conectores de las
// compañías. Un formato conocido se lee con su plantilla, sin IA; uno nuevo
// se propone (con IA o por sinónimos) y el productor lo confirma una vez.

export type ArchivoSubido = { nombre: string; tipo: string; contenido: Buffer };
type Fuente = typeof schema.validadorFuentes.$inferSelect;
type Formato = "xlsx" | "csv" | "pdf";

const AGENTE = "validador";
const ENTIDAD = "validador_fuentes";

function formatoDe(archivo: ArchivoSubido): Formato | null {
  const [a, b, c, d] = archivo.contenido;
  if (/\.pdf$/i.test(archivo.nombre) || (a === 0x25 && b === 0x50 && c === 0x44 && d === 0x46)) return "pdf";
  if (/\.xlsx$/i.test(archivo.nombre) || (a === 0x50 && b === 0x4b)) return "xlsx";
  if (/\.(csv|txt)$/i.test(archivo.nombre)) return "csv";
  return null;
}

const delAlcance = (tabla: { orgId: typeof schema.conectorMapeos.orgId; producerId: typeof schema.conectorMapeos.producerId }, alcance: AlcanceValidador) =>
  and(
    alcance.orgId ? or(isNull(tabla.orgId), eq(tabla.orgId, alcance.orgId)) : isNull(tabla.orgId),
    alcance.producerId ? or(isNull(tabla.producerId), eq(tabla.producerId, alcance.producerId)) : isNull(tabla.producerId),
  );

/** Las plantillas confirmadas de los listados de una compañía. */
export async function plantillasDe(compania: string, alcance: AlcanceValidador): Promise<PlantillaListado[]> {
  const m = schema.conectorMapeos;
  const filas = await db.select().from(m)
    .where(and(eq(m.operacion, OPERACION_LISTADO), eq(m.confirmado, true), delAlcance(m, alcance)))
    .orderBy(desc(m.version));
  return filas
    .filter((f) => companiaCanonica(f.compania) === companiaCanonica(compania))
    .flatMap((f) => {
      const mapeo = leerMapeoListado(f.mapeo);
      return mapeo ? [{ id: f.id, compania: f.compania, version: f.version, mapeo }] : [];
    });
}

async function tablaDe(fuente: Fuente): Promise<Tabla | null> {
  if (fuente.extraccion) return { archivo: fuente.nombre ?? "listado.pdf", ...fuente.extraccion, separador: null, filaInicial: 2 };
  if (!fuente.archivoId || fuente.formato === "pdf") return null;
  const [archivo] = await db.select().from(schema.archivos).where(eq(schema.archivos.id, fuente.archivoId));
  if (!archivo) return null;
  const bytes = archivo.contenido;
  return leerArchivoTabla({ name: archivo.nombre, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
}

async function actualizar(fuenteId: number, cambios: Partial<Fuente>) {
  await db.update(schema.validadorFuentes).set(cambios).where(eq(schema.validadorFuentes.id, fuenteId));
}

async function bitacora(texto: string, referencia: string | null = null) {
  await db.insert(schema.actividadAgentes).values({ agente: AGENTE, texto, referencia });
}

/** Lee la fuente con una plantilla, cruza con la cartera y guarda. Sin IA. */
async function leerYGuardar(fuente: Fuente, tabla: Tabla, plantilla: PlantillaListado, alcance: AlcanceValidador, corridaId: number | null) {
  const lectura = leerListado(tabla, plantilla.mapeo, fuente.compania);
  const config = await configValidador(alcance);
  const resultado = procesarFuente({ pagos: lectura.filas }, await cuotasDeCompania(fuente.compania), { toleranciaMonto: config.toleranciaMonto });
  const actualizadas = await guardarProceso({ fuenteId: fuente.id, corridaId, compania: fuente.compania, tipo: "archivo", resultado, alcance });
  await actualizar(fuente.id, {
    estado: "procesada",
    mapeoId: plantilla.id,
    corridaId: corridaId ?? fuente.corridaId,
    filasExtraidas: lectura.filas.length,
    problemas: lectura.problemas,
    errorSeguro: null,
  });
  const t = resultado.totales;
  await bitacora(
    `Leyó el listado de ${fuente.compania} (${fuente.nombre ?? "sin nombre"}): ${t.pagadas} cuotas pagadas, ${t.canceladas} canceladas, ${t.aRevisar} a revisar y ${t.noIdentificados} pagos no identificados${lectura.problemas.length ? `; ${lectura.problemas.length} filas no se pudieron leer` : ""}.`,
    `fuente:${fuente.id}`,
  );
  return { actualizadas, totales: t, problemas: lectura.problemas.length };
}

export type EstadoFuente = {
  fuenteId: number;
  compania: string;
  estado: string;
  mensaje: string;
  /** Si se leyó: cuántas cuotas cambiaron y qué se encontró. */
  actualizadas?: number;
  totales?: ReturnType<typeof procesarFuente>["totales"];
};

/**
 * Hace lo que toca con una fuente según planDeFuente: la lee con su
 * plantilla, encola la IA o deja la propuesta por sinónimos para confirmar.
 */
export async function avanzarFuente(fuenteId: number, opciones: { alcance: AlcanceValidador; corridaId?: number | null }): Promise<EstadoFuente> {
  const [fuente] = await db.select().from(schema.validadorFuentes).where(eq(schema.validadorFuentes.id, fuenteId));
  if (!fuente) throw new Error("Fuente inexistente");
  const { alcance } = opciones;
  const formato = fuente.formato as Formato;
  const tabla = await tablaDe(fuente);
  const operacionIA = tabla ? OPERACIONES_IA.mapear : OPERACIONES_IA.extraerListado;
  const plan = planDeFuente({
    formato,
    encabezados: tabla?.encabezados ?? null,
    compania: fuente.compania,
    plantillas: await plantillasDe(fuente.compania, alcance),
    iaDisponible: await iaDisponible(operacionIA, alcance),
  });

  if (plan.paso === "leer_con_plantilla") {
    const r = await leerYGuardar(fuente, tabla!, plan.plantilla, alcance, opciones.corridaId ?? null);
    return { fuenteId, compania: fuente.compania, estado: "procesada", mensaje: `Se actualizaron ${r.actualizadas} cuotas.`, actualizadas: r.actualizadas, totales: r.totales };
  }
  if (plan.paso === "sin_ia") {
    await actualizar(fuenteId, { estado: "error", errorSeguro: plan.motivo });
    return { fuenteId, compania: fuente.compania, estado: "error", mensaje: plan.motivo };
  }
  if (plan.paso === "proponer_mapeo" && plan.con === "sinonimos") {
    await actualizar(fuenteId, { estado: "mapeo_por_confirmar", mapeoPropuesto: { ...proponerMapeoPorSinonimos(tabla!.encabezados), origen: "manual" } });
    return { fuenteId, compania: fuente.compania, estado: "mapeo_por_confirmar", mensaje: "Es un formato nuevo: confirmá qué dato tiene cada columna." };
  }
  await encolarTrabajo({ agente: AGENTE, operacion: operacionIA, entidad: ENTIDAD, entidadId: fuenteId, ...alcance });
  await actualizar(fuenteId, { estado: "extrayendo", errorSeguro: null });
  return { fuenteId, compania: fuente.compania, estado: "extrayendo", mensaje: plan.paso === "extraer_con_ia" ? "La IA está leyendo el PDF." : "La IA está proponiendo cómo leer el formato nuevo." };
}

/** Guarda un listado subido y lo procesa: al instante si el formato es conocido. */
export async function importarListado(archivo: ArchivoSubido, compania: string, alcance: AlcanceValidador): Promise<EstadoFuente> {
  if (archivo.contenido.length > TAMANO_MAXIMO_ARCHIVO * 5) throw new Error("El archivo es demasiado grande (máximo 20 MB).");
  const formato = formatoDe(archivo);
  if (!formato) throw new Error("El listado tiene que ser un Excel (.xlsx), un CSV o un PDF.");
  const fuenteId = await db.transaction(async (tx) => {
    const [guardado] = await tx.insert(schema.archivos).values({ nombre: archivo.nombre, tipo: archivo.tipo || "application/octet-stream", tamano: archivo.contenido.length, contenido: archivo.contenido }).returning({ id: schema.archivos.id });
    const [fuente] = await tx.insert(schema.validadorFuentes).values({
      compania: companiaCanonica(compania),
      tipo: "archivo",
      nombre: archivo.nombre,
      formato,
      archivoId: guardado.id,
      ...alcance,
    }).returning({ id: schema.validadorFuentes.id });
    return fuente.id;
  });
  try {
    return await avanzarFuente(fuenteId, { alcance });
  } catch (error) {
    // Un archivo que no se puede leer (por ejemplo, un .xls viejo) queda registrado con el motivo.
    const mensaje = error instanceof Error && !/datos|database|sql/i.test(error.message) ? error.message : "No se pudo leer el listado.";
    await actualizar(fuenteId, { estado: "error", errorSeguro: mensaje });
    return { fuenteId, compania: companiaCanonica(compania), estado: "error", mensaje };
  }
}

/**
 * El productor confirma (o corrige) el mapeo de un formato nuevo: queda como
 * plantilla de la compañía, en una versión nueva, y la fuente se procesa.
 */
export async function confirmarMapeo(fuenteId: number, mapeo: MapeoListado, alcance: AlcanceValidador): Promise<EstadoFuente> {
  const faltan = faltanEnMapeo(mapeo);
  if (faltan.length) throw new Error(`Falta indicar ${faltan.join(", ")}.`);
  const [fuente] = await db.select().from(schema.validadorFuentes).where(eq(schema.validadorFuentes.id, fuenteId));
  if (!fuente) throw new Error("Fuente inexistente");
  const m = schema.conectorMapeos;
  const anteriores = await db.select({ version: m.version }).from(m)
    .where(and(eq(m.compania, fuente.compania), eq(m.ramo, "*"), eq(m.operacion, OPERACION_LISTADO), delAlcance(m, alcance)))
    .orderBy(desc(m.version)).limit(1);
  const origen = (fuente.mapeoPropuesto as { origen?: string } | null)?.origen === "ia" ? "ia" : "manual";
  await db.insert(m).values({
    compania: fuente.compania,
    ramo: "*",
    operacion: OPERACION_LISTADO,
    version: (anteriores[0]?.version ?? 0) + 1,
    mapeo,
    origen,
    confirmado: true,
    confirmadoEl: new Date(),
    ...alcance,
  });
  await bitacora(`Guardó la plantilla del listado de ${fuente.compania}: la próxima vez se lee sin preguntar.`, `fuente:${fuenteId}`);
  return avanzarFuente(fuenteId, { alcance });
}

/** Las fuentes subidas que quedaron sin procesar (por ejemplo, porque falló algo): las retoma la corrida. */
export async function fuentesPendientes(): Promise<number[]> {
  const filas = await db.select({ id: schema.validadorFuentes.id }).from(schema.validadorFuentes)
    .where(and(eq(schema.validadorFuentes.tipo, "archivo"), eq(schema.validadorFuentes.estado, "pendiente")));
  return filas.map((f) => f.id);
}

// ---------- Manejadores de la cola ia_trabajos ----------

async function fuenteDelTrabajo(entidadId: number) {
  const [fuente] = await db.select().from(schema.validadorFuentes).where(eq(schema.validadorFuentes.id, entidadId));
  if (!fuente) throw new ErrorTrabajo("La fuente ya no existe.", false);
  return fuente;
}

const alcanceDe = (fuente: Fuente): AlcanceValidador => ({ orgId: fuente.orgId, producerId: fuente.producerId });

/** validador:extraer_listado — la IA transcribe el PDF; después sigue como cualquier tabla. */
export async function manejarExtraerListado(entidadId: number) {
  const fuente = await fuenteDelTrabajo(entidadId);
  const [archivo] = fuente.archivoId ? await db.select().from(schema.archivos).where(eq(schema.archivos.id, fuente.archivoId)) : [];
  if (!archivo) throw new ErrorTrabajo("El PDF ya no está guardado.", false);
  const r = await extraerListadoPdf({ nombre: archivo.nombre, tipoMime: "application/pdf", contenido: archivo.contenido }, alcanceDe(fuente));
  if (!r.ok || !r.datos.tabla.encabezados.length) {
    const mensaje = "La IA no pudo leer el PDF. Bajá el listado de la compañía en Excel o CSV.";
    await actualizar(fuente.id, { estado: "error", errorSeguro: mensaje });
    throw new ErrorTrabajo(mensaje, false);
  }
  await actualizar(fuente.id, {
    extraccion: r.datos.tabla,
    mapeoPropuesto: { ...mapeoDePropuestaIA(r.datos.propuesta, r.datos.tabla.encabezados), origen: "ia" },
  });
  // Con la tabla ya transcripta: si hay plantilla se lee; si no, queda la propuesta de la IA para confirmar.
  const plan = planDeFuente({ formato: "pdf", encabezados: r.datos.tabla.encabezados, compania: fuente.compania, plantillas: await plantillasDe(fuente.compania, alcanceDe(fuente)), iaDisponible: false });
  if (plan.paso === "leer_con_plantilla") await avanzarFuente(fuente.id, { alcance: alcanceDe(fuente) });
  else await actualizar(fuente.id, { estado: "mapeo_por_confirmar" });
}

/** validador:mapear_listado — la IA propone el mapeo; si falla, quedan los sinónimos. Nunca frena. */
export async function manejarMapearListado(entidadId: number) {
  const fuente = await fuenteDelTrabajo(entidadId);
  const tabla = await tablaDe(fuente);
  if (!tabla) throw new ErrorTrabajo("El listado ya no está guardado.", false);
  const r = await proponerMapeoConIA(tabla, alcanceDe(fuente));
  const propuesto = r.ok
    ? { ...mapeoDePropuestaIA(r.datos, tabla.encabezados), origen: "ia" }
    : { ...proponerMapeoPorSinonimos(tabla.encabezados), origen: "manual" };
  await actualizar(fuente.id, { estado: "mapeo_por_confirmar", mapeoPropuesto: propuesto });
}

// ---------- Conectores ----------

export type ResultadoConector =
  | { estado: "sin_conector" }
  | { estado: "ok"; fuenteId: number; canal: TipoConector; actualizadas: number; totales: ReturnType<typeof procesarFuente>["totales"] }
  | { estado: "error"; error: ErrorCorridaValidador };

const MENSAJE_FALLA: Record<string, string> = {
  credencial_vencida: "la credencial del portal venció",
  portal_cambiado: "el portal cambió",
  timeout: "no respondió a tiempo",
  no_disponible: "no está disponible",
};

/**
 * Trae de la compañía el estado de cobranza y las anulaciones del período
 * por el mejor canal (api → portal). Si todos fallan, la compañía vuelve a la
 * importación manual y queda el error en la corrida (y en conector_salud).
 */
export async function traerDeConectores(compania: string, periodo: { desde: string; hasta: string }, corridaId: number, alcance: AlcanceValidador): Promise<ResultadoConector> {
  const contexto = { agente: AGENTE, entidad: "validador_corridas", entidadId: corridaId, ...alcance };
  const cobranza = await ejecutarEnCompania(compania, "obtenerEstadoCobranza", [periodo.desde, periodo.hasta], { contexto, autorizacion: autorizacion() });
  if (!cobranza.ok) {
    if (cobranza.motivo === "manual" && !cobranza.intentos.length) return { estado: "sin_conector" };
    const codigos = [...new Set(cobranza.intentos.map((i) => i.codigoError).filter((c): c is NonNullable<typeof c> => Boolean(c)))];
    const detalle = codigos.map((c) => MENSAJE_FALLA[c] ?? c.replace(/_/g, " ")).join(" y ");
    return {
      estado: "error",
      error: { compania, codigo: codigos[0] ?? cobranza.motivo, mensaje: `No se pudo consultar la cobranza (${detalle || "sin respuesta"}): queda la importación manual del listado.` },
    };
  }
  const anulaciones = await ejecutarEnCompania(compania, "obtenerCancelaciones", [periodo.desde, periodo.hasta], { contexto, autorizacion: autorizacion() });
  const cancelaciones: Cancelacion[] = anulaciones.ok ? anulaciones.valor : [];

  const [fuente] = await db.insert(schema.validadorFuentes).values({
    corridaId,
    compania: companiaCanonica(compania),
    tipo: cobranza.canal,
    nombre: `Conector ${cobranza.canal}`,
    periodoDesde: periodo.desde,
    periodoHasta: periodo.hasta,
    formato: "conector",
    estado: "procesada",
    filasExtraidas: cobranza.valor.length,
    ...alcance,
  }).returning({ id: schema.validadorFuentes.id });
  const config = await configValidador(alcance);
  const pagos = cobranza.valor.map((pago: PagoNormalizado) => ({ fila: null, original: null, pago }));
  const resultado = procesarFuente({ pagos, cancelaciones }, await cuotasDeCompania(compania), { toleranciaMonto: config.toleranciaMonto });
  const actualizadas = await guardarProceso({ fuenteId: fuente.id, corridaId, compania: companiaCanonica(compania), tipo: cobranza.canal, resultado, alcance });
  return { estado: "ok", fuenteId: fuente.id, canal: cobranza.canal, actualizadas, totales: resultado.totales };
}
