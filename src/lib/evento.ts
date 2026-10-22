import type { Lead } from "@/db/schema";
import { diaEnArgentina, haceCuanto } from "./fechas";

// Qué pasó (licitación ganada, sociedad nueva, compra de fondo de comercio) y
// cuándo. La urgencia de un lead depende de cuánto hace que ocurrió el evento,
// no de cuándo lo detectó el radar.

export type TipoEvento = "licitacion" | "sociedad" | "transferencia" | "otro";

export function tipoDeEvento(lead: Pick<Lead, "clave" | "alcanceLicitacion" | "motivo">): TipoEvento {
  const clave = lead.clave ?? "";
  if (clave.startsWith("comprar:") || lead.alcanceLicitacion) return "licitacion";
  if (clave.startsWith("bo-pba:sociedad:") || /sociedad nueva/i.test(lead.motivo)) return "sociedad";
  if (clave.startsWith("bo-pba:transferencia:") || /fondo de comercio/i.test(lead.motivo)) return "transferencia";
  return "otro";
}

/** "2026-06-22" → mediodía de ese día en Argentina (evita saltos de día por zona horaria). */
export function fechaDeDia(iso: string): Date {
  return new Date(`${iso}T12:00:00-03:00`);
}

/** Días calendario (en Argentina) entre la fecha del evento y hoy. */
export function diasDesde(iso: string, ahora: Date = new Date()): number {
  const hoy = diaEnArgentina(ahora);
  const a = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const b = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Cuánto baja el score con la antigüedad del evento. Una licitación de más de
 * 30 días ya presentó su garantía: la caución dejó de ser urgente.
 * Las sociedades y los fondos de comercio tardan más en contratar seguros.
 */
export function penalizacionPorAntiguedad(tipo: TipoEvento, dias: number | null): number {
  if (dias === null) return 0;
  switch (tipo) {
    case "licitacion":
      if (dias > 90) return -35;
      if (dias > 30) return -25;
      if (dias > 15) return -10;
      if (dias > 7) return -5;
      return 0;
    case "sociedad":
      if (dias > 90) return -20;
      if (dias > 60) return -10;
      if (dias > 30) return -5;
      return 0;
    case "transferencia":
      if (dias > 60) return -15;
      if (dias > 30) return -5;
      return 0;
    default:
      return 0;
  }
}

/** Días después de los cuales la caución de una licitación ya no es lo primero que ofrecer. */
export const DIAS_CAUCION_URGENTE = 30;

/** Ramos en el orden en que conviene ofrecerlos hoy. */
export function ramosSugeridos(ramos: string[], tipo: TipoEvento, dias: number | null): string[] {
  if (tipo !== "licitacion" || dias === null || dias <= DIAS_CAUCION_URGENTE) return ramos;
  return [...ramos.filter((r) => r !== "Caución"), ...ramos.filter((r) => r === "Caución")];
}

const VERBO: Record<TipoEvento, string> = {
  licitacion: "Adjudicada",
  sociedad: "Publicado",
  transferencia: "Publicado",
  otro: "Publicado",
};

/** "Adjudicada hace 5 días", "Publicado hoy", "Adjudicada el 22 jun". */
export function etiquetaEvento(tipo: TipoEvento, fechaEvento: string, ahora: Date = new Date()): string {
  const cuando = haceCuanto(fechaDeDia(fechaEvento), ahora);
  const texto = /^\d/.test(cuando) ? `el ${cuando}` : cuando.charAt(0).toLowerCase() + cuando.slice(1);
  return `${VERBO[tipo]} ${texto}`;
}
