import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { encolarTrabajo } from "@/lib/ia/cola";
import { COMODIN } from "@/lib/ia/configuracion";
import { ejecutarIA, estadoIA } from "@/lib/ia/ejecutar";
import type { MotivoSinIA } from "@/lib/ia/motor";
import { ErrorTrabajo } from "@/lib/ia/trabajos";
import {
  cuerpoVerificado,
  esquemaChatIA,
  esquemaCorreoIA,
  esquemaEstrategiaIA,
  esquemaRespuestaCompaniaIA,
  estrategiaVerificada,
  mensajeEstrategia,
  mensajeExtraccion,
  OPERACIONES_IA_COTIZACION as OPERACIONES,
  respuestaLeida,
  resumenLectura,
  SISTEMA_CHAT,
  SISTEMA_CORREO,
  SISTEMA_ESTRATEGIA,
  SISTEMA_EXTRACCION,
  textoDeChat,
} from "@/lib/cotizacion/ia";
import { ramosParaSolicitud } from "@/lib/cotizacion/tipos-seguro";
import { registrarResultadoCotizacion } from "./solicitudes";

// La IA de Cotización pasa toda por ejecutarIA(), que elige el modelo de cada
// tarea, valida la salida con zod, registra el uso en ia_uso y respeta el tope
// del mes. Sin IA, el agente sigue con plantillas y carga manual.

const AGENTE = "cotizacion";
const ENTIDAD_ARCHIVO = "cotizacion_archivos";

/** Si la IA está disponible para Cotización: la clave, el interruptor (fila cotizacion / * de ia_configuracion) y el tope del mes. */
export function estadoIACotizacion() {
  return estadoIA({ agente: AGENTE, operacion: COMODIN });
}

/**
 * El interruptor de la Configuración de Cotización. Es la fila cotizacion / *
 * de la plataforma en ia_configuracion: pesa más que la fila * / * y no tiene
 * tope propio, así que el gasto entra en el tope general.
 */
export async function guardarInterruptorIACotizacion(activa: boolean) {
  const t = schema.iaConfiguracion;
  await db.transaction(async (tx) => {
    const [fila] = await tx.select({ id: t.id }).from(t)
      .where(and(eq(t.agente, AGENTE), eq(t.operacion, COMODIN), isNull(t.orgId), isNull(t.producerId)))
      .limit(1)
      .for("update");
    if (fila) await tx.update(t).set({ activa, actualizadoEl: new Date() }).where(eq(t.id, fila.id));
    else await tx.insert(t).values({ agente: AGENTE, operacion: COMODIN, activa });
  });
}

export type ResultadoIACotizacion = { ok: true; borradorId: number } | { ok: false; motivo: MotivoSinIA };

/** El texto queda en cotizacion_borradores_ia para revisarlo; el uso real (tokens y costo) está en ia_uso. */
async function guardarBorrador(
  solicitud: { id: number; orgId: string | null; producerId: string | null },
  tipo: "chat" | "correo" | "extraccion",
  contenido: string,
  ia: { modelo: string; costoUsd: number },
  evento: { detalle: string; envioId?: number },
) {
  const [borrador] = await db.insert(schema.cotizacionBorradoresIA).values({
    solicitudId: solicitud.id, tipo, contenido, modelo: ia.modelo, tokensEntrada: 0, tokensSalida: 0, costoUsd: ia.costoUsd,
    orgId: solicitud.orgId, producerId: solicitud.producerId,
  }).returning({ id: schema.cotizacionBorradoresIA.id });
  await db.insert(schema.cotizacionEventos).values({
    solicitudId: solicitud.id, envioId: evento.envioId ?? null, actor: "ia", tipo: `ia_${tipo}`, detalle: evento.detalle,
    modelo: ia.modelo, costoUsd: ia.costoUsd, orgId: solicitud.orgId, producerId: solicitud.producerId,
  });
  return borrador.id;
}

/** El productor le pregunta algo al agente sobre una solicitud. */
export async function responderChatCotizacion(solicitudId: number, mensaje: string): Promise<ResultadoIACotizacion | null> {
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  if (!solicitud) return null;
  const envios = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.solicitudId, solicitudId));
  const resultados = envios.length
    ? await db.select().from(schema.cotizacionResultados).where(inArray(schema.cotizacionResultados.envioId, envios.map((e) => e.id)))
    : [];
  const porEnvio = new Map(resultados.map((r) => [r.envioId, r]));
  const contexto = {
    cliente: solicitud.cliente,
    ramo: solicitud.ramo,
    tipo: solicitud.tipo,
    bien: solicitud.bien,
    datosDelRiesgo: solicitud.datosRiesgo,
    companias: envios.length
      ? envios.map((envio) => {
        const r = porEnvio.get(envio.id);
        return {
          compania: envio.compania,
          estado: envio.estado,
          respuesta: r ? { confirmada: r.confirmado, primaTotal: r.primaTotal, franquicia: r.franquicia, vigencia: r.vigencia, coberturas: r.coberturas } : null,
        };
      })
      // Solicitudes de antes de los envíos: solo está la lista vieja, que son respuestas confirmadas.
      : solicitud.cotizaciones.map(({ compania, precio, observacion }) => ({ compania, respuesta: { confirmada: true, primaTotal: precio, observacion } })),
  };
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES.chat,
    tarea: "explicar",
    orgId: solicitud.orgId,
    producerId: solicitud.producerId,
    system: SISTEMA_CHAT,
    mensaje: `Datos de la solicitud (confidenciales):\n${JSON.stringify(contexto)}\n\nPregunta del productor:\n${mensaje.trim().slice(0, 3000)}`,
    esquema: esquemaChatIA,
  });
  if (!r.ok) return r;
  const texto = textoDeChat(r.datos);
  if (!texto) return { ok: false, motivo: "invalida" };
  return { ok: true, borradorId: await guardarBorrador(solicitud, "chat", texto, r, { detalle: "La IA respondió tu consulta. No cambió nada." }) };
}

/** Mejora el borrador del correo a una compañía. Sigue pendiente de aprobación. */
export async function redactarCorreoCotizacion(envioId: number): Promise<ResultadoIACotizacion | null> {
  const [fila] = await db.select({ envio: schema.cotizacionEnvios, solicitud: schema.solicitudesCotizacion })
    .from(schema.cotizacionEnvios)
    .innerJoin(schema.solicitudesCotizacion, eq(schema.solicitudesCotizacion.id, schema.cotizacionEnvios.solicitudId))
    .where(eq(schema.cotizacionEnvios.id, envioId));
  if (!fila || fila.envio.estadoBorrador !== "pendiente" || !fila.envio.cuerpoBorrador) return null;
  const { envio, solicitud } = fila;
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES.redactarCorreo,
    tarea: "redactar",
    orgId: solicitud.orgId,
    producerId: solicitud.producerId,
    system: SISTEMA_CORREO,
    mensaje: `Compañía: ${envio.compania}. Ramo: ${solicitud.ramo}.\nBorrador actual:\n${envio.cuerpoBorrador}`,
    esquema: esquemaCorreoIA,
  });
  if (!r.ok) return r;
  const cuerpo = cuerpoVerificado(r.datos.cuerpo);
  if (!cuerpo) return { ok: false, motivo: "invalida" };
  // Solo si el borrador sigue pendiente: si mientras tanto se aprobó, no se pisa lo aprobado.
  const actualizado = await db.update(schema.cotizacionEnvios).set({ cuerpoBorrador: cuerpo, ultimaActividad: new Date() })
    .where(and(eq(schema.cotizacionEnvios.id, envioId), eq(schema.cotizacionEnvios.estadoBorrador, "pendiente")))
    .returning({ id: schema.cotizacionEnvios.id });
  if (!actualizado.length) return null;
  const detalle = `La IA mejoró el borrador del correo a ${envio.compania}. Sigue pendiente de tu aprobación; no se envió nada.`;
  return { ok: true, borradorId: await guardarBorrador(solicitud, "correo", cuerpo, r, { detalle, envioId }) };
}

// ---------- Lectura de PDFs por la cola ----------

export type LecturaPdf = { estado: "pendiente" | "procesando" | "completado" | "error"; error: string | null };

/**
 * Pone a la IA a leer el PDF que mandó una compañía, en segundo plano. Devuelve
 * null si el archivo no es el PDF de una compañía de esa solicitud.
 */
export async function encolarLecturaPdf(archivoId: number, solicitudId: number): Promise<"encolada" | "en_curso" | null> {
  const [fila] = await db.select({ archivo: schema.cotizacionArchivos, solicitud: schema.solicitudesCotizacion })
    .from(schema.cotizacionArchivos)
    .innerJoin(schema.solicitudesCotizacion, eq(schema.solicitudesCotizacion.id, schema.cotizacionArchivos.solicitudId))
    .where(and(eq(schema.cotizacionArchivos.id, archivoId), eq(schema.cotizacionArchivos.solicitudId, solicitudId)));
  if (!fila || fila.archivo.mime !== "application/pdf" || !fila.archivo.envioId) return null;
  const t = schema.iaTrabajos;
  return db.transaction(async (tx) => {
    const [enCurso] = await tx.select({ id: t.id }).from(t).where(and(
      eq(t.agente, AGENTE), eq(t.entidad, ENTIDAD_ARCHIVO), eq(t.entidadId, archivoId), inArray(t.estado, ["pendiente", "procesando"]),
    )).limit(1);
    if (enCurso) return "en_curso";
    await encolarTrabajo({
      agente: AGENTE, operacion: OPERACIONES.extraerRespuesta, entidad: ENTIDAD_ARCHIVO, entidadId: archivoId,
      orgId: fila.solicitud.orgId, producerId: fila.solicitud.producerId,
    }, tx);
    return "encolada";
  });
}

/** La última lectura de cada PDF, para mostrar "La IA está leyendo…" o por qué no pudo. */
export async function lecturasDePdfs(archivoIds: number[]): Promise<Map<number, LecturaPdf>> {
  if (!archivoIds.length) return new Map();
  const t = schema.iaTrabajos;
  const filas = await db.select({ entidadId: t.entidadId, estado: t.estado, error: t.errorSeguro }).from(t)
    .where(and(eq(t.agente, AGENTE), eq(t.entidad, ENTIDAD_ARCHIVO), inArray(t.entidadId, archivoIds)))
    .orderBy(desc(t.id));
  const lecturas = new Map<number, LecturaPdf>();
  for (const fila of filas) {
    if (!lecturas.has(fila.entidadId)) lecturas.set(fila.entidadId, { estado: fila.estado as LecturaPdf["estado"], error: fila.error });
  }
  return lecturas;
}

const SIN_LECTURA: Record<MotivoSinIA, string> = {
  sin_clave: "La IA está apagada. Cargá la respuesta a mano.",
  desactivada: "La IA está apagada. Cargá la respuesta a mano.",
  sin_cuota: "Se llegó al tope de gasto de IA del mes. Cargá la respuesta a mano.",
  invalida: "La IA no pudo leer este PDF. Cargá la respuesta a mano.",
  rechazada: "La IA no pudo leer este PDF. Cargá la respuesta a mano.",
  error: "La IA no respondió. Probá de nuevo más tarde o cargá la respuesta a mano.",
};

/**
 * cotizacion:extraer_respuesta. La IA lee el PDF y la respuesta queda en el
 * comparativo sin confirmar: no cuenta hasta que el productor la confirma, y
 * nunca pisa una respuesta que ya confirmó.
 */
export async function manejarExtraerRespuesta(archivoId: number) {
  const [fila] = await db.select({ archivo: schema.cotizacionArchivos, envio: schema.cotizacionEnvios, solicitud: schema.solicitudesCotizacion })
    .from(schema.cotizacionArchivos)
    .innerJoin(schema.cotizacionEnvios, eq(schema.cotizacionEnvios.id, schema.cotizacionArchivos.envioId))
    .innerJoin(schema.solicitudesCotizacion, eq(schema.solicitudesCotizacion.id, schema.cotizacionArchivos.solicitudId))
    .where(eq(schema.cotizacionArchivos.id, archivoId));
  if (!fila || fila.archivo.mime !== "application/pdf") throw new ErrorTrabajo("El PDF ya no está guardado.", false);
  const { archivo, envio, solicitud } = fila;
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES.extraerRespuesta,
    tarea: "extraer",
    orgId: solicitud.orgId,
    producerId: solicitud.producerId,
    system: SISTEMA_EXTRACCION,
    mensaje: mensajeExtraccion({ compania: envio.compania, ramo: solicitud.ramo, tipo: solicitud.tipo }),
    adjuntos: [{ nombre: archivo.nombre, tipoMime: "application/pdf", contenido: archivo.bytes }],
    esquema: esquemaRespuestaCompaniaIA,
  });
  if (!r.ok) throw new ErrorTrabajo(SIN_LECTURA[r.motivo], r.motivo === "error");

  const leida = respuestaLeida(r.datos);
  if (leida) {
    try {
      await registrarResultadoCotizacion({ ...leida, solicitudId: solicitud.id, compania: envio.compania, origen: "portal", confirmado: false, actor: "ia" });
    } catch (error) {
      if (error instanceof Error && error.message === "La solicitud ya está cerrada.") {
        throw new ErrorTrabajo("La solicitud ya está cerrada: no se sumó lo que leyó la IA.", false);
      }
      throw error;
    }
  }
  const detalle = leida
    ? `La IA leyó el PDF de ${envio.compania}. Lo que leyó está acá para revisar.`
    : `La IA leyó el PDF de ${envio.compania}, pero no encontró la prima total. Cargá la respuesta a mano.`;
  await guardarBorrador(solicitud, "extraccion", resumenLectura(envio.compania, leida), r, { detalle, envioId: envio.id });
}

export async function obtenerBorradoresIA(solicitudId: number) {
  return db.select().from(schema.cotizacionBorradoresIA).where(eq(schema.cotizacionBorradoresIA.solicitudId, solicitudId)).orderBy(schema.cotizacionBorradoresIA.creadoEl);
}

export type SugerenciaEstrategia = { ok: true; estrategia: string; descripcion: string } | { ok: false; motivo: MotivoSinIA };

/**
 * "Sugerir con IA" de la estrategia de seguimiento. La IA la redacta con los
 * ramos que vende el productor y lo que pide; el parser la valida y, si el
 * agente no la entiende, no se ofrece. No guarda nada: la sugerencia va al
 * campo y el productor la revisa y la guarda (y ahí se vuelve a validar).
 */
export async function sugerirEstrategiaSeguimiento(pedido: string): Promise<SugerenciaEstrategia> {
  const [[config], tipos] = await Promise.all([
    db.select({ estrategia: schema.cotizacionConfig.estrategiaSeguimiento, maximo: schema.cotizacionConfig.maxSeguimientos }).from(schema.cotizacionConfig).limit(1),
    db.select({ ramo: schema.cotizacionTiposSeguro.ramo, descripcion: schema.cotizacionTiposSeguro.descripcion, activo: schema.cotizacionTiposSeguro.activo }).from(schema.cotizacionTiposSeguro).orderBy(schema.cotizacionTiposSeguro.id),
  ]);
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES.sugerirEstrategia,
    tarea: "redactar",
    system: SISTEMA_ESTRATEGIA,
    mensaje: mensajeEstrategia({ ramos: ramosParaSolicitud(tipos).map((tipo) => tipo.ramo), maximo: config?.maximo ?? 3, actual: config?.estrategia ?? "", pedido }),
    esquema: esquemaEstrategiaIA,
  });
  if (!r.ok) return r;
  const verificada = estrategiaVerificada(r.datos.estrategia);
  if (!verificada) return { ok: false, motivo: "invalida" };
  await db.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia: "configuracion:estrategia", texto: "La IA sugirió una estrategia de seguimiento. No se guarda hasta que la revises y la guardes." });
  return { ok: true, ...verificada };
}
