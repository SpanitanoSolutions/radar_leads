import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { agregarRespuesta, type RespuestaConfirmada } from "@/lib/cotizacion";
import type { Moneda } from "@/lib/conectores/tipos";
import { paqueteParaEnvio } from "@/lib/cotizacion/configuracion";
import { armarBorradorSolicitud } from "@/lib/cotizacion/correo";
import { ramoCanonico } from "@/lib/ramos";
import { autorizarCotizacion, despacharCotizaciones } from "./cotizar";

export type NuevaSolicitud = {
  aseguradoId?: number | null;
  leadId?: number | null;
  cliente: string;
  tipo: "renovacion" | "mejora" | "nueva" | "negocio_nuevo";
  ramo: string;
  bien?: string | null;
  motivo?: string | null;
  /** Si no se indica, se incluyen todas las compañías configuradas para cotizar. */
  companias?: string[];
  datosRiesgo?: Record<string, string | number | boolean | null>;
};

export class SinCompaniasCotizablesError extends Error {
  constructor() {
    super("No hay compañías configuradas para cotizar.");
    this.name = "SinCompaniasCotizablesError";
  }
}

/**
 * Crea una solicitud de cotización para las compañías configuradas en la cuenta.
 * La lista se vuelve a comprobar en el servidor; el formulario no puede ampliar
 * el conjunto de compañías habilitadas. Con "Cotizar automáticamente", el
 * agente ya pide la cotización a las compañías conectadas. Devuelve el número visible.
 */
export async function crearSolicitud(s: NuevaSolicitud): Promise<number> {
  const aseguradoras = await db.select().from(schema.cotizacionAseguradoras).where(eq(schema.cotizacionAseguradoras.activa, true));
  // El lead y la ficha usan los ramos de la cartera ("Flota", "Auto") y las compañías, los de Cotización ("Flotas", "Automotor").
  const ramo = ramoCanonico(s.ramo);
  const habilitadas = aseguradoras.filter((aseguradora) => !aseguradora.ramos.length || aseguradora.ramos.some((r) => ramoCanonico(r) === ramo)).map(({ nombre }) => nombre);
  if (!habilitadas.length) throw new SinCompaniasCotizablesError();

  const solicitadas = s.companias?.length ? [...new Set(s.companias)] : habilitadas;
  if (!solicitadas.length || solicitadas.some((compania) => !habilitadas.includes(compania))) {
    throw new Error("La solicitud incluye una compañía que no está configurada para cotizar.");
  }
  const companias = habilitadas.filter((compania) => solicitadas.includes(compania));
  const [[config], [ajustes], paquetes] = await Promise.all([
    db.select().from(schema.cotizacionConfig).limit(1),
    db.select({ productor: schema.ajustes.productorNombre, organizacion: schema.ajustes.productorOrganizacion }).from(schema.ajustes).where(eq(schema.ajustes.id, 1)),
    db.select({ id: schema.cotizacionPaquetes.id, aseguradoraId: schema.cotizacionPaquetes.aseguradoraId, ramo: schema.cotizacionPaquetes.ramo }).from(schema.cotizacionPaquetes),
  ]);
  // Los mismos valores que muestra la cuenta (obtenerCuenta()).
  const cuenta = { productor: ajustes?.productor ?? process.env.NOMBRE_PRODUCTOR ?? null, organizacion: ajustes ? ajustes.organizacion : "HR Productores" };
  const creada = await db.transaction(async (tx) => {
    const [{ numero }] = (await tx.execute(
      sql`select coalesce(max(numero), 1000)::int + 1 as numero from solicitudes_cotizacion`,
    )) as unknown as { numero: number }[];
    const [insertada] = await tx.insert(schema.solicitudesCotizacion).values({
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
      nota: "Pendiente de integración para enviar a las compañías",
      companias,
      cotizaciones: companias.map((compania) => ({ compania, precio: null, estado: "pendiente" as const })),
      datosRiesgo: s.datosRiesgo ?? {},
    }).returning({ id: schema.solicitudesCotizacion.id });
    const envios = companias.map((compania) => {
      const aseguradora = aseguradoras.find((fila) => fila.nombre === compania);
      const { asunto, cuerpo } = armarBorradorSolicitud({
        plantillaAsunto: config?.plantillaAsunto,
        plantillaCuerpo: config?.plantillaCuerpo,
        instruccionesCuerpo: config?.instruccionesCuerpo,
        aseguradora: { nombre: compania, asunto: aseguradora?.asunto, instrucciones: aseguradora?.instrucciones, codigoProductor: aseguradora?.codigoProductor },
        solicitud: { ramo: s.ramo, cliente: s.cliente, datosRiesgo: s.datosRiesgo },
        cuenta,
      });
      return {
        solicitudId: insertada.id,
        aseguradoraId: aseguradora?.id,
        compania,
        paqueteId: paqueteParaEnvio(aseguradora?.id, s.ramo, paquetes),
        canal: aseguradora?.canal ?? "correo" as const,
        estado: "pendiente" as const,
        asuntoBorrador: asunto,
        cuerpoBorrador: cuerpo,
      };
    });
    const insertados = await tx.insert(schema.cotizacionEnvios).values(envios).returning({ id: schema.cotizacionEnvios.id, compania: schema.cotizacionEnvios.compania });
    await tx.insert(schema.cotizacionEventos).values([
      { solicitudId: insertada.id, tipo: "solicitud_creada", detalle: "Se creó la solicitud y quedaron borradores pendientes de aprobación." },
      ...insertados.map(({ id, compania }) => ({ solicitudId: insertada.id, envioId: id, actor: "agente", tipo: "borrador_creado", detalle: `Borrador preparado para ${compania}; requiere aprobación del productor.` })),
    ]);
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${numero}`,
      texto: `Creó la solicitud ${numero}; hay ${companias.length} borradores pendientes de aprobación.`,
    });
    return { id: insertada.id, numero };
  });

  await db.update(schema.solicitudesCotizacion).set({ nota: `${companias.length} borradores listos para revisar. Todavía no se envió nada.`, actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, creada.id));
  if (config?.cotizarAutomaticamente) await despacharCotizaciones(await autorizarCotizacion(creada.id, "automatica") ?? 0);
  return creada.numero;
}

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Solicitud = typeof schema.solicitudesCotizacion.$inferSelect;

async function solicitudBloqueada(tx: Transaccion, solicitudId: number): Promise<Solicitud> {
  await tx.execute(sql`select id from solicitudes_cotizacion where id = ${solicitudId} for update`);
  const [solicitud] = await tx.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  if (!solicitud) throw new Error("Solicitud inexistente.");
  if (["ganada", "perdida"].includes(solicitud.estado)) throw new Error("La solicitud ya está cerrada.");
  return solicitud;
}

/** Suma la respuesta confirmada a la comparativa de la lista y da el envío por cotizado. */
async function sumarAComparativa(tx: Transaccion, solicitud: Solicitud, respuesta: RespuestaConfirmada, envioId: number | null): Promise<string[]> {
  const { cotizaciones, estado, nota, pendientes } = agregarRespuesta(solicitud, respuesta, new Date().toISOString());
  await tx.update(schema.solicitudesCotizacion).set({ cotizaciones, estado, nota, actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, solicitud.id));
  if (envioId != null) {
    await tx.update(schema.cotizacionEnvios).set({ estado: "cotizado", proximoSeguimiento: null, ultimaActividad: new Date() }).where(eq(schema.cotizacionEnvios.id, envioId));
  }
  return pendientes;
}

function textoFaltan(pendientes: string[]): string {
  return pendientes.length ? `Faltan respuestas de ${pendientes.join(", ")}.` : "La comparativa está completa.";
}

/**
 * Registra una respuesta de una compañía. Lo que carga el productor queda confirmado y entra
 * en la comparativa. Lo que lee la IA o llega de la compañía por un conector queda sin confirmar: no cuenta
 * como cotizado ni entra en la lista hasta que el productor lo confirme, y nunca pisa una
 * respuesta que el productor ya confirmó.
 */
export async function registrarResultadoCotizacion(datos: {
  solicitudId: number;
  compania: string;
  precio: number;
  observacion?: string | null;
  origen?: "portal" | "manual";
  primaNeta?: number | null;
  gastos?: number;
  impuestos?: number;
  franquicia?: string | null;
  sumaAsegurada?: number | null;
  condiciones?: string | null;
  vigencia?: string | null;
  moneda?: Moneda;
  confirmado?: boolean;
  /** Quién trajo la respuesta sin confirmar, para el registro de eventos. */
  actor?: "productor" | "ia" | "simulador" | "compania";
  /** Por dónde llegó la respuesta de la compañía ("conexión directa", "portal"), para el texto del evento. */
  via?: string;
  coberturas?: { nombre: string; valor?: string; incluida?: boolean }[];
  riesgoCotizado?: Record<string, string>;
}): Promise<"confirmada" | "sin_confirmar" | "ya_confirmada"> {
  if (!Number.isInteger(datos.solicitudId) || datos.solicitudId <= 0) throw new Error("Solicitud inválida.");
  if (!Number.isFinite(datos.precio) || datos.precio <= 0) throw new Error("El precio debe ser mayor que cero.");
  const observacion = datos.observacion?.trim().slice(0, 500) || undefined;
  const confirmado = datos.confirmado ?? true;
  const actor = datos.actor ?? "productor";

  return db.transaction(async (tx) => {
    const solicitud = await solicitudBloqueada(tx, datos.solicitudId);
    if (!solicitud.companias.includes(datos.compania)) throw new Error("La compañía no forma parte de esta solicitud.");
    const [envio] = await tx.select().from(schema.cotizacionEnvios).where(and(
      eq(schema.cotizacionEnvios.solicitudId, datos.solicitudId),
      eq(schema.cotizacionEnvios.compania, datos.compania),
    ));
    const [existente] = envio
      ? await tx.select({ id: schema.cotizacionResultados.id, confirmado: schema.cotizacionResultados.confirmado }).from(schema.cotizacionResultados).where(eq(schema.cotizacionResultados.envioId, envio.id)).limit(1)
      : [];

    const guardarResultado = async (envioId: number) => {
      const resultado = {
        envioId,
        primaNeta: datos.primaNeta ?? null,
        primaTotal: datos.precio,
        gastos: datos.gastos ?? 0,
        impuestos: datos.impuestos ?? 0,
        franquicia: datos.franquicia ?? null,
        sumaAsegurada: datos.sumaAsegurada ?? null,
        condiciones: datos.condiciones ?? null,
        vigencia: datos.vigencia ?? null,
        ...(datos.moneda ? { moneda: datos.moneda } : {}),
        // Sin coberturas en los datos (la carga rápida de la lista), quedan las que había.
        ...(datos.coberturas !== undefined || !existente ? { coberturas: datos.coberturas ?? [] } : {}),
        riesgoCotizado: datos.riesgoCotizado ?? {},
        confirmado,
      };
      if (existente) await tx.update(schema.cotizacionResultados).set(resultado).where(eq(schema.cotizacionResultados.id, existente.id));
      else await tx.insert(schema.cotizacionResultados).values(resultado);
    };

    if (!confirmado) {
      if (!envio) throw new Error("La solicitud no tiene un envío para esa compañía: cargá la respuesta a mano.");
      if (existente?.confirmado) {
        await tx.insert(schema.cotizacionEventos).values({ solicitudId: solicitud.id, envioId: envio.id, actor, tipo: "cotizacion_no_aplicada", detalle: `${actor === "ia" ? "La IA leyó" : "Llegó"} otra respuesta de ${datos.compania}, pero se mantiene la que confirmó el productor.` });
        return "ya_confirmada";
      }
      await guardarResultado(envio.id);
      // Ya hay respuesta: no hace falta seguir insistiendo, pero el envío no cuenta como cotizado hasta que el productor confirme.
      await tx.update(schema.cotizacionEnvios).set({ proximoSeguimiento: null, ultimaActividad: new Date() }).where(eq(schema.cotizacionEnvios.id, envio.id));
      const via = datos.via ? ` por ${datos.via}` : "";
      await tx.insert(schema.cotizacionEventos).values({ solicitudId: solicitud.id, envioId: envio.id, actor, tipo: "cotizacion_sin_confirmar", detalle: `${actor === "ia" ? "La IA leyó" : "Llegó"} la respuesta de ${datos.compania}${via}. Falta que el productor la confirme.` });
      await tx.update(schema.solicitudesCotizacion).set({ actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, solicitud.id));
      await tx.insert(schema.actividadAgentes).values({
        agente: "cotizacion",
        referencia: `solicitud:${solicitud.numero}`,
        texto: `${actor === "ia" ? "Leyó" : "Recibió"} la respuesta de ${datos.compania}${via} para la solicitud ${solicitud.numero}. Espera tu confirmación antes de sumarla a la comparativa.`,
      });
      return "sin_confirmar";
    }

    if (envio) await guardarResultado(envio.id);
    const pendientes = await sumarAComparativa(tx, solicitud, { compania: datos.compania, precio: datos.precio, observacion, origen: datos.origen ?? "manual" }, envio?.id ?? null);
    if (envio) {
      await tx.insert(schema.cotizacionEventos).values({ solicitudId: solicitud.id, envioId: envio.id, actor: "productor", tipo: "cotizacion_cargada", detalle: `El productor cargó y confirmó el precio de ${datos.compania}.` });
    }
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${solicitud.numero}`,
      texto: `Registró una respuesta de ${datos.compania}${datos.origen === "portal" ? " recibida de la compañía" : " cargada por el productor"}. ${textoFaltan(pendientes)}`,
    });
    return "confirmada";
  });
}

export class ResultadoNoDisponibleError extends Error {
  constructor() {
    super("Esa respuesta ya no está para confirmar.");
    this.name = "ResultadoNoDisponibleError";
  }
}

/** El productor confirma una respuesta que leyó la IA o llegó por un portal: recién ahí cuenta como cotizada y entra en la lista. */
export async function confirmarResultadoCotizacion(resultadoId: number): Promise<{ solicitudId: number }> {
  if (!Number.isInteger(resultadoId) || resultadoId <= 0) throw new ResultadoNoDisponibleError();
  const [fila] = await db.select({ resultado: schema.cotizacionResultados, envio: schema.cotizacionEnvios })
    .from(schema.cotizacionResultados)
    .innerJoin(schema.cotizacionEnvios, eq(schema.cotizacionEnvios.id, schema.cotizacionResultados.envioId))
    .where(eq(schema.cotizacionResultados.id, resultadoId));
  if (!fila) throw new ResultadoNoDisponibleError();
  const { envio } = fila;

  await db.transaction(async (tx) => {
    const solicitud = await solicitudBloqueada(tx, envio.solicitudId);
    const [resultado] = await tx.select().from(schema.cotizacionResultados).where(eq(schema.cotizacionResultados.id, resultadoId));
    if (!resultado) throw new ResultadoNoDisponibleError();
    if (resultado.confirmado) return;
    await tx.update(schema.cotizacionResultados).set({ confirmado: true }).where(eq(schema.cotizacionResultados.id, resultadoId));
    const pendientes = await sumarAComparativa(tx, solicitud, { compania: envio.compania, precio: resultado.primaTotal, origen: "portal" }, envio.id);
    await tx.insert(schema.cotizacionEventos).values({ solicitudId: solicitud.id, envioId: envio.id, actor: "productor", tipo: "cotizacion_confirmada", detalle: `El productor revisó y confirmó la respuesta de ${envio.compania}.` });
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${solicitud.numero}`,
      texto: `Confirmaste la respuesta de ${envio.compania} para la solicitud ${solicitud.numero}. ${textoFaltan(pendientes)}`,
    });
  });
  return { solicitudId: envio.solicitudId };
}
