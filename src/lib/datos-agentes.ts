import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { Comprobante, CuentaCompania } from "@/db/schema";
import { ALCANCE_CONEXIONES } from "./conectores/companias";
import { listarCredenciales } from "./conectores/credenciales";
import type { EventoBitacora } from "./cotizacion/bitacora";
import type { DatosChecklist } from "./cotizacion/configuracion";
import { momentosDelEnvio, type EnvioParaMetricas } from "./cotizacion/metricas";
import { sumarDias } from "./fechas";
import type { CuotaConPoliza } from "./validador";

// Lecturas de los agentes. Como todo en src/lib/datos*.ts, esperan a
// connection(): son datos vivos y nunca se leen durante el build.

const { cuotas, polizas, asegurados } = schema;

/** Las cuotas que la compañía canceló (anulación) no se cobran ni cuentan como deuda. */
const noCancelada = sql`coalesce(${cuotas.estadoValidacion}, '') <> 'cancelada'`;

export async function agenteConfigurado(agente: string): Promise<boolean> {
  await connection();
  const [fila] = await db
    .select({ configurado: schema.configuracionAgentes.configurado })
    .from(schema.configuracionAgentes)
    .where(eq(schema.configuracionAgentes.agente, agente));
  return fila?.configurado ?? false;
}

export async function obtenerConfigAgente<T>(agente: string): Promise<T | null> {
  await connection();
  const [fila] = await db.select().from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, agente));
  return (fila?.config as T) ?? null;
}

/** Claves de las conexiones que están conectadas. */
export async function conexionesConectadas(): Promise<Set<string>> {
  await connection();
  const filas = await db
    .select({ clave: schema.conexiones.clave, tipo: schema.conexiones.tipo, datos: schema.conexiones.datos })
    .from(schema.conexiones)
    .where(eq(schema.conexiones.estado, "conectado"));
  return new Set(
    filas
      .filter(({ clave, tipo, datos }) => {
        if (tipo === "whatsapp") {
          return datos.validadoReal === true && Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
        }
        if (["email", "google_calendar", "mercadopago"].includes(clave)) return typeof datos.credencialesCifradas === "string";
        if (tipo === "portal") return datos.integracionReal === true;
        if (tipo === "banco") return datos.proveedorReal === true;
        return true;
      })
      .map((fila) => fila.clave),
  );
}

const columnasCuota = {
  id: cuotas.id,
  numero: cuotas.numero,
  monto: cuotas.monto,
  vencimiento: cuotas.vencimiento,
  estado: cuotas.estado,
  pagadaEl: cuotas.pagadaEl,
  medioPago: cuotas.medioPago,
  polizaId: polizas.id,
  polizaNumero: polizas.numero,
  ramo: polizas.ramo,
  compania: polizas.compania,
  cantidadCuotas: polizas.cantidadCuotas,
  aseguradoId: asegurados.id,
  asegurado: asegurados.nombre,
};

/**
 * Cuotas que importan hoy: las impagas que vencen desde hace 60 días hasta
 * dentro de 30, y las pagadas en la última semana.
 */
export async function obtenerCuotasRecientes(hoy: string): Promise<CuotaConPoliza[]> {
  await connection();
  const haceUnaSemana = new Date(`${sumarDias(hoy, -7)}T00:00:00-03:00`);
  return db
    .select(columnasCuota)
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(
      and(
        isNull(asegurados.bajaEl),
        or(
          and(sql`${cuotas.estado} <> 'pagada'`, noCancelada, gte(cuotas.vencimiento, sumarDias(hoy, -60)), lte(cuotas.vencimiento, sumarDias(hoy, 30))),
          and(eq(cuotas.estado, "pagada"), gte(cuotas.pagadaEl, haceUnaSemana)),
        ),
      ),
    );
}

/** Cuotas por id (para confirmar un cobro completo desde su primera cuota). */
export async function obtenerCuotas(ids: number[]): Promise<CuotaConPoliza[]> {
  await connection();
  if (!ids.length) return [];
  return db
    .select(columnasCuota)
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(inArray(cuotas.id, ids));
}

/** El último comprobante de cada cuota. */
export async function obtenerComprobantes(cuotaIds: number[]): Promise<Map<number, Comprobante>> {
  await connection();
  if (!cuotaIds.length) return new Map();
  const filas = await db
    .select()
    .from(schema.comprobantes)
    .where(inArray(schema.comprobantes.cuotaId, cuotaIds))
    .orderBy(desc(schema.comprobantes.recibidoEl));
  const porCuota = new Map<number, Comprobante>();
  for (const c of filas) if (c.cuotaId !== null && !porCuota.has(c.cuotaId)) porCuota.set(c.cuotaId, c);
  return porCuota;
}

export async function obtenerCuentasCompanias(): Promise<Map<string, CuentaCompania[]>> {
  await connection();
  const filas = await db.select({ nombre: schema.companias.nombre, cuentas: schema.companias.cuentas }).from(schema.companias);
  return new Map(filas.map((f) => [f.nombre, f.cuentas]));
}

export async function obtenerActividad(agente: string, cuantas = 30) {
  await connection();
  return db
    .select()
    .from(schema.actividadAgentes)
    .where(eq(schema.actividadAgentes.agente, agente))
    .orderBy(desc(schema.actividadAgentes.fecha))
    .limit(cuantas);
}

/** El último mensaje enviado de cada cobro (para "Recordatorio enviado ayer por WhatsApp"). */
export async function obtenerUltimosEnvios(cabezaIds: number[]) {
  await connection();
  const resultado = new Map<number, { canal: string; enviadoEl: Date }>();
  if (!cabezaIds.length) return resultado;
  const filas = await db
    .select({ referencia: schema.mensajes.referencia, canal: schema.mensajes.canal, enviadoEl: schema.mensajes.enviadoEl })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.estado, "enviado"), sql`${schema.mensajes.referencia} like 'cuota:%'`))
    .orderBy(desc(schema.mensajes.enviadoEl));
  const buscadas = new Set(cabezaIds);
  for (const f of filas) {
    const id = Number(/^cuota:(\d+):/.exec(f.referencia ?? "")?.[1]);
    if (buscadas.has(id) && f.enviadoEl && !resultado.has(id)) resultado.set(id, { canal: f.canal, enviadoEl: f.enviadoEl });
  }
  return resultado;
}

/** Datos de contacto de varios asegurados. */
export async function obtenerContactos(ids: number[]) {
  await connection();
  if (!ids.length) return new Map<number, typeof asegurados.$inferSelect>();
  const filas = await db.select().from(asegurados).where(inArray(asegurados.id, ids));
  return new Map(filas.map((a) => [a.id, a]));
}

/** Siniestros con su póliza, asegurado, documentación e historial. */
export async function obtenerSiniestros() {
  await connection();
  const filas = await db
    .select({ siniestro: schema.siniestros, poliza: schema.polizas, asegurado: schema.asegurados })
    .from(schema.siniestros)
    .leftJoin(schema.polizas, eq(schema.polizas.id, schema.siniestros.polizaId))
    .leftJoin(schema.asegurados, eq(schema.asegurados.id, schema.siniestros.aseguradoId))
    .orderBy(desc(schema.siniestros.fecha));
  if (!filas.length) return [];

  const ids = filas.map((f) => f.siniestro.id);
  const [documentos, eventos, archivos, gastos, informes] = await Promise.all([
    db.select().from(schema.siniestroRequisitos).where(inArray(schema.siniestroRequisitos.siniestroId, ids)),
    db
      .select()
      .from(schema.siniestroEventos)
      .where(inArray(schema.siniestroEventos.siniestroId, ids))
      .orderBy(desc(schema.siniestroEventos.fecha)),
    db
      .select()
      .from(schema.siniestroArchivos)
      .where(inArray(schema.siniestroArchivos.siniestroId, ids))
      .orderBy(desc(schema.siniestroArchivos.subidoEl)),
    db.select().from(schema.siniestroGastos).where(inArray(schema.siniestroGastos.siniestroId, ids)).orderBy(desc(schema.siniestroGastos.fecha)),
    db.select().from(schema.siniestroInformes).where(inArray(schema.siniestroInformes.siniestroId, ids)).orderBy(desc(schema.siniestroInformes.creadoEl)),
  ]);
  const docsPorSiniestro = new Map<number, typeof documentos>();
  const eventosPorSiniestro = new Map<number, typeof eventos>();
  const archivosPorSiniestro = new Map<number, typeof archivos>();
  const gastosPorSiniestro = new Map<number, typeof gastos>();
  const informesPorSiniestro = new Map<number, typeof informes>();
  for (const doc of documentos) docsPorSiniestro.set(doc.siniestroId, [...(docsPorSiniestro.get(doc.siniestroId) ?? []), doc]);
  for (const evento of eventos) eventosPorSiniestro.set(evento.siniestroId, [...(eventosPorSiniestro.get(evento.siniestroId) ?? []), evento]);
  for (const archivo of archivos) archivosPorSiniestro.set(archivo.siniestroId, [...(archivosPorSiniestro.get(archivo.siniestroId) ?? []), archivo]);
  for (const gasto of gastos) gastosPorSiniestro.set(gasto.siniestroId, [...(gastosPorSiniestro.get(gasto.siniestroId) ?? []), gasto]);
  for (const informe of informes) informesPorSiniestro.set(informe.siniestroId, [...(informesPorSiniestro.get(informe.siniestroId) ?? []), informe]);

  return filas.map(({ siniestro, poliza, asegurado }) => ({
    siniestro,
    poliza,
    asegurado,
    documentos: docsPorSiniestro.get(siniestro.id) ?? [],
    eventos: eventosPorSiniestro.get(siniestro.id) ?? [],
    archivos: archivosPorSiniestro.get(siniestro.id) ?? [],
    gastos: gastosPorSiniestro.get(siniestro.id) ?? [],
    informes: informesPorSiniestro.get(siniestro.id) ?? [],
  }));
}

/** Pólizas vigentes disponibles para cargar un siniestro manual. */
export async function obtenerPolizasParaSiniestro() {
  await connection();
  return db
    .select({
      id: schema.polizas.id,
      aseguradoId: schema.asegurados.id,
      ramo: schema.polizas.ramo,
      compania: schema.polizas.compania,
      numero: schema.polizas.numero,
      bien: schema.polizas.bien,
      asegurado: schema.asegurados.nombre,
    })
    .from(schema.polizas)
    .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
    .where(and(isNull(schema.polizas.bajaEl), isNull(schema.asegurados.bajaEl)))
    .orderBy(asegurados.nombre);
}

/** Asegurados activos disponibles para vincular siniestros sin póliza. */
export async function obtenerAseguradosParaSiniestro() {
  await connection();
  return db
    .select({
      id: schema.asegurados.id,
      nombre: schema.asegurados.nombre,
      tipo: schema.asegurados.tipo,
      documento: schema.asegurados.documento,
      documentoDigitos: schema.asegurados.documentoDigitos,
      domicilio: schema.asegurados.domicilio,
    })
    .from(schema.asegurados)
    .where(isNull(schema.asegurados.bajaEl))
    .orderBy(schema.asegurados.nombre);
}

/** Reglas operativas de checklist y seguimiento del agente de Siniestros. */
export async function obtenerConfiguracionSiniestros() {
  await connection();
  return db.select().from(schema.siniestroConfiguracion).orderBy(schema.siniestroConfiguracion.compania, schema.siniestroConfiguracion.ramo, schema.siniestroConfiguracion.tipo);
}

/** Cuotas pagadas, acuerdos y liquidaciones para conciliar un mes. */
export async function obtenerDatosConciliacion(periodo: string) {
  await connection();
  const desde = new Date(`${periodo}-01T00:00:00-03:00`);
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + 1);
  const [cuotasMes, acuerdos, liquidaciones] = await Promise.all([
    db
      .select({
        asegurado: asegurados.nombre,
        polizaNumero: polizas.numero,
        polizaId: polizas.id,
        cuotaNumero: cuotas.numero,
        ramo: polizas.ramo,
        compania: polizas.compania,
        monto: cuotas.monto,
        pagadaEl: cuotas.pagadaEl,
      })
      .from(cuotas)
      .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
      .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
      .where(and(eq(cuotas.estado, "pagada"), gte(cuotas.pagadaEl, desde), lt(cuotas.pagadaEl, hasta), isNull(asegurados.bajaEl)))
      .orderBy(cuotas.pagadaEl),
    db.select().from(schema.acuerdosComision),
    db.select().from(schema.liquidacionesComision).where(eq(schema.liquidacionesComision.periodo, periodo)),
  ]);
  const liquidacionIds = liquidaciones.map((liquidacion) => liquidacion.id);
  const items = liquidacionIds.length
    ? await db.select().from(schema.liquidacionItems).where(inArray(schema.liquidacionItems.liquidacionId, liquidacionIds))
    : [];
  const itemsPorLiquidacion = new Map<number, typeof items>();
  for (const item of items) itemsPorLiquidacion.set(item.liquidacionId, [...(itemsPorLiquidacion.get(item.liquidacionId) ?? []), item]);

  return {
    cuotas: cuotasMes.flatMap((cuota) =>
      cuota.polizaNumero && cuota.compania && cuota.pagadaEl
        ? [{ ...cuota, polizaNumero: cuota.polizaNumero, compania: cuota.compania, pagadaEl: cuota.pagadaEl }]
        : [],
    ),
    acuerdos,
    liquidaciones: liquidaciones.map((liquidacion) => ({
      ...liquidacion,
      items: itemsPorLiquidacion.get(liquidacion.id) ?? [],
    })),
  };
}

/** Solicitudes con el vínculo actual a asegurados o leads. */
export async function obtenerSolicitudesCotizacion() {
  await connection();
  return db
    .select({ solicitud: schema.solicitudesCotizacion, asegurado: schema.asegurados.nombre, lead: schema.leads.empresa })
    .from(schema.solicitudesCotizacion)
    .leftJoin(schema.asegurados, eq(schema.asegurados.id, schema.solicitudesCotizacion.aseguradoId))
    .leftJoin(schema.leads, eq(schema.leads.id, schema.solicitudesCotizacion.leadId))
    .orderBy(desc(schema.solicitudesCotizacion.actualizadoEl));
}

export async function obtenerDetalleCotizacion(id: number) {
  await connection();
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, id));
  if (!solicitud) return null;
  const [asegurado, lead, envios, archivos, propuestas, eventos] = await Promise.all([
    solicitud.aseguradoId
      ? db.select().from(schema.asegurados).where(eq(schema.asegurados.id, solicitud.aseguradoId)).then((filas) => filas[0] ?? null)
      : Promise.resolve(null),
    solicitud.leadId
      ? db.select().from(schema.leads).where(eq(schema.leads.id, solicitud.leadId)).then((filas) => filas[0] ?? null)
      : Promise.resolve(null),
    db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.solicitudId, id)).orderBy(schema.cotizacionEnvios.id),
    db.select({ id: schema.cotizacionArchivos.id, envioId: schema.cotizacionArchivos.envioId, nombre: schema.cotizacionArchivos.nombre, mime: schema.cotizacionArchivos.mime, tamano: schema.cotizacionArchivos.tamano, creadoEl: schema.cotizacionArchivos.creadoEl }).from(schema.cotizacionArchivos).where(eq(schema.cotizacionArchivos.solicitudId, id)),
    db.select({ id: schema.cotizacionPropuestas.id, nombre: schema.cotizacionPropuestas.nombre, estado: schema.cotizacionPropuestas.estado, creadoEl: schema.cotizacionPropuestas.creadoEl }).from(schema.cotizacionPropuestas).where(eq(schema.cotizacionPropuestas.solicitudId, id)).orderBy(desc(schema.cotizacionPropuestas.creadoEl)),
    db.select().from(schema.cotizacionEventos).where(eq(schema.cotizacionEventos.solicitudId, id)).orderBy(desc(schema.cotizacionEventos.fecha)),
  ]);
  const envioIds = envios.map((envio) => envio.id);
  const paqueteIds = [...new Set(envios.flatMap((envio) => envio.paqueteId == null ? [] : [envio.paqueteId]))];
  const [resultados, paquetes] = await Promise.all([
    envioIds.length
      ? db.select().from(schema.cotizacionResultados).where(inArray(schema.cotizacionResultados.envioId, envioIds))
      : Promise.resolve([]),
    paqueteIds.length
      ? db.select({ id: schema.cotizacionPaquetes.id, nombre: schema.cotizacionPaquetes.nombre }).from(schema.cotizacionPaquetes).where(inArray(schema.cotizacionPaquetes.id, paqueteIds))
      : Promise.resolve([]),
  ]);
  return { solicitud, asegurado, lead, envios, archivos, propuestas, eventos, resultados, paquetes };
}

export async function obtenerAseguradorasCotizacion() {
  await connection();
  return db.select().from(schema.cotizacionAseguradoras).orderBy(schema.cotizacionAseguradoras.nombre);
}

/** Los tipos de seguro (los ramos que vende el productor), en el orden en que se cargaron. */
export async function obtenerTiposSeguroCotizacion() {
  await connection();
  return db.select({ ramo: schema.cotizacionTiposSeguro.ramo, descripcion: schema.cotizacionTiposSeguro.descripcion, activo: schema.cotizacionTiposSeguro.activo })
    .from(schema.cotizacionTiposSeguro).orderBy(schema.cotizacionTiposSeguro.id);
}

/** Los paquetes de cobertura: para el aviso "sin paquete configurado" y el paquete de cada envío. */
export async function obtenerPaquetesCotizacion() {
  await connection();
  return db.select({ id: schema.cotizacionPaquetes.id, aseguradoraId: schema.cotizacionPaquetes.aseguradoraId, ramo: schema.cotizacionPaquetes.ramo })
    .from(schema.cotizacionPaquetes);
}

/** Lo que mira el checklist del inicio de Cotización (src/lib/cotizacion/configuracion.ts). */
export async function obtenerChecklistCotizacion(): Promise<DatosChecklist> {
  await connection();
  const [aseguradoras, paquetes, credenciales, [config], [agente]] = await Promise.all([
    db.select({ id: schema.cotizacionAseguradoras.id, nombre: schema.cotizacionAseguradoras.nombre, activa: schema.cotizacionAseguradoras.activa, contactos: schema.cotizacionAseguradoras.contactos })
      .from(schema.cotizacionAseguradoras),
    db.select({ aseguradoraId: schema.cotizacionPaquetes.aseguradoraId }).from(schema.cotizacionPaquetes),
    listarCredenciales(ALCANCE_CONEXIONES),
    db.select({ persona: schema.cotizacionConfig.persona, nombreAgente: schema.cotizacionConfig.nombreAgente, personalidad: schema.cotizacionConfig.personalidad })
      .from(schema.cotizacionConfig).limit(1),
    db.select({ config: schema.configuracionAgentes.config }).from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, "cotizacion")),
  ]);
  return {
    aseguradoras,
    paquetes,
    credenciales,
    voz: config ? { ...config, elegida: agente?.config.vozElegida === true } : null,
  };
}

export async function obtenerEnviosCotizacion() {
  await connection();
  return db.select().from(schema.cotizacionEnvios).orderBy(desc(schema.cotizacionEnvios.creadoEl));
}

/** Compañías de cada solicitud cuya respuesta todavía espera la confirmación del productor. */
export async function obtenerRespuestasSinConfirmar(): Promise<Map<number, string[]>> {
  await connection();
  const filas = await db
    .select({ solicitudId: schema.cotizacionEnvios.solicitudId, compania: schema.cotizacionEnvios.compania })
    .from(schema.cotizacionResultados)
    .innerJoin(schema.cotizacionEnvios, eq(schema.cotizacionEnvios.id, schema.cotizacionResultados.envioId))
    .where(eq(schema.cotizacionResultados.confirmado, false));
  const porSolicitud = new Map<number, string[]>();
  for (const { solicitudId, compania } of filas) porSolicitud.set(solicitudId, [...(porSolicitud.get(solicitudId) ?? []), compania]);
  return porSolicitud;
}

export async function obtenerMetricasCotizacion() {
  await connection();
  const [envios, solicitudes, resultados] = await Promise.all([
    db.select().from(schema.cotizacionEnvios),
    db.select({ id: schema.solicitudesCotizacion.id, numero: schema.solicitudesCotizacion.numero, productor: schema.solicitudesCotizacion.ejecutivo, creadoEl: schema.solicitudesCotizacion.creadoEl, estado: schema.solicitudesCotizacion.estado, actualizadoEl: schema.solicitudesCotizacion.actualizadoEl, completadoEl: schema.solicitudesCotizacion.completadoEl }).from(schema.solicitudesCotizacion),
    db.select().from(schema.cotizacionResultados),
  ]);
  const solicitudesPorId = new Map(solicitudes.map((solicitud) => [solicitud.id, solicitud]));
  const resultadoPorEnvio = new Map(resultados.map((resultado) => [resultado.envioId, resultado]));
  return {
    envios: envios.flatMap((envio): EnvioParaMetricas[] => {
      const solicitud = solicitudesPorId.get(envio.solicitudId);
      if (!solicitud) return [];
      const resultado = resultadoPorEnvio.get(envio.id);
      // El tiempo de respuesta se mide desde que salió el pedido, no desde que se creó el borrador.
      const { salidoEl, respondidoEl } = momentosDelEnvio(envio, resultado);
      return [{
        solicitudId: envio.solicitudId,
        compania: envio.compania,
        productor: solicitud.productor ?? "Productor",
        estado: envio.estado,
        salidoEl,
        respondidoEl,
        primaNeta: resultado?.primaNeta ?? null,
        seguimientos: envio.cantidadSeguimientos,
      }];
    }),
    solicitudes: solicitudes.map((solicitud) => ({ ...solicitud, productor: solicitud.productor ?? "Productor" })),
  };
}

/** Los eventos de todas las solicitudes, con su número, cliente y compañía, para la bitácora del agente (los más nuevos). */
export async function obtenerBitacoraCotizacion(limite = 2000): Promise<EventoBitacora[]> {
  await connection();
  const e = schema.cotizacionEventos;
  return db.select({
    id: e.id, fecha: e.fecha, tipo: e.tipo, actor: e.actor, detalle: e.detalle, solicitudId: e.solicitudId,
    numero: schema.solicitudesCotizacion.numero, cliente: schema.solicitudesCotizacion.cliente, compania: schema.cotizacionEnvios.compania,
  })
    .from(e)
    .innerJoin(schema.solicitudesCotizacion, eq(schema.solicitudesCotizacion.id, e.solicitudId))
    .leftJoin(schema.cotizacionEnvios, eq(schema.cotizacionEnvios.id, e.envioId))
    .orderBy(desc(e.fecha), desc(e.id))
    .limit(limite);
}

/** Opciones de origen para cargar solicitudes desde Cotización. */
export async function obtenerOpcionesSolicitud() {
  await connection();
  const [aseguradosActivos, leadsActivos] = await Promise.all([
    db.select({ id: schema.asegurados.id, nombre: schema.asegurados.nombre }).from(schema.asegurados).where(isNull(schema.asegurados.bajaEl)).orderBy(schema.asegurados.nombre),
    db
      .select({ id: schema.leads.id, nombre: schema.leads.empresa })
      .from(schema.leads)
      .where(sql`${schema.leads.estado} <> 'descartado'`)
      .orderBy(schema.leads.empresa),
  ]);
  return { asegurados: aseguradosActivos, leads: leadsActivos };
}
