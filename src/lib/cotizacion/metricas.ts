export type EnvioParaMetricas = {
  solicitudId: number;
  compania: string;
  productor: string;
  estado: string;
  creadoEl: Date;
  respondidoEl?: Date | null;
  primaNeta?: number | null;
  seguimientos: number;
};

function promedio(valores: number[]): number | null {
  return valores.length ? valores.reduce((suma, valor) => suma + valor, 0) / valores.length : null;
}

function agrupar<T>(items: T[], clave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of items) grupos.set(clave(item), [...(grupos.get(clave(item)) ?? []), item]);
  return grupos;
}

function tiempoRespuestaHoras(envio: EnvioParaMetricas): number | null {
  return envio.respondidoEl ? Math.max(0, (envio.respondidoEl.getTime() - envio.creadoEl.getTime()) / 3_600_000) : null;
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

export function rankingProductores(envios: EnvioParaMetricas[]) {
  const solicitudes = new Map<string, Set<string>>();
  const porProductor = new Map<string, EnvioParaMetricas[]>();
  for (const envio of envios) {
    porProductor.set(envio.productor, [...(porProductor.get(envio.productor) ?? []), envio]);
    const lista = solicitudes.get(envio.productor) ?? new Set<string>();
    lista.add(String(envio.solicitudId));
    solicitudes.set(envio.productor, lista);
  }
  return [...porProductor].map(([productor, items]) => {
    const cerrados = items.filter((envio) => ["cotizado", "rechazado"].includes(envio.estado));
    const ganados = items.filter((envio) => envio.estado === "cotizado");
    const tiempos = items.map(tiempoRespuestaHoras).filter((n): n is number => n !== null);
    return {
      productor,
      solicitudes: solicitudes.get(productor)?.size ?? 0,
      cerradas: cerrados.length,
      activas: items.length - cerrados.length,
      tasaCotizacion: cerrados.length ? ganados.length / cerrados.length : 0,
      tiempoPromedioCierreHoras: promedio(tiempos),
      pendientes: items.filter((envio) => envio.estado === "pendiente" || envio.estado === "borrador").length,
    };
  }).sort((a, b) => b.solicitudes - a.solicitudes || a.productor.localeCompare(b.productor, "es"));
}

export function solicitudesDetenidas<T extends { estado: string; actualizadoEl: Date }>(solicitudes: T[], ahora: Date, limiteHoras = 48): T[] {
  return solicitudes
    .filter((solicitud) => !["ganada", "perdida", "enviada"].includes(solicitud.estado)
      && ahora.getTime() - solicitud.actualizadoEl.getTime() >= limiteHoras * 3_600_000)
    .sort((a, b) => a.actualizadoEl.getTime() - b.actualizadoEl.getTime());
}
