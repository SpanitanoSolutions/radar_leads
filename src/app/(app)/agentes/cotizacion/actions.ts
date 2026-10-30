"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { confirmarResultadoCotizacion, crearSolicitud, registrarResultadoCotizacion, SinCompaniasCotizablesError } from "@/agentes/cotizacion/solicitudes";
import type { EstadoCotizacion } from "@/lib/cotizacion";
import { requerirSesion } from "@/lib/auth";
import { mejorResultadoConfirmado, validarDatosRiesgo } from "@/lib/cotizacion";
import { aprobarCorreoCotizacion, reenviarCorreoCotizacion, type ResultadoCorreo } from "@/agentes/cotizacion/correo";
import { encolarLecturaPdf, redactarCorreoCotizacion, responderChatCotizacion, type ResultadoIACotizacion } from "@/agentes/cotizacion/ia";
import { autorizarCotizacion, despacharCotizaciones } from "@/agentes/cotizacion/cotizar";
import { responderDatoPedido } from "@/agentes/cotizacion/orquestador";
import { aprobarResumenEjecutivo, reenviarResumenEjecutivo, type ResultadoResumen } from "@/agentes/cotizacion/ejecutivo";
import { despachadorTrabajos } from "@/lib/ia/manejadores";
import type { MotivoSinIA } from "@/lib/ia/motor";
import { generarPdfPropuesta } from "@/lib/cotizacion/propuesta-pdf";
import { FILAS_COBERTURA, unirCoberturasManuales, type Cobertura } from "@/lib/cotizacion/comparativo";

const ESTADOS: EstadoCotizacion[] = ["atencion", "esperando", "lista", "enviada", "ganada", "perdida"];

function mensajeDe(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function volver(aviso: string, query = ""): never {
  revalidatePath("/", "layout");
  redirect(`/agentes/cotizacion${query}&aviso=${encodeURIComponent(aviso)}`);
}

function volverNuevaSolicitud(aviso: string): never {
  revalidatePath("/", "layout");
  redirect(`/agentes/cotizacion/nueva?aviso=${encodeURIComponent(aviso)}`);
}

function queryDeFiltros(formData: FormData): string {
  const filtros = new URLSearchParams({ tab: "solicitudes" });
  for (const [clave, campo] of [["q", "filtroQ"], ["estado", "filtroEstado"], ["ramo", "filtroRamo"], ["origen", "filtroOrigen"], ["ejecutivo", "filtroEjecutivo"], ["desde", "filtroDesde"], ["hasta", "filtroHasta"]]) {
    const valor = mensajeDe(formData, campo);
    if (valor) filtros.set(clave, valor);
  }
  return `?${filtros.toString()}`;
}

export async function actualizarSolicitud(formData: FormData) {
  await requerirSesion();
  const query = queryDeFiltros(formData);
  const id = Number(mensajeDe(formData, "id"));
  const estado = mensajeDe(formData, "estado");
  const nota = mensajeDe(formData, "nota").slice(0, 500);
  if (!Number.isInteger(id) || id <= 0 || !ESTADOS.includes(estado as EstadoCotizacion)) volver("solicitud-invalida", query);
  let solicitud: typeof schema.solicitudesCotizacion.$inferSelect | undefined;
  try {
    [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, id));
    if (solicitud) {
      await db.update(schema.solicitudesCotizacion).set({ estado: estado as EstadoCotizacion, nota: nota || null, actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, id));
      await db.insert(schema.actividadAgentes).values({
        agente: "cotizacion",
        referencia: `solicitud:${solicitud.numero}`,
        texto: `Actualizaste la solicitud ${solicitud.numero} de ${solicitud.cliente}: ${estado.replaceAll("_", " ")}.${nota ? ` ${nota}` : ""}`,
      });
    }
  } catch {
    volver("error-operacion", query);
  }
  if (!solicitud) volver("solicitud-inexistente", query);
  volver("solicitud-actualizada", query);
}

export async function nuevaSolicitud(formData: FormData) {
  await requerirSesion();
  const vinculo = mensajeDe(formData, "vinculo");
  const [tipoVinculo, idTexto] = vinculo.split(":");
  const id = Number(idTexto);
  const ramo = mensajeDe(formData, "ramo").slice(0, 100);
  const tipo = mensajeDe(formData, "tipo");
  const bien = mensajeDe(formData, "bien").slice(0, 250);
  const motivo = mensajeDe(formData, "motivo").slice(0, 500);
  if (!Number.isInteger(id) || id <= 0 || !ramo || !["renovacion", "negocio_nuevo", "nueva", "mejora"].includes(tipo)) {
    volverNuevaSolicitud("solicitud-incompleta");
  }
  if (tipoVinculo !== "asegurado" && tipoVinculo !== "lead") volverNuevaSolicitud("solicitud-vinculo-invalido");

  const camposRiesgo = ["marca", "modelo", "anio", "version", "uso", "conductor", "fechaNacimiento", "codigoPostal", "cuitCuil", "formaDePago", "cantidadUnidades", "actividad", "zona", "sumaAsegurada", "coberturasSolicitadas"];
  const datosRiesgo = Object.fromEntries(camposRiesgo.map((campo) => [campo, mensajeDe(formData, campo)]).filter(([, valor]) => valor));
  const erroresRiesgo = validarDatosRiesgo(ramo, datosRiesgo as Record<string, string>);
  if (erroresRiesgo.length) volverNuevaSolicitud("solicitud-riesgo-invalido");
  const archivoInicial = formData.get("archivoInicial");
  const extensionesPermitidas = /\.(pdf|docx|xlsx?|png|jpe?g|webp)$/i;
  if (archivoInicial instanceof File && archivoInicial.size > 0
    && (archivoInicial.size > 25 * 1024 * 1024 || !extensionesPermitidas.test(archivoInicial.name))) {
    volverNuevaSolicitud("solicitud-adjunto-invalido");
  }
  const companias = formData.getAll("companias").filter((valor): valor is string => typeof valor === "string").map((valor) => valor.trim()).filter(Boolean);

  let numero: number | null = null;
  let aviso = "error-operacion";
  try {
    if (tipoVinculo === "asegurado") {
      const [asegurado] = await db.select({ id: schema.asegurados.id, cliente: schema.asegurados.nombre }).from(schema.asegurados).where(eq(schema.asegurados.id, id));
      if (!asegurado) aviso = "asegurado-inexistente";
      else numero = await crearSolicitud({ aseguradoId: id, cliente: asegurado.cliente, tipo: tipo as "renovacion" | "mejora" | "nueva" | "negocio_nuevo", ramo, bien: bien || null, motivo: motivo || null, companias, datosRiesgo });
    } else {
      const [lead] = await db.select({ id: schema.leads.id, cliente: schema.leads.empresa }).from(schema.leads).where(eq(schema.leads.id, id));
      if (!lead) aviso = "lead-inexistente";
      else numero = await crearSolicitud({ leadId: id, cliente: lead.cliente, tipo: tipo as "renovacion" | "mejora" | "nueva" | "negocio_nuevo", ramo, bien: bien || null, motivo: motivo || null, companias, datosRiesgo });
    }
  } catch (error) {
    if (error instanceof SinCompaniasCotizablesError) aviso = "sin-companias-configuradas";
  }
  if (numero === null) volverNuevaSolicitud(aviso);
  if (archivoInicial instanceof File && archivoInicial.size > 0) {
    const [solicitudCreada] = await db.select({ id: schema.solicitudesCotizacion.id }).from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.numero, numero));
    if (solicitudCreada) {
      await db.insert(schema.cotizacionArchivos).values({
        solicitudId: solicitudCreada.id,
        nombre: archivoInicial.name.replace(/[\r\n]/g, "_").slice(0, 240),
        mime: archivoInicial.type || "application/octet-stream",
        bytes: Buffer.from(await archivoInicial.arrayBuffer()),
        tamano: archivoInicial.size,
      });
      await db.insert(schema.cotizacionEventos).values({ solicitudId: solicitudCreada.id, actor: "productor", tipo: "archivo_adjunto", detalle: "Se adjuntó un archivo a la solicitud." });
    }
  }
  revalidatePath("/agentes/cotizacion");
  volver(`solicitud-${numero}`, "?tab=solicitudes");
}

/** Después de aprobar u omitir: al detalle si el botón estaba ahí, y si no a la lista. */
function volverDelCorreo(formData: FormData, solicitudId: number | null, aviso: string): never {
  revalidatePath("/agentes/cotizacion");
  if (solicitudId && mensajeDe(formData, "volverDetalle") === "on") {
    revalidatePath(`/agentes/cotizacion/${solicitudId}`);
    const tab = mensajeDe(formData, "volverTab") === "agente" ? "agente" : "contactos";
    redirect(`/agentes/cotizacion/${solicitudId}?tab=${tab}&aviso=${aviso}`);
  }
  volver(aviso, "?tab=solicitudes");
}

/** El correo aprobado sale por la salida común; sin el correo de la cuenta conectado queda aprobado y sin enviar. */
export async function aprobarEnvioCotizacion(formData: FormData) {
  await requerirSesion();
  const envioId = Number(mensajeDe(formData, "envioId"));
  if (!Number.isInteger(envioId) || envioId <= 0) volver("envio-invalido", "?tab=solicitudes");
  let resultado: ResultadoCorreo | null | "fallo";
  try { resultado = await aprobarCorreoCotizacion(envioId); }
  catch { resultado = "fallo"; }
  // Fuera del try: redirect() lanza un error propio de Next y el catch lo convertiría en "No pudimos aprobar".
  if (resultado === null) volver("borrador-no-disponible", "?tab=solicitudes");
  if (resultado === "fallo") volver("error-aprobar-envio", "?tab=solicitudes");
  volverDelCorreo(formData, resultado.solicitudId, resultado.enviado ? "envio-aprobado" : "envio-aprobado-sin-enviar");
}

/** "Enviar ahora": vuelve a intentar un correo aprobado que no salió. */
export async function reenviarCorreoCotizacionAccion(formData: FormData) {
  await requerirSesion();
  const envioId = Number(mensajeDe(formData, "envioId"));
  if (!Number.isInteger(envioId) || envioId <= 0) volver("envio-invalido", "?tab=solicitudes");
  let resultado: ResultadoCorreo | null | "fallo";
  try { resultado = await reenviarCorreoCotizacion(envioId); }
  catch { resultado = "fallo"; }
  if (resultado === null) volver("borrador-no-disponible", "?tab=solicitudes");
  if (resultado === "fallo") volver("error-aprobar-envio", "?tab=solicitudes");
  volverDelCorreo(formData, resultado.solicitudId, resultado.enviado ? "correo-enviado" : "envio-aprobado-sin-enviar");
}

/** "Aprobar y cotizar": autoriza al agente a cotizar por conexión directa o portal. Los correos siguen esperando su aprobación. */
export async function aprobarYCotizarSolicitud(formData: FormData) {
  await requerirSesion();
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  let encolados: number | null | "fallo";
  try { encolados = await autorizarCotizacion(solicitudId, "aprobada"); }
  catch { encolados = "fallo"; }
  // El agente cotiza en segundo plano; si no termina acá, lo retoma el cron de la cola.
  if (typeof encolados === "number") await despacharCotizaciones(encolados);
  revalidatePath("/agentes/cotizacion");
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  const aviso = encolados === "fallo" ? "error-cotizar" : encolados === null ? "solicitud-cerrada" : encolados > 0 ? "cotizando" : "nada-para-cotizar";
  redirect(`/agentes/cotizacion/${solicitudId}?tab=contactos&aviso=${aviso}`);
}

/** Resultado del resumen al ejecutivo, como aviso del detalle. */
function avisoResumen(resultado: ResultadoResumen | null | "fallo"): string {
  if (resultado === null || resultado === "fallo") return "error-resumen";
  if ("cambio" in resultado) return "resumen-cambio";
  return resultado.enviado ? "resumen-enviado" : "resumen-sin-enviar";
}

/** El productor aprueba el resumen de la solicitud para el ejecutivo (su correo de Mi cuenta). */
export async function aprobarResumenEjecutivoAccion(formData: FormData) {
  await requerirSesion();
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  let resultado: ResultadoResumen | null | "fallo";
  try { resultado = await aprobarResumenEjecutivo(solicitudId, mensajeDe(formData, "huella")); }
  catch { resultado = "fallo"; }
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  redirect(`/agentes/cotizacion/${solicitudId}?tab=agente&aviso=${avisoResumen(resultado)}`);
}

/** "Enviar ahora" del resumen al ejecutivo que quedó aprobado y sin enviar. */
export async function reenviarResumenEjecutivoAccion(formData: FormData) {
  await requerirSesion();
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  let resultado: ResultadoResumen | null | "fallo";
  try { resultado = await reenviarResumenEjecutivo(solicitudId); }
  catch { resultado = "fallo"; }
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  redirect(`/agentes/cotizacion/${solicitudId}?tab=agente&aviso=${avisoResumen(resultado)}`);
}

/** El productor responde el dato que pidió la compañía: se guarda en el riesgo y el agente vuelve a cotizar. */
export async function responderDatoCotizacion(formData: FormData) {
  await requerirSesion();
  const envioId = Number(mensajeDe(formData, "envioId"));
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(envioId) || envioId <= 0 || !Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=envio-invalido");
  let resultado: Awaited<ReturnType<typeof responderDatoPedido>> | "fallo";
  try { resultado = await responderDatoPedido(envioId, mensajeDe(formData, "respuesta")); }
  catch { resultado = "fallo"; }
  if (resultado && typeof resultado === "object") await despacharCotizaciones(1);
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  const aviso = resultado === "invalida" ? "dato-vacio" : resultado === "fallo" ? "error-dato" : resultado === null ? "dato-no-disponible" : "dato-respondido";
  redirect(`/agentes/cotizacion/${solicitudId}?tab=contactos&aviso=${aviso}`);
}

export async function omitirBorradorCotizacion(formData: FormData) {
  await requerirSesion();
  const envioId = Number(mensajeDe(formData, "envioId"));
  if (!Number.isInteger(envioId) || envioId <= 0) volver("envio-invalido", "?tab=solicitudes");
  const [envio] = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, envioId));
  if (!envio || envio.estadoBorrador !== "pendiente") volver("borrador-no-disponible", "?tab=solicitudes");
  await db.transaction(async (tx) => {
    await tx.update(schema.cotizacionEnvios).set({ estadoBorrador: "omitido", ultimaActividad: new Date() }).where(eq(schema.cotizacionEnvios.id, envioId));
    await tx.insert(schema.cotizacionEventos).values({ solicitudId: envio.solicitudId, envioId, actor: "productor", tipo: "borrador_omitido", detalle: `El productor omitió el borrador para ${envio.compania}.` });
  });
  volverDelCorreo(formData, envio.solicitudId, "borrador-omitido");
}

export async function cargarArchivoCotizacion(formData: FormData) {
  await requerirSesion();
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  const envioTexto = mensajeDe(formData, "envioId");
  const envioId = envioTexto ? Number(envioTexto) : null;
  const archivo = formData.get("archivo");
  if (!Number.isInteger(solicitudId) || solicitudId <= 0 || !(archivo instanceof File) || !archivo.size || archivo.size > 25 * 1024 * 1024) volver("archivo-invalido", `?solicitud=${solicitudId}`);
  const permitido = /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/msword|application\/vnd\.ms-excel|image\/(png|jpeg|webp))$/;
  if (!permitido.test(archivo.type)) volver("archivo-invalido", `?solicitud=${solicitudId}`);
  const [solicitud] = await db.select({ id: schema.solicitudesCotizacion.id }).from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  if (!solicitud) volver("solicitud-inexistente", `?solicitud=${solicitudId}`);
  if (envioId != null) {
    if (!Number.isInteger(envioId) || envioId <= 0) volver("archivo-invalido", `?solicitud=${solicitudId}`);
    const [envio] = await db.select({ id: schema.cotizacionEnvios.id }).from(schema.cotizacionEnvios).where(and(eq(schema.cotizacionEnvios.id, envioId), eq(schema.cotizacionEnvios.solicitudId, solicitudId)));
    if (!envio) volver("archivo-invalido", `?solicitud=${solicitudId}`);
  }
  await db.insert(schema.cotizacionArchivos).values({ solicitudId, envioId, nombre: archivo.name.slice(0, 250), mime: archivo.type, bytes: Buffer.from(await archivo.arrayBuffer()), tamano: archivo.size });
  await db.insert(schema.cotizacionEventos).values({ solicitudId, envioId, tipo: "archivo_cargado", detalle: "Se adjuntó un archivo a la solicitud." });
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  redirect(`/agentes/cotizacion/${solicitudId}?aviso=archivo-guardado`);
}

export async function marcarSolicitudCompletada(formData: FormData) {
  await requerirSesion();
  const id = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(id) || id <= 0) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  const [solicitud] = await db.select({ id: schema.solicitudesCotizacion.id, numero: schema.solicitudesCotizacion.numero }).from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, id));
  if (!solicitud) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  await db.update(schema.solicitudesCotizacion).set({ completadoEl: new Date(), actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, id));
  await db.insert(schema.cotizacionEventos).values({ solicitudId: id, tipo: "solicitud_completada", detalle: "El productor marcó la solicitud como completada." });
  await db.insert(schema.actividadAgentes).values({ agente: "cotizacion", referencia: `solicitud:${solicitud.numero}`, texto: `Marcaste la solicitud ${solicitud.numero} como completada.` });
  revalidatePath("/agentes/cotizacion");
  redirect(`/agentes/cotizacion/${id}?aviso=completada`);
}

export async function simularRespuestaCotizacion(formData: FormData) {
  await requerirSesion();
  const envioId = Number(mensajeDe(formData, "envioId"));
  const escenario = mensajeDe(formData, "escenario");
  if (process.env.NODE_ENV === "production" || !Number.isInteger(envioId) || envioId <= 0 || !["cotizado", "pregunta", "rechazado", "error"].includes(escenario)) {
    redirect("/agentes/cotizacion?aviso=simulador-no-disponible");
  }
  const [envio] = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, envioId));
  if (!envio) redirect("/agentes/cotizacion?aviso=envio-invalido");
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, envio.solicitudId));
  if (!solicitud?.esEjemplo) redirect("/agentes/cotizacion?aviso=simulador-no-disponible");
  if (escenario === "cotizado") {
    await registrarResultadoCotizacion({ solicitudId: solicitud.id, compania: envio.compania, precio: 100000, primaNeta: 80000, observacion: "Respuesta generada por el simulador de desarrollo.", origen: "portal", confirmado: false, actor: "simulador" });
  } else {
    const cambio = escenario === "pregunta"
      ? { estado: "requiere_atencion" as const, preguntasPendientes: "La compañía solicita información adicional." }
      : escenario === "rechazado"
        ? { estado: "rechazado" as const, preguntasPendientes: null }
        : { estado: "error" as const, preguntasPendientes: null };
    await db.update(schema.cotizacionEnvios).set({ ...cambio, ultimaActividad: new Date() }).where(eq(schema.cotizacionEnvios.id, envio.id));
    await db.insert(schema.cotizacionEventos).values({ solicitudId: solicitud.id, envioId, actor: "simulador", tipo: `respuesta_${escenario}`, detalle: `Respuesta de prueba simulada: ${escenario}.` });
  }
  revalidatePath(`/agentes/cotizacion/${solicitud.id}`);
  redirect(`/agentes/cotizacion/${solicitud.id}?tab=contactos&aviso=respuesta-simulada`);
}

/** Por qué no hubo resultado de la IA, como aviso para el detalle. */
function avisoSinIA(motivo: MotivoSinIA | "fallo"): string {
  if (motivo === "sin_clave" || motivo === "desactivada") return "ia-no-disponible";
  if (motivo === "sin_cuota") return "ia-sin-cuota";
  return "ia-sin-resultado";
}

export async function chatearCotizacionIA(formData: FormData) {
  await requerirSesion();
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  const mensaje = mensajeDe(formData, "mensaje");
  if (!Number.isInteger(solicitudId) || solicitudId <= 0 || !mensaje) redirect("/agentes/cotizacion?aviso=ia-no-disponible");
  let resultado: ResultadoIACotizacion | null | "fallo";
  try { resultado = await responderChatCotizacion(solicitudId, mensaje); }
  catch { resultado = "fallo"; }
  if (resultado === null) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  if (resultado === "fallo" || !resultado.ok) redirect(`/agentes/cotizacion/${solicitudId}?tab=agente&aviso=${avisoSinIA(resultado === "fallo" ? resultado : resultado.motivo)}`);
  redirect(`/agentes/cotizacion/${solicitudId}?tab=agente&ia=${resultado.borradorId}`);
}

export async function redactarCorreoConIA(formData: FormData) {
  await requerirSesion();
  const envioId = Number(mensajeDe(formData, "envioId"));
  if (!Number.isInteger(envioId) || envioId <= 0) redirect("/agentes/cotizacion?aviso=ia-no-disponible");
  const [envio] = await db.select({ solicitudId: schema.cotizacionEnvios.solicitudId }).from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, envioId));
  if (!envio) redirect("/agentes/cotizacion?aviso=envio-invalido");
  let resultado: ResultadoIACotizacion | null | "fallo";
  try { resultado = await redactarCorreoCotizacion(envioId); }
  catch { resultado = "fallo"; }
  revalidatePath(`/agentes/cotizacion/${envio.solicitudId}`);
  const aviso = resultado === null ? "borrador-no-disponible" : resultado === "fallo" || !resultado.ok ? avisoSinIA(resultado === "fallo" ? resultado : resultado.motivo) : "ia-generada";
  redirect(`/agentes/cotizacion/${envio.solicitudId}?tab=contactos&aviso=${aviso}`);
}

export async function extraerPdfConIA(formData: FormData) {
  await requerirSesion();
  const archivoId = Number(mensajeDe(formData, "archivoId"));
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(archivoId) || archivoId <= 0 || !Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=ia-no-disponible");
  let lectura: Awaited<ReturnType<typeof encolarLecturaPdf>> | "fallo";
  try { lectura = await encolarLecturaPdf(archivoId, solicitudId); }
  catch { lectura = "fallo"; }
  // La IA lee en segundo plano; si no termina acá, la retoma el cron de la cola.
  if (lectura === "encolada") await despachadorTrabajos.despachar(archivoId);
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  const aviso = lectura === "encolada" || lectura === "en_curso" ? "ia-leyendo" : lectura === null ? "archivo-invalido" : "ia-sin-resultado";
  redirect(`/agentes/cotizacion/${solicitudId}?tab=cotizaciones&aviso=${aviso}`);
}

export async function confirmarResultadoCotizacionAccion(formData: FormData) {
  await requerirSesion();
  const resultadoId = Number(mensajeDe(formData, "resultadoId"));
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  let confirmada = false;
  try {
    await confirmarResultadoCotizacion(resultadoId);
    confirmada = true;
  } catch {
    // Se avisa abajo, fuera del try: un redirect adentro terminaría en este catch.
  }
  revalidatePath("/agentes/cotizacion");
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  redirect(`/agentes/cotizacion/${solicitudId}?tab=cotizaciones&aviso=${confirmada ? "resultado-confirmado" : "error-confirmar-resultado"}`);
}

export async function generarPropuestaCotizacion(formData: FormData) {
  await requerirSesion();
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  if (!Number.isInteger(solicitudId) || solicitudId <= 0) redirect("/agentes/cotizacion?aviso=solicitud-invalida");
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  if (!solicitud) redirect("/agentes/cotizacion?aviso=solicitud-inexistente");
  const [ajustes] = await db.select().from(schema.ajustes).where(eq(schema.ajustes.id, 1));
  const envios = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.solicitudId, solicitudId));
  const ids = envios.map((envio) => envio.id);
  const resultados = ids.length ? await db.select().from(schema.cotizacionResultados).where(inArray(schema.cotizacionResultados.envioId, ids)) : [];
  const porEnvio = new Map(resultados.map((resultado) => [resultado.envioId, resultado]));
  const mejor = mejorResultadoConfirmado(resultados);
  const filas = [
    { etiqueta: "Organizacion", valor: ajustes?.productorOrganizacion ?? "Productor de seguros" },
    { etiqueta: "Cliente", valor: solicitud.cliente }, { etiqueta: "Ramo", valor: solicitud.ramo },
    ...envios.filter((envio) => porEnvio.get(envio.id)?.confirmado).map((envio) => {
      const resultado = porEnvio.get(envio.id)!;
      return { etiqueta: `${envio.compania}${mejor?.envioId === envio.id ? " (mejor precio)" : ""}`, valor: `Prima total ${resultado.moneda} ${resultado.primaTotal.toLocaleString("es-AR")}; franquicia ${resultado.franquicia ?? "a confirmar"}; vigencia ${resultado.vigencia ?? "a confirmar"}` };
    }),
  ];
  if (!resultados.some((resultado) => resultado.confirmado)) redirect(`/agentes/cotizacion/${solicitudId}?tab=cotizaciones&aviso=sin-resultados-confirmados`);
  const bytes = Buffer.from(generarPdfPropuesta(`Propuesta para ${solicitud.cliente}`, filas));
  const nombre = `propuesta-${solicitud.numero}.pdf`;
  await db.insert(schema.cotizacionPropuestas).values({ solicitudId, nombre, bytes });
  await db.insert(schema.cotizacionEventos).values({ solicitudId, actor: "productor", tipo: "propuesta_generada", detalle: "Se generó una propuesta PDF como borrador; requiere aprobación antes de compartir." });
  revalidatePath(`/agentes/cotizacion/${solicitudId}`);
  redirect(`/agentes/cotizacion/${solicitudId}?tab=cotizaciones&aviso=propuesta-generada`);
}

export async function aprobarPropuestaCotizacion(formData: FormData) {
  await requerirSesion();
  const propuestaId = Number(mensajeDe(formData, "propuestaId"));
  if (!Number.isInteger(propuestaId) || propuestaId <= 0) redirect("/agentes/cotizacion?aviso=propuesta-invalida");
  const [propuesta] = await db.select().from(schema.cotizacionPropuestas).where(eq(schema.cotizacionPropuestas.id, propuestaId));
  if (!propuesta) redirect("/agentes/cotizacion?aviso=propuesta-inexistente");
  if (propuesta.estado === "borrador") {
    await db.update(schema.cotizacionPropuestas).set({ estado: "aprobada", aprobadoEl: new Date() }).where(eq(schema.cotizacionPropuestas.id, propuestaId));
    await db.insert(schema.cotizacionEventos).values({ solicitudId: propuesta.solicitudId, actor: "productor", tipo: "propuesta_aprobada", detalle: "El productor aprobó la propuesta PDF. El archivo sigue disponible para compartir manualmente." });
  }
  revalidatePath(`/agentes/cotizacion/${propuesta.solicitudId}`);
  redirect(`/agentes/cotizacion/${propuesta.solicitudId}?tab=cotizaciones&aviso=propuesta-aprobada`);
}

export async function cargarResultadoCotizacion(formData: FormData) {
  await requerirSesion();
  const query = queryDeFiltros(formData);
  const solicitudId = Number(mensajeDe(formData, "solicitudId"));
  const compania = mensajeDe(formData, "compania");
  const precio = Number(mensajeDe(formData, "precio"));
  const observacion = mensajeDe(formData, "observacion").slice(0, 500);
  const primaNetaTexto = mensajeDe(formData, "primaNeta");
  const gastosTexto = mensajeDe(formData, "gastos");
  const impuestosTexto = mensajeDe(formData, "impuestos");
  const sumaTexto = mensajeDe(formData, "sumaAsegurada");
  const primaNeta = primaNetaTexto ? Number(primaNetaTexto) : null;
  const gastos = gastosTexto ? Number(gastosTexto) : 0;
  const impuestos = impuestosTexto ? Number(impuestosTexto) : 0;
  const sumaAsegurada = sumaTexto ? Number(sumaTexto) : null;
  const camposRiesgoCotizado = ["cuitCuil", "marca", "modelo", "anio", "codigoPostal"];
  const riesgoCotizado = Object.fromEntries(camposRiesgoCotizado.map((campo) => [campo, mensajeDe(formData, `${campo}Cotizado`).slice(0, 120)]).filter(([, valor]) => valor));
  if (!Number.isInteger(solicitudId) || solicitudId <= 0 || !compania || !Number.isFinite(precio) || precio <= 0) {
    volver("resultado-cotizacion-invalido", query);
  }
  if ([primaNeta, gastos, impuestos, sumaAsegurada].some((valor) => valor != null && (!Number.isFinite(valor) || valor < 0))) volver("resultado-cotizacion-invalido", query);
  try {
    // Las filas de cobertura del comparativo (solo en el detalle): reemplazan las que se cargaron a mano y conservan las de la compañía.
    let coberturas: Cobertura[] | undefined;
    if (FILAS_COBERTURA.some((fila) => formData.has(`cobertura_${fila.id}`))) {
      const [actual] = await db.select({ coberturas: schema.cotizacionResultados.coberturas }).from(schema.cotizacionResultados)
        .innerJoin(schema.cotizacionEnvios, eq(schema.cotizacionEnvios.id, schema.cotizacionResultados.envioId))
        .where(and(eq(schema.cotizacionEnvios.solicitudId, solicitudId), eq(schema.cotizacionEnvios.compania, compania)));
      coberturas = unirCoberturasManuales(actual?.coberturas ?? [], Object.fromEntries(FILAS_COBERTURA.map((fila) => [fila.id, mensajeDe(formData, `cobertura_${fila.id}`)])));
    }
    await registrarResultadoCotizacion({
      solicitudId, compania, precio, observacion, origen: "manual", primaNeta, gastos, impuestos, sumaAsegurada, coberturas,
      franquicia: mensajeDe(formData, "franquicia").slice(0, 200) || null,
      condiciones: mensajeDe(formData, "condiciones").slice(0, 2000) || null,
      vigencia: mensajeDe(formData, "vigencia").slice(0, 200) || null,
      riesgoCotizado,
    });
  } catch {
    volver("error-resultado-cotizacion", query);
  }
  revalidatePath("/agentes/cotizacion");
  if (mensajeDe(formData, "volverDetalle") === "on") {
    revalidatePath(`/agentes/cotizacion/${solicitudId}`);
    redirect(`/agentes/cotizacion/${solicitudId}?tab=cotizaciones&aviso=resultado-cotizacion-guardado`);
  }
  volver("resultado-cotizacion-guardado", query);
}
