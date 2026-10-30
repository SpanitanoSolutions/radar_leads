import { normalizar } from "@/fuentes/clasificacion";

// La bitácora del agente de Cotización (pestaña Bitácora del inicio): todos los
// eventos de las solicitudes (cotizacion_eventos), filtrables por solicitud o
// cliente, compañía, quién lo hizo, tipo de evento y fecha.

export const GRUPOS_EVENTO = [
  { id: "solicitud", texto: "Solicitud y propuesta" },
  { id: "correos", texto: "Correos y seguimientos" },
  { id: "conexiones", texto: "Conexión con las compañías" },
  { id: "respuestas", texto: "Respuestas" },
  { id: "ia", texto: "IA" },
  { id: "otros", texto: "Otros" },
] as const;
export type GrupoEvento = (typeof GRUPOS_EVENTO)[number]["id"];

const GRUPO_POR_TIPO: Record<string, GrupoEvento> = {
  solicitud_creada: "solicitud", solicitud_completada: "solicitud", solicitud_actualizada: "solicitud",
  archivo_adjunto: "solicitud", archivo_cargado: "solicitud", propuesta_generada: "solicitud", propuesta_aprobada: "solicitud",
  borrador_creado: "correos", borrador_aprobado: "correos", borrador_omitido: "correos", correo_enviado: "correos", correo_sin_enviar: "correos",
  seguimiento_borrador: "correos", seguimientos_agotados: "correos",
  resumen_ejecutivo_aprobado: "correos", resumen_ejecutivo_enviado: "correos", resumen_ejecutivo_sin_enviar: "correos",
  cotizacion_autorizada: "conexiones", cotizacion_pedida: "conexiones", cotizacion_consultada: "conexiones", consultas_agotadas: "conexiones",
  dato_pedido: "conexiones", dato_respondido: "conexiones", paso_a_correo: "conexiones", solo_correo: "conexiones",
  cotizacion_sin_confirmar: "respuestas", cotizacion_confirmada: "respuestas", cotizacion_cargada: "respuestas",
  cotizacion_no_aplicada: "respuestas", cotizacion_rechazada: "respuestas",
};

export function grupoDeEvento(tipo: string): GrupoEvento {
  if (tipo.startsWith("ia_")) return "ia";
  if (tipo.startsWith("respuesta_")) return "respuestas";
  return GRUPO_POR_TIPO[tipo] ?? "otros";
}

export const ACTORES_EVENTO = [
  { id: "productor", texto: "Vos" },
  { id: "agente", texto: "El agente" },
  { id: "ia", texto: "La IA" },
  { id: "compania", texto: "La compañía" },
  { id: "simulador", texto: "Simulador" },
] as const;

export function nombreActor(actor: string): string {
  return ACTORES_EVENTO.find((item) => item.id === actor)?.texto ?? actor;
}

export type EventoBitacora = {
  id: number;
  fecha: Date;
  tipo: string;
  actor: string;
  detalle: string;
  solicitudId: number;
  numero: number;
  cliente: string;
  compania: string | null;
};

export type FiltroBitacora = { q?: string; compania?: string; actor?: string; grupo?: string; desde?: string; hasta?: string };

/** Fecha del evento en Argentina, para comparar con los filtros "desde" y "hasta" (AAAA-MM-DD). */
function diaArgentino(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

export function filtrarBitacora<T extends EventoBitacora>(eventos: T[], filtros: FiltroBitacora): T[] {
  const q = normalizar(filtros.q?.trim() ?? "");
  return eventos.filter((evento) => {
    if (filtros.compania && evento.compania !== filtros.compania) return false;
    if (filtros.actor && evento.actor !== filtros.actor) return false;
    if (filtros.grupo && grupoDeEvento(evento.tipo) !== filtros.grupo) return false;
    const dia = diaArgentino(evento.fecha);
    if (filtros.desde && dia < filtros.desde) return false;
    if (filtros.hasta && dia > filtros.hasta) return false;
    return !q || normalizar(`${evento.numero} ${evento.cliente} ${evento.detalle}`).includes(q);
  }).sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.id - a.id);
}
