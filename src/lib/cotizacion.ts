import { normalizar } from "@/fuentes/clasificacion";

export type EstadoCotizacion = "atencion" | "esperando" | "lista" | "enviada" | "ganada" | "perdida";
export type FiltroCotizacion = { q?: string; estado?: string; ramo?: string; origen?: string };

export type SolicitudParaLista = {
  numero: number;
  cliente: string;
  ramo: string;
  bien: string | null;
  origen: string;
  estado: EstadoCotizacion;
  cotizaciones: { compania: string; precio: number | null }[];
};

export const ESTADOS_COTIZACION: { id: EstadoCotizacion; texto: string }[] = [
  { id: "atencion", texto: "Requiere tu atención" },
  { id: "esperando", texto: "Esperando compañías" },
  { id: "lista", texto: "Comparativa lista" },
  { id: "enviada", texto: "Enviada al cliente" },
  { id: "ganada", texto: "Ganada" },
  { id: "perdida", texto: "Perdida" },
];

export function filtrarSolicitudes<T extends SolicitudParaLista>(solicitudes: T[], filtros: FiltroCotizacion): T[] {
  const q = normalizar(filtros.q?.trim() ?? "");
  return solicitudes.filter((solicitud) => {
    if (filtros.estado && solicitud.estado !== filtros.estado) return false;
    if (filtros.ramo && solicitud.ramo !== filtros.ramo) return false;
    if (filtros.origen && solicitud.origen !== filtros.origen) return false;
    return !q || normalizar(`${solicitud.cliente} ${solicitud.numero}`).includes(q);
  });
}

export function mejorCotizacion(cotizaciones: { compania: string; precio: number | null }[]): { compania: string; precio: number } | null {
  return cotizaciones
    .filter((cotizacion): cotizacion is { compania: string; precio: number } => cotizacion.precio !== null)
    .sort((a, b) => a.precio - b.precio)[0] ?? null;
}

export function resumenCotizacion(solicitudes: SolicitudParaLista[]) {
  const mes = solicitudes.filter((solicitud) => !["ganada", "perdida"].includes(solicitud.estado));
  return {
    activas: mes.length,
    atencion: solicitudes.filter((solicitud) => solicitud.estado === "atencion").length,
    delMes: solicitudes.length,
    recibidas: solicitudes.reduce(
      (total, solicitud) => total + solicitud.cotizaciones.filter((cotizacion) => cotizacion.precio !== null).length,
      0,
    ),
    ganadas: solicitudes.filter((solicitud) => solicitud.estado === "ganada").length,
    cerradas: solicitudes.filter((solicitud) => solicitud.estado === "ganada" || solicitud.estado === "perdida").length,
  };
}