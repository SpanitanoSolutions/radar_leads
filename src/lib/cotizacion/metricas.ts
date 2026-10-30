import type { IntentoEnvio } from "@/db/schema";

export type EnvioParaMetricas = {
  solicitudId: number;
  compania: string;
  productor: string;
  estado: string;
  /** Cuándo le llegó el pedido a la compañía (ver momentosDelEnvio()). Null si no salió o no se sabe. */
  salidoEl: Date | null;
  /** Cuándo respondió: la cotización recibida o el rechazo. */
  respondidoEl?: Date | null;
  primaNeta?: number | null;
  seguimientos: number;
};

/**
 * Cuándo salió el pedido y cuándo respondió la compañía, para medir el tiempo
 * de respuesta desde que salió y no desde que se creó el borrador:
 * - salió: el primer intento que llegó a la compañía (un correo enviado, o un
 *   canal automático que respondió algo); en los envíos de antes de los
 *   conectores (sin intentos), cuando el productor aprobó el correo;
 * - respondió: la respuesta registrada o, si rechazó, el intento del rechazo.
 */
export function momentosDelEnvio(
  envio: { estado: string; intentos: IntentoEnvio[]; aprobadoEl: Date | null },
  resultado?: { recibidoEl: Date } | null,
): { salidoEl: Date | null; respondidoEl: Date | null } {
  const intentos = [...envio.intentos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const salida = intentos.find((intento) => intento.resultado !== "error");
  const salidoEl = salida ? new Date(salida.fecha) : !intentos.length && envio.estado !== "pendiente" ? envio.aprobadoEl : null;
  const rechazo = intentos.find((intento) => intento.resultado === "rechazada");
  const respondidoEl = resultado?.recibidoEl ?? (rechazo ? new Date(rechazo.fecha) : null);
  return { salidoEl, respondidoEl };
}

function promedio(valores: number[]): number | null {
  return valores.length ? valores.reduce((suma, valor) => suma + valor, 0) / valores.length : null;
}

function agrupar<T>(items: T[], clave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of items) grupos.set(clave(item), [...(grupos.get(clave(item)) ?? []), item]);
  return grupos;
}

/** Horas entre que salió el pedido y la respuesta. Sin salida o sin respuesta, no se mide. */
function tiempoRespuestaHoras(envio: EnvioParaMetricas): number | null {
  return envio.salidoEl && envio.respondidoEl ? Math.max(0, (envio.respondidoEl.getTime() - envio.salidoEl.getTime()) / 3_600_000) : null;
}

export function metricasPorAseguradora(envios: EnvioParaMetricas[]) {
  return [...agrupar(envios, (envio) => envio.compania)].map(([compania, items]) => {
    const cotizados = items.filter((envio) => envio.estado === "cotizado");
    const rechazados = items.filter((envio) => envio.estado === "rechazado");
    return {
      compania,
      intentos: items.length,
      tasaCotizacion: items.length ? cotizados.length / items.length : 0,
      tasaRechazo: items.length ? rechazados.length / items.length : 0,
      tiempoPromedioHoras: promedio(items.map(tiempoRespuestaHoras).filter((n): n is number => n !== null)),
      seguimientosPromedio: promedio(items.map((envio) => envio.seguimientos)) ?? 0,
      primaNetaPromedio: promedio(cotizados.map((envio) => envio.primaNeta).filter((n): n is number => n != null)),
      volumen: cotizados.length,
    };
  }).sort((a, b) => b.intentos - a.intentos || a.compania.localeCompare(b.compania, "es"));
}

export type SolicitudParaMetricas = {
  id: number;
  productor: string;
  estado: string;
  creadoEl: Date;
  actualizadoEl: Date;
  completadoEl?: Date | null;
};

const cerrada = (solicitud: SolicitudParaMetricas) => Boolean(solicitud.completadoEl) || ["ganada", "perdida"].includes(solicitud.estado);

/**
 * Ranking por productor o ejecutivo. Solicitudes, cerradas y activas cuentan
 * solicitudes (completada, ganada o perdida es cerrada); la tasa de cotización
 * y los pendientes, envíos. El tiempo de cierre va de crear la solicitud a
 * completarla (o a su último cambio, si se ganó o se perdió sin completarla).
 */
export function rankingProductores(envios: EnvioParaMetricas[], solicitudes: SolicitudParaMetricas[]) {
  const enviosPorProductor = agrupar(envios, (envio) => envio.productor);
  return [...agrupar(solicitudes, (solicitud) => solicitud.productor)].map(([productor, propias]) => {
    const items = enviosPorProductor.get(productor) ?? [];
    const enviosCerrados = items.filter((envio) => ["cotizado", "rechazado"].includes(envio.estado));
    const cerradas = propias.filter(cerrada);
    const tiempos = cerradas.map((solicitud) => ((solicitud.completadoEl ?? solicitud.actualizadoEl).getTime() - solicitud.creadoEl.getTime()) / 3_600_000)
      .filter((horas) => horas >= 0);
    return {
      productor,
      solicitudes: propias.length,
      cerradas: cerradas.length,
      activas: propias.length - cerradas.length,
      tasaCotizacion: enviosCerrados.length ? items.filter((envio) => envio.estado === "cotizado").length / enviosCerrados.length : 0,
      tiempoPromedioCierreHoras: promedio(tiempos),
      pendientes: items.filter((envio) => envio.estado === "pendiente" || envio.estado === "borrador").length,
    };
  }).sort((a, b) => b.solicitudes - a.solicitudes || a.productor.localeCompare(b.productor, "es"));
}

/** Activas sin movimiento hace más de `limiteHoras`. Las completadas cuentan como cerradas. */
export function solicitudesDetenidas<T extends { estado: string; actualizadoEl: Date; completadoEl?: Date | null }>(solicitudes: T[], ahora: Date, limiteHoras = 48): T[] {
  return solicitudes
    .filter((solicitud) => !solicitud.completadoEl && !["ganada", "perdida", "enviada"].includes(solicitud.estado)
      && ahora.getTime() - solicitud.actualizadoEl.getTime() >= limiteHoras * 3_600_000)
    .sort((a, b) => a.actualizadoEl.getTime() - b.actualizadoEl.getTime());
}
