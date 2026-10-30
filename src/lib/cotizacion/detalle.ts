import type { IntentoEnvio } from "@/db/schema";
import { ESTADOS_ENVIO_CERRADOS, mejorResultadoConfirmado } from "@/lib/cotizacion";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { estadoEnvioVisible } from "./orquestador";

// El detalle de una solicitud (fase 4 de docs/specs/cotizacion-v2.md): la tabla
// de Contactos (también para Copiar y Excel), el panel de la derecha y la línea
// de tiempo de la pestaña Agente. Sin base: lo que se lee llega armado desde la
// página o la exportación.

export type EnvioDetalle = {
  id: number;
  compania: string;
  estado: string;
  estadoBorrador: string;
  canalUsado: string | null;
  numeroCompania: string | null;
  folio: string | null;
  paqueteId: number | null;
  ultimoError: string | null;
  preguntasPendientes: string | null;
  intentos: IntentoEnvio[];
  proximoSeguimiento: Date | null;
  cantidadSeguimientos: number;
  ultimaActividad: Date;
};

export type ResultadoDetalle = { envioId: number; primaTotal: number; confirmado: boolean; moneda?: string };

/** Lo que no está en el envío: qué se está cotizando, qué correo aprobado no salió, qué consulta está programada. */
export type ContextoEnvios = {
  cotizando: Set<number>;
  sinEnviar: Set<number>;
  /** La próxima consulta de una cotización que tarda (cotizacion:consultar_cotizacion), por envío. */
  consultas: Map<number, Date>;
  nombrePaquete: Map<number, string>;
  resultados: Map<number, ResultadoDetalle>;
};

const cerrado = (envio: { estado: string }) => (ESTADOS_ENVIO_CERRADOS as readonly string[]).includes(envio.estado);

/** La columna Borrador, en palabras. */
export function borradorVisible(envio: EnvioDetalle, ctx: ContextoEnvios): string {
  if (ctx.cotizando.has(envio.id)) return "Esperá la cotización automática";
  if (envio.estadoBorrador === "pendiente") return "Para aprobar";
  if (envio.estadoBorrador === "aprobado") return ctx.sinEnviar.has(envio.id) ? "Aprobado · sin enviar" : "Aprobado y enviado";
  return envio.canalUsado && envio.canalUsado !== "correo" ? "No hace falta" : "Omitido";
}

export type ProximoSeguimiento = { dia: string; tipo: "seguimiento" | "consulta" };

/**
 * El próximo seguimiento de una compañía: el correo que prepara el cron, o la
 * consulta a la compañía de una cotización que tarda. Nada si ya respondió o
 * se está cotizando.
 */
export function proximoSeguimiento(envio: EnvioDetalle, ctx: ContextoEnvios): ProximoSeguimiento | null {
  if (cerrado(envio) || ctx.cotizando.has(envio.id) || ctx.resultados.has(envio.id)) return null;
  const consulta = ctx.consultas.get(envio.id);
  if (consulta) return { dia: diaEnArgentina(consulta), tipo: "consulta" };
  if (envio.proximoSeguimiento) return { dia: diaEnArgentina(envio.proximoSeguimiento), tipo: "seguimiento" };
  return null;
}

export function textoProximo(proximo: ProximoSeguimiento | null): string {
  if (!proximo) return "—";
  return proximo.tipo === "consulta" ? `${fechaCorta(proximo.dia)} · consulta a la compañía` : fechaCorta(proximo.dia);
}

/** Estado y su detalle, sin repetir la pregunta (va en su columna). */
export function estadoContacto(envio: EnvioDetalle, ctx: ContextoEnvios): { texto: string; detalle: string | null } {
  const visible = estadoEnvioVisible(envio, { cotizando: ctx.cotizando.has(envio.id), resultado: ctx.resultados.get(envio.id) });
  return { texto: visible.texto, detalle: visible.detalle && visible.detalle !== envio.preguntasPendientes ? visible.detalle : null };
}

export function nombrePaqueteDe(envio: { paqueteId: number | null }, ctx: ContextoEnvios): string {
  return envio.paqueteId == null ? "Sin paquete" : ctx.nombrePaquete.get(envio.paqueteId) ?? "Sin paquete";
}

/** La tabla de Contactos, con encabezado: la misma para la pantalla, Copiar y Excel. */
export function tablaContactos(envios: EnvioDetalle[], ctx: ContextoEnvios): string[][] {
  return [
    ["Aseguradora", "Estado", "Borrador", "Folio", "Paquete", "Próximo seguimiento", "Seguimientos", "Preguntas", "Última actividad"],
    ...envios.map((envio) => {
      const estado = estadoContacto(envio, ctx);
      const proximo = proximoSeguimiento(envio, ctx);
      return [
        envio.compania,
        estado.detalle ? `${estado.texto}. ${estado.detalle}` : estado.texto,
        borradorVisible(envio, ctx),
        envio.folio ?? envio.numeroCompania ?? "",
        nombrePaqueteDe(envio, ctx),
        proximo ? textoProximo(proximo) : "",
        String(envio.cantidadSeguimientos),
        envio.preguntasPendientes ?? "",
        diaYHora(envio.ultimaActividad),
      ];
    }),
  ];
}

/** Para pegar en una planilla: columnas con tabulador y filas con salto de línea. */
export function textoTabulado(filas: string[][]): string {
  return filas.map((fila) => fila.map((celda) => celda.replace(/[\t\r\n]+/g, " ").trim()).join("\t")).join("\n");
}

export type AvisoAtencion = { compania: string | null; motivo: string; pestana: "contactos" | "cotizaciones" };

/** "Requiere atención" del panel: lo que espera algo del productor, compañía por compañía. */
export function atencionDeLaSolicitud(envios: EnvioDetalle[], ctx: ContextoEnvios): AvisoAtencion[] {
  const avisos: AvisoAtencion[] = [];
  let paraAprobar = 0;
  for (const envio of envios) {
    if (ctx.cotizando.has(envio.id)) continue;
    const resultado = ctx.resultados.get(envio.id);
    if (resultado && !resultado.confirmado) {
      avisos.push({ compania: envio.compania, motivo: "Respondió: falta tu confirmación.", pestana: "cotizaciones" });
      continue;
    }
    if (envio.estado === "requiere_atencion") {
      avisos.push({
        compania: envio.compania,
        motivo: envio.preguntasPendientes ? `Pide un dato: ${envio.preguntasPendientes}` : envio.ultimoError ?? "Llegó al máximo de seguimientos sin responder.",
        pestana: "contactos",
      });
    } else if (envio.estado === "error") {
      avisos.push({ compania: envio.compania, motivo: envio.ultimoError ?? "No se pudo pedir la cotización.", pestana: "contactos" });
    } else if (envio.estadoBorrador === "aprobado" && ctx.sinEnviar.has(envio.id)) {
      avisos.push({ compania: envio.compania, motivo: envio.ultimoError ?? "El correo aprobado no salió.", pestana: "contactos" });
    } else if (envio.estadoBorrador === "pendiente" && !cerrado(envio)) {
      paraAprobar++;
    }
  }
  if (paraAprobar) {
    avisos.push({ compania: null, motivo: paraAprobar === 1 ? "Un correo espera tu aprobación." : `${paraAprobar} correos esperan tu aprobación.`, pestana: "contactos" });
  }
  return avisos;
}

export type SeguimientoActivo = { compania: string; cantidad: number; maximo: number; proximo: ProximoSeguimiento };

/** Las compañías con un seguimiento o una consulta por delante, la más próxima primero. */
export function seguimientosActivos(envios: EnvioDetalle[], ctx: ContextoEnvios, maximo: number): SeguimientoActivo[] {
  return envios.flatMap((envio) => {
    const proximo = proximoSeguimiento(envio, ctx);
    return proximo ? [{ compania: envio.compania, cantidad: envio.cantidadSeguimientos, maximo, proximo }] : [];
  }).sort((a, b) => a.proximo.dia.localeCompare(b.proximo.dia) || a.compania.localeCompare(b.compania, "es"));
}

export type GrupoArchivos<T> = { titulo: string; archivos: T[] };

/** Los archivos agrupados por compañía y paquete; primero los de la solicitud. */
export function archivosPorCompania<T extends { envioId: number | null }>(
  archivos: T[],
  envios: { id: number; compania: string; paqueteId: number | null }[],
  nombrePaquete: Map<number, string>,
): GrupoArchivos<T>[] {
  const porEnvio = new Map(envios.map((envio) => [envio.id, envio]));
  const grupos = new Map<string, T[]>();
  for (const archivo of archivos) {
    const envio = archivo.envioId == null ? undefined : porEnvio.get(archivo.envioId);
    const paquete = envio?.paqueteId == null ? null : nombrePaquete.get(envio.paqueteId) ?? null;
    const titulo = envio ? `${envio.compania}${paquete ? ` · ${paquete}` : ""}` : "De la solicitud";
    grupos.set(titulo, [...(grupos.get(titulo) ?? []), archivo]);
  }
  return [...grupos].map(([titulo, lista]) => ({ titulo, archivos: lista }))
    .sort((a, b) => (a.titulo === "De la solicitud" ? -1 : b.titulo === "De la solicitud" ? 1 : a.titulo.localeCompare(b.titulo, "es")));
}

export type PasoSolicitud = { titulo: string; detalle: string; estado: "hecho" | "en_curso" | "pendiente"; fecha: Date | null };

export type DatosLineaDeTiempo = {
  solicitud: { creadoEl: Date; ramo: string; tipo: string; estado: string; completadoEl: Date | null };
  envios: EnvioDetalle[];
  eventos: { tipo: string; fecha: Date }[];
  propuestas: { estado: string; creadoEl: Date }[];
  ctx: ContextoEnvios;
};

/**
 * Si el pedido le llegó a la compañía: un correo enviado, un canal automático
 * que respondió algo o, en los envíos de antes de los conectores (sin
 * intentos), un estado que solo se alcanza después de pedirlo.
 */
export function salioElPedido(envio: { estado: string; canalUsado: string | null; intentos: IntentoEnvio[] }): boolean {
  return Boolean(envio.canalUsado)
    || envio.intentos.some((intento) => intento.resultado !== "error")
    || ["enviado", "en_seguimiento", "cotizado", "rechazado"].includes(envio.estado);
}
const salio = salioElPedido;

/**
 * La línea de tiempo de la pestaña Agente: los pasos de la solicitud, de
 * crearla a cerrarla, con lo que ya se hizo y lo que falta.
 */
export function pasosDeLaSolicitud({ solicitud, envios, eventos, propuestas, ctx }: DatosLineaDeTiempo): PasoSolicitud[] {
  const primero = (...tipos: string[]) => eventos.filter((evento) => tipos.includes(evento.tipo))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())[0]?.fecha ?? null;
  const total = envios.length;
  const conPaquete = envios.filter((envio) => envio.paqueteId != null).length;
  const salieron = envios.filter(salio).length;
  const sinPedir = envios.filter((envio) => !salio(envio) && !cerrado(envio) && envio.estadoBorrador !== "omitido" && !ctx.cotizando.has(envio.id)).length;
  const respondieron = envios.filter((envio) => ctx.resultados.has(envio.id) || cerrado(envio)).length;
  const resultados = envios.flatMap((envio) => {
    const resultado = ctx.resultados.get(envio.id);
    return resultado ? [{ ...resultado, compania: envio.compania }] : [];
  });
  const sinConfirmar = resultados.filter((resultado) => !resultado.confirmado).length;
  const mejor = mejorResultadoConfirmado(resultados);
  const cerrada = Boolean(solicitud.completadoEl) || ["ganada", "perdida"].includes(solicitud.estado);
  const autorizada = eventos.some((evento) => evento.tipo === "cotizacion_autorizada");
  const propuestaAprobada = propuestas.find((propuesta) => propuesta.estado === "aprobada");
  const propuestaBorrador = propuestas.find((propuesta) => propuesta.estado === "borrador");

  return [
    {
      titulo: "Crear la solicitud",
      detalle: `${solicitud.tipo === "renovacion" ? "Renovación" : "Negocio nuevo"} · ${solicitud.ramo}`,
      estado: "hecho",
      fecha: solicitud.creadoEl,
    },
    {
      titulo: "Elegir las aseguradoras",
      detalle: total
        ? `${total === 1 ? "1 aseguradora" : `${total} aseguradoras`} del ramo · ${conPaquete === total ? "todas con paquete" : `${conPaquete} con paquete`}`
        : "Sin aseguradoras",
      estado: total ? "hecho" : "pendiente",
      fecha: total ? solicitud.creadoEl : null,
    },
    {
      titulo: "Preparar los pedidos",
      detalle: total ? "Un borrador de correo por compañía, para tu aprobación." : "Sin pedidos",
      estado: total ? "hecho" : "pendiente",
      fecha: primero("borrador_creado") ?? (total ? solicitud.creadoEl : null),
    },
    {
      titulo: "Pedir las cotizaciones",
      detalle: `${salieron} de ${total} pedidos salieron${autorizada ? " · aprobaste cotizar con las compañías conectadas" : ""}${ctx.cotizando.size ? " · cotizando ahora" : ""}.`,
      estado: total && !sinPedir && !ctx.cotizando.size ? "hecho" : salieron || autorizada || ctx.cotizando.size ? "en_curso" : "pendiente",
      fecha: primero("cotizacion_autorizada", "correo_enviado", "borrador_aprobado"),
    },
    {
      titulo: "Recibir las respuestas",
      detalle: `${respondieron} de ${total} respondieron.`,
      estado: total && respondieron === total ? "hecho" : respondieron ? "en_curso" : "pendiente",
      fecha: primero("cotizacion_cargada", "cotizacion_sin_confirmar", "cotizacion_confirmada", "cotizacion_rechazada"),
    },
    {
      titulo: "Revisar y comparar",
      detalle: mejor
        ? `Mejor precio: ${mejor.compania}, ${pesos(mejor.primaTotal)}${sinConfirmar ? ` · ${sinConfirmar === 1 ? "1 respuesta espera" : `${sinConfirmar} respuestas esperan`} tu confirmación` : ""}.`
        : sinConfirmar ? `${sinConfirmar === 1 ? "1 respuesta espera" : `${sinConfirmar} respuestas esperan`} tu confirmación.` : "Todavía no hay respuestas para comparar.",
      estado: resultados.length && !sinConfirmar ? "hecho" : resultados.length ? "en_curso" : "pendiente",
      fecha: primero("cotizacion_confirmada"),
    },
    {
      titulo: "Propuesta para el cliente",
      detalle: propuestaAprobada ? "Aprobada: lista para compartir." : propuestaBorrador ? "En borrador: falta tu aprobación." : "Todavía no la generaste.",
      estado: propuestaAprobada ? "hecho" : propuestaBorrador ? "en_curso" : "pendiente",
      fecha: propuestaAprobada?.creadoEl ?? propuestaBorrador?.creadoEl ?? null,
    },
    {
      titulo: "Cerrar la solicitud",
      detalle: solicitud.estado === "ganada" ? "Ganada." : solicitud.estado === "perdida" ? "Perdida." : solicitud.completadoEl ? "Completada." : "Sigue abierta.",
      estado: cerrada ? "hecho" : "pendiente",
      fecha: solicitud.completadoEl ?? primero("solicitud_completada"),
    },
  ];
}
