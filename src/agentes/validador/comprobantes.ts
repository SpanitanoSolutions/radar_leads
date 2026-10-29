import "server-only";
import { and, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CanalComprobante } from "@/db/schema";
import { encolarTrabajo } from "@/lib/ia/cola";
import { ErrorTrabajo } from "@/lib/ia/trabajos";
import { diaEnArgentina, sumarDias } from "@/lib/fechas";
import type { Moneda } from "@/lib/conectores/tipos";
import { cobrosParaComprobante, companiaDeDestino, comprobanteParaMatch, verificarExtraccion, type ComprobanteExtraido } from "@/lib/validador/comprobantes";
import { proponerCobros } from "@/lib/validador/matching";
import { confirmarCobro } from "../cobros";
import { configValidador, type AlcanceValidador } from "./cartera";
import type { ArchivoSubido } from "./fuentes";
import { extraerComprobante, iaDisponible, OPERACIONES_IA } from "./ia";

// Comprobantes que sube el productor (o que llegan por WhatsApp más adelante)
// sin saber a qué cuota corresponden. La IA los lee, el matching propone el
// cobro con su puntaje y el productor confirma: nunca se marcan pagados solos.

const AGENTE = "validador";
const TIPOS = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;
const TAMANO_MAXIMO = 5 * 1024 * 1024;

/** Guarda el comprobante y, si la IA está activa, la pone a leerlo en segundo plano. */
export async function subirComprobante(archivo: ArchivoSubido, canal: CanalComprobante, alcance: AlcanceValidador): Promise<{ id: number; conIA: boolean }> {
  if (!TIPOS.test(archivo.tipo)) throw new Error("El comprobante tiene que ser una foto (JPG, PNG o WEBP) o un PDF.");
  if (archivo.contenido.length > TAMANO_MAXIMO) throw new Error("El comprobante pesa más de 5 MB.");
  const conIA = await iaDisponible(OPERACIONES_IA.extraerComprobante, alcance);
  const id = await db.transaction(async (tx) => {
    const [guardado] = await tx.insert(schema.archivos).values({ nombre: archivo.nombre, tipo: archivo.tipo, tamano: archivo.contenido.length, contenido: archivo.contenido }).returning({ id: schema.archivos.id });
    const [comprobante] = await tx.insert(schema.comprobantes).values({ canal, archivoId: guardado.id, extraccion: conIA ? "pendiente" : "manual" }).returning({ id: schema.comprobantes.id });
    if (conIA) await encolarTrabajo({ agente: AGENTE, operacion: OPERACIONES_IA.extraerComprobante, entidad: "comprobantes", entidadId: comprobante.id, ...alcance }, tx);
    return comprobante.id;
  });
  return { id, conIA };
}

/** Las cuotas impagas de los últimos cuatro meses y los próximos dos, agrupadas en cobros. */
async function cobrosAbiertos(hoy: string) {
  const { cuotas, polizas, asegurados } = schema;
  const filas = await db
    .select({
      id: cuotas.id,
      aseguradoId: asegurados.id,
      asegurado: asegurados.nombre,
      documento: asegurados.documento,
      compania: polizas.compania,
      poliza: polizas.numero,
      cupon: cuotas.cupon,
      monto: cuotas.monto,
      moneda: cuotas.moneda,
      vencimiento: cuotas.vencimiento,
    })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(and(
      ne(cuotas.estado, "pagada"),
      or(isNull(cuotas.estadoValidacion), ne(cuotas.estadoValidacion, "cancelada")),
      gte(cuotas.vencimiento, sumarDias(hoy, -120)),
      lte(cuotas.vencimiento, sumarDias(hoy, 60)),
      isNull(asegurados.bajaEl),
    ));
  return cobrosParaComprobante(filas.map((f) => ({ ...f, moneda: f.moneda as Moneda })));
}

/** Guarda lo leído y la propuesta del matching. El comprobante sigue "por revisar". */
async function proponer(id: number, leido: ComprobanteExtraido, extraccion: "ia" | "manual", alcance: AlcanceValidador) {
  const datos = verificarExtraccion(leido);
  const cuentas = new Map((await db.select({ nombre: schema.companias.nombre, cuentas: schema.companias.cuentas }).from(schema.companias)).map((c) => [c.nombre, c.cuentas]));
  const compania = companiaDeDestino([datos.destinoTitular, datos.destinoCuenta], cuentas);
  const config = await configValidador(alcance);
  const propuesta = proponerCobros(comprobanteParaMatch(datos, compania), await cobrosAbiertos(diaEnArgentina(new Date())), { toleranciaMonto: config.toleranciaMonto });
  await db.update(schema.comprobantes).set({
    monto: datos.monto,
    moneda: datos.moneda ?? "ARS",
    fecha: datos.fecha ? new Date(`${datos.fecha}T12:00:00-03:00`) : null,
    medio: datos.medio,
    destino: [datos.destinoTitular, datos.destinoCuenta].filter(Boolean).join(" · ") || null,
    numeroOperacion: datos.numeroOperacion,
    referencia: datos.referencia,
    pagador: datos.pagador,
    documentoPagador: datos.documentoPagador,
    extraccion,
    candidatos: propuesta.candidatos,
    motivoPropuesta: propuesta.motivo,
  }).where(eq(schema.comprobantes.id, id));
  return propuesta;
}

/** El productor carga (o corrige) los datos del comprobante a mano: se vuelve a proponer el cobro. */
export async function completarComprobante(id: number, datos: ComprobanteExtraido, alcance: AlcanceValidador) {
  return proponer(id, datos, "manual", alcance);
}

/** validador:extraer_comprobante — si la IA no puede, queda para cargarlo a mano. */
export async function manejarExtraerComprobante(entidadId: number, alcance: AlcanceValidador) {
  const [comprobante] = await db.select().from(schema.comprobantes).where(eq(schema.comprobantes.id, entidadId));
  if (!comprobante) throw new ErrorTrabajo("El comprobante ya no existe.", false);
  const [archivo] = comprobante.archivoId ? await db.select().from(schema.archivos).where(eq(schema.archivos.id, comprobante.archivoId)) : [];
  if (!archivo) throw new ErrorTrabajo("El archivo del comprobante ya no está guardado.", false);
  const r = await extraerComprobante({ nombre: archivo.nombre, tipoMime: archivo.tipo, contenido: archivo.contenido }, alcance);
  if (!r.ok) {
    await db.update(schema.comprobantes).set({ extraccion: "error", motivoPropuesta: "La IA no pudo leer el comprobante: cargá los datos a mano." }).where(eq(schema.comprobantes.id, entidadId));
    throw new ErrorTrabajo("La IA no pudo leer el comprobante.", false);
  }
  await proponer(entidadId, r.datos, "ia", alcance);
}

/**
 * El productor confirma a qué cobro corresponde: recién ahí la cuota queda
 * pagada (origen "comprobante") y se corta la cobranza.
 */
export async function confirmarComprobante(id: number, cabezaId: number) {
  const [comprobante] = await db.select().from(schema.comprobantes).where(eq(schema.comprobantes.id, id));
  if (!comprobante || comprobante.estado !== "por_revisar") throw new Error("El comprobante ya se revisó.");
  await db.update(schema.comprobantes).set({ cuotaId: cabezaId }).where(eq(schema.comprobantes.id, id));
  await confirmarCobro(cabezaId, { medio: comprobante.medio ?? "Comprobante", origen: "comprobante" });
  await db.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia: `cuota:${cabezaId}`, texto: `Confirmaste el comprobante ${comprobante.numeroOperacion ? `de la operación ${comprobante.numeroOperacion} ` : ""}como pago del cobro.` });
}

export async function descartarComprobante(id: number) {
  await db.update(schema.comprobantes).set({ estado: "rechazado", revisadoEl: new Date() }).where(and(eq(schema.comprobantes.id, id), eq(schema.comprobantes.estado, "por_revisar")));
}
