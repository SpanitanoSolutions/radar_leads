import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { canalesValidos, type ResultadoCanales } from "@/lib/conectores/canales";
import { ejecutarEnCompania } from "@/lib/conectores/ejecutar";
import { autorizacion } from "@/lib/conectores/permisos";
import type { RespuestaCotizacion } from "@/lib/conectores/tipos";
import {
  agotoConsultas,
  datoPedido,
  decidirCotizacion,
  intentosDeEnvio,
  NOMBRE_CANAL,
  OPERACIONES_COTIZACION,
  puedeCotizarse,
  respuestaValida,
  solicitudParaConector,
  textoDecision,
} from "@/lib/cotizacion/orquestador";
import { calcularProximoSeguimiento } from "@/lib/cotizacion/seguimientos";
import { diaEnArgentina, fechaCorta } from "@/lib/fechas";
import { encolarTrabajo, type TrabajoIA } from "@/lib/ia/cola";
import { ErrorTrabajo } from "@/lib/ia/trabajos";
import { provinciaValida } from "@/lib/provincias";
import { ENTIDAD_ENVIO, type MotivoCotizar } from "./cotizar";
import { registrarResultadoCotizacion } from "./solicitudes";

// El orquestador de Cotización: los trabajos cotizacion:cotizar_envio y
// cotizacion:consultar_cotizacion de la cola. Cada uno prueba los canales de
// la compañía con ejecutarEnCompania(), que audita cada intento y actualiza la
// salud del canal. Lo que cotiza entra sin confirmar, y si ningún canal
// automático sirve queda el correo para aprobar.

const AGENTE = "cotizacion";
type Envio = typeof schema.cotizacionEnvios.$inferSelect;
type Solicitud = typeof schema.solicitudesCotizacion.$inferSelect;

async function envioConSolicitud(envioId: number): Promise<{ envio: Envio; solicitud: Solicitud } | null> {
  const [fila] = await db.select({ envio: schema.cotizacionEnvios, solicitud: schema.solicitudesCotizacion })
    .from(schema.cotizacionEnvios)
    .innerJoin(schema.solicitudesCotizacion, eq(schema.solicitudesCotizacion.id, schema.cotizacionEnvios.solicitudId))
    .where(eq(schema.cotizacionEnvios.id, envioId));
  return fila ?? null;
}

const contextoDe = (envio: Envio, solicitud: Solicitud) => ({
  agente: AGENTE, entidad: ENTIDAD_ENVIO, entidadId: envio.id, orgId: solicitud.orgId, producerId: solicitud.producerId,
});

async function anotar(envio: Envio, solicitud: Solicitud, tipo: string, detalle: string) {
  await db.insert(schema.cotizacionEventos).values({
    solicitudId: solicitud.id, envioId: envio.id, actor: "agente", tipo, detalle, orgId: solicitud.orgId, producerId: solicitud.producerId,
  });
  await db.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia: `solicitud:${solicitud.numero}`, texto: `Solicitud ${solicitud.numero}: ${detalle}` });
  await db.update(schema.solicitudesCotizacion).set({ actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, solicitud.id));
}

/** Cuándo volver a consultar una cotización que tarda: con la estrategia de seguimiento, en días hábiles de la provincia. */
async function proximaConsulta(ramo: string, ahora: Date): Promise<Date> {
  const [[config], [ajustes]] = await Promise.all([
    db.select({ estrategia: schema.cotizacionConfig.estrategiaSeguimiento }).from(schema.cotizacionConfig).limit(1),
    db.select({ provincia: schema.ajustes.provincia }).from(schema.ajustes).where(eq(schema.ajustes.id, 1)),
  ]);
  return calcularProximoSeguimiento(ahora, ramo, config?.estrategia ?? "Cada 3 días hábiles", { provincia: provinciaValida(ajustes?.provincia) })
    ?? new Date(ahora.getTime() + 86_400_000);
}

async function maximoConsultas(): Promise<number> {
  const [config] = await db.select({ maximo: schema.cotizacionConfig.maxSeguimientos }).from(schema.cotizacionConfig).limit(1);
  return config?.maximo ?? 3;
}

/** El correo ya no hace falta: la compañía respondió por un canal automático. Solo si nadie lo aprobó. */
async function omitirCorreoPendiente(envioId: number) {
  await db.update(schema.cotizacionEnvios).set({ estadoBorrador: "omitido" })
    .where(and(eq(schema.cotizacionEnvios.id, envioId), eq(schema.cotizacionEnvios.estadoBorrador, "pendiente")));
}

/** Encola la próxima consulta de una cotización que tarda. Devuelve el día, para contarlo. */
async function programarConsulta(envio: Envio, solicitud: Solicitud, ahora: Date): Promise<string> {
  const cuando = await proximaConsulta(solicitud.ramo, ahora);
  await encolarTrabajo({
    agente: AGENTE, operacion: OPERACIONES_COTIZACION.consultarCotizacion, entidad: ENTIDAD_ENVIO, entidadId: envio.id,
    orgId: solicitud.orgId, producerId: solicitud.producerId, ejecutarDespuesDe: cuando,
  });
  return fechaCorta(diaEnArgentina(cuando));
}

/**
 * Aplica al envío lo que respondió la compañía. `consulta`: viene de consultar
 * una cotización que tardaba; si sigue sin estar (o la consulta falla), se
 * vuelve a consultar hasta el máximo de seguimientos.
 */
async function aplicar(envio: Envio, solicitud: Solicitud, r: ResultadoCanales<RespuestaCotizacion>, { consulta }: { consulta: boolean }) {
  const ahora = new Date();
  const decision = decidirCotizacion(envio.compania, r);
  const intentos = [...envio.intentos, ...intentosDeEnvio(r, ahora.toISOString())];
  const e = schema.cotizacionEnvios;

  if (decision.tipo === "cotizada") {
    await db.update(e).set({ canalUsado: decision.canal, numeroCompania: decision.numero, intentos, ultimoError: null, preguntasPendientes: null, ultimaActividad: ahora }).where(eq(e.id, envio.id));
    await omitirCorreoPendiente(envio.id);
    // Entra sin confirmar, como lo que lee la IA: no cuenta en el comparativo hasta que el productor la revise.
    await registrarResultadoCotizacion({
      ...decision.resultado, solicitudId: solicitud.id, compania: envio.compania,
      origen: "portal", confirmado: false, actor: "compania", via: NOMBRE_CANAL[decision.canal],
    });
    return;
  }

  if (decision.tipo === "rechazada") {
    await db.update(e).set({ estado: "rechazado", canalUsado: decision.canal, numeroCompania: decision.numero, intentos, ultimoError: null, preguntasPendientes: null, proximoSeguimiento: null, ultimaActividad: ahora }).where(eq(e.id, envio.id));
    await omitirCorreoPendiente(envio.id);
    await anotar(envio, solicitud, "cotizacion_rechazada", textoDecision(envio.compania, decision));
    return;
  }

  if (decision.tipo === "requiere_dato") {
    await db.update(e).set({ estado: "requiere_atencion", preguntasPendientes: decision.pregunta, intentos, proximoSeguimiento: null, ultimaActividad: ahora }).where(eq(e.id, envio.id));
    await anotar(envio, solicitud, "dato_pedido", textoDecision(envio.compania, decision));
    return;
  }

  // Pendiente, o una consulta que falló: se vuelve a consultar con la estrategia, hasta el máximo.
  if (decision.tipo === "pendiente" || consulta) {
    const error = decision.tipo === "correo" ? decision.error : null;
    if (consulta && agotoConsultas(envio.cantidadSeguimientos, await maximoConsultas())) {
      const ultimoError = `${envio.compania} no terminó la cotización después de ${envio.cantidadSeguimientos + 1} consultas: revisala en su portal o pedila por correo.`;
      await db.update(e).set({ estado: "requiere_atencion", intentos, ultimoError, cantidadSeguimientos: envio.cantidadSeguimientos + 1, proximoSeguimiento: null, ultimaActividad: ahora }).where(eq(e.id, envio.id));
      await anotar(envio, solicitud, "consultas_agotadas", ultimoError);
      return;
    }
    const numero = decision.tipo === "pendiente" ? decision.numero : envio.numeroCompania;
    await db.update(e).set({
      estado: "enviado",
      ...(decision.tipo === "pendiente" ? { canalUsado: decision.canal, numeroCompania: decision.numero } : {}),
      intentos, ultimoError: error, proximoSeguimiento: null, ultimaActividad: ahora,
      cantidadSeguimientos: consulta ? envio.cantidadSeguimientos + 1 : envio.cantidadSeguimientos,
    }).where(eq(e.id, envio.id));
    if (!consulta) await omitirCorreoPendiente(envio.id);
    const dia = await programarConsulta(envio, solicitud, ahora);
    const detalle = !consulta && decision.tipo === "pendiente"
      ? textoDecision(envio.compania, decision, { proximaConsulta: dia })
      : `${error ? `${error.replace(/\.$/, "")}. ` : `${envio.compania} todavía no terminó la cotización ${numero}. `}El agente la vuelve a consultar el ${dia}.`;
    await anotar(envio, solicitud, consulta ? "cotizacion_consultada" : "cotizacion_pedida", detalle);
    return;
  }

  // Sin conexión automática, o fallaron todos los canales: queda el correo para aprobar.
  await db.update(e).set({ intentos, ultimoError: decision.error, ultimaActividad: ahora }).where(eq(e.id, envio.id));
  await anotar(envio, solicitud, decision.error ? "paso_a_correo" : "solo_correo", textoDecision(envio.compania, decision));
}

async function aplicarOAvisar(...argumentos: Parameters<typeof aplicar>) {
  try {
    await aplicar(...argumentos);
  } catch (error) {
    if (error instanceof Error && error.message === "La solicitud ya está cerrada.") {
      throw new ErrorTrabajo("La solicitud ya está cerrada: no se sumó la cotización.", false);
    }
    throw error;
  }
}

/** cotizacion:cotizar_envio. La autorización es la de la solicitud del envío: el trabajo no puede cotizar otra. */
export async function manejarCotizarEnvio(trabajo: TrabajoIA) {
  const fila = await envioConSolicitud(trabajo.entidadId);
  if (!fila || !puedeCotizarse(fila.envio, fila.solicitud)) return;
  const { envio, solicitud } = fila;
  const motivo: MotivoCotizar = trabajo.datos.motivo === "automatica" ? "automatica" : "aprobada";
  const r = await ejecutarEnCompania(envio.compania, "cotizar", [solicitudParaConector(solicitud), []], {
    contexto: contextoDe(envio, solicitud),
    autorizacion: autorizacion({ cotizar: { solicitudId: solicitud.id, motivo } }),
  });
  await aplicarOAvisar(envio, solicitud, r, { consulta: false });
}

/** cotizacion:consultar_cotizacion. Consulta por el mismo canal que dio el número. */
export async function manejarConsultarCotizacion(trabajo: TrabajoIA) {
  const fila = await envioConSolicitud(trabajo.entidadId);
  if (!fila) return;
  const { envio, solicitud } = fila;
  const [canal] = canalesValidos([envio.canalUsado ?? ""]);
  if (envio.estado !== "enviado" || !envio.numeroCompania || !canal || ["ganada", "perdida"].includes(solicitud.estado) || solicitud.completadoEl) return;
  const r = await ejecutarEnCompania(envio.compania, "consultarCotizacion", [envio.numeroCompania], {
    contexto: contextoDe(envio, solicitud),
    autorizacion: autorizacion(),
    canales: [canal],
  });
  await aplicarOAvisar(envio, solicitud, r, { consulta: true });
}

/**
 * El productor responde lo que pidió la compañía: queda en los datos del
 * riesgo de la solicitud y el agente vuelve a cotizar. Devuelve la solicitud,
 * "invalida" si la respuesta está vacía, o null si ese envío ya no espera un dato.
 */
export async function responderDatoPedido(envioId: number, texto: string): Promise<{ solicitudId: number; compania: string } | "invalida" | null> {
  const respuesta = respuestaValida(texto);
  if (!respuesta) return "invalida";
  const fila = await envioConSolicitud(envioId);
  const dato = fila ? datoPedido(fila.envio) : null;
  if (!fila || !dato) return null;
  const { envio } = fila;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from solicitudes_cotizacion where id = ${envio.solicitudId} for update`);
    const [solicitud] = await tx.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, envio.solicitudId));
    if (!solicitud || ["ganada", "perdida"].includes(solicitud.estado) || solicitud.completadoEl) return null;
    const actualizado = await tx.update(schema.cotizacionEnvios)
      .set({ estado: "pendiente", preguntasPendientes: null, ultimaActividad: new Date() })
      .where(and(eq(schema.cotizacionEnvios.id, envio.id), eq(schema.cotizacionEnvios.estado, "requiere_atencion")))
      .returning({ id: schema.cotizacionEnvios.id });
    if (!actualizado.length) return null;
    await tx.update(schema.solicitudesCotizacion)
      .set({ datosRiesgo: { ...solicitud.datosRiesgo, [dato.campo]: respuesta }, actualizadoEl: new Date() })
      .where(eq(schema.solicitudesCotizacion.id, solicitud.id));
    // La respuesta no va al evento: puede ser un dato del asegurado.
    await tx.insert(schema.cotizacionEventos).values({
      solicitudId: solicitud.id, envioId: envio.id, actor: "productor", tipo: "dato_respondido",
      detalle: `Respondiste lo que pidió ${envio.compania}. El agente vuelve a cotizar.`, orgId: solicitud.orgId, producerId: solicitud.producerId,
    });
    await encolarTrabajo({
      agente: AGENTE, operacion: OPERACIONES_COTIZACION.cotizarEnvio, entidad: ENTIDAD_ENVIO, entidadId: envio.id,
      orgId: solicitud.orgId, producerId: solicitud.producerId, datos: { motivo: "aprobada" },
    }, tx);
    return { solicitudId: solicitud.id, compania: envio.compania };
  });
}
