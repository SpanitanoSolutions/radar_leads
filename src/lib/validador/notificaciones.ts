import type { ErrorCorridaValidador, NotificacionesValidador } from "@/db/schema";

// Avisos del Validador al productor (Configuración → Notificaciones): por
// WhatsApp o email, a sus propios destinatarios. Son avisos internos; a los
// asegurados no se les escribe desde acá (eso lo prepara Cobranza, siempre
// como borrador). Solo salen después de las corridas automáticas.

export type EventoValidador = NonNullable<NotificacionesValidador["eventos"]>[number];
export type CanalAviso = "whatsapp" | "email";
export type ModoAviso = NonNullable<NotificacionesValidador["modo"]>;

export const EVENTOS_VALIDADOR: { id: EventoValidador; texto: string }[] = [
  { id: "pagos_confirmados", texto: "Pagos confirmados" },
  { id: "por_vencer", texto: "Cuotas que vencen esta semana" },
  { id: "vencidas", texto: "Cuotas vencidas" },
  { id: "errores", texto: "Errores de la corrida" },
];

export type NotificacionesLeidas = {
  whatsapp: { activo: boolean; destinatarios: string[] };
  email: { activo: boolean; destinatarios: string[] };
  eventos: EventoValidador[];
  modo: ModoAviso;
};

/** La configuración guardada, completa: lo que falta o no se entiende queda apagado. */
export function leerNotificaciones(valor: NotificacionesValidador | null | undefined): NotificacionesLeidas {
  const canal = (c: { activo?: unknown; destinatarios?: unknown } | undefined) => ({
    activo: c?.activo === true,
    destinatarios: Array.isArray(c?.destinatarios) ? c.destinatarios.filter((d): d is string => typeof d === "string" && d.trim() !== "") : [],
  });
  const conocidos = new Set(EVENTOS_VALIDADOR.map((e) => e.id));
  return {
    whatsapp: canal(valor?.whatsapp),
    email: canal(valor?.email),
    eventos: (valor?.eventos ?? []).filter((e) => conocidos.has(e)),
    modo: valor?.modo === "evento" ? "evento" : "resumen",
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Un destinatario por línea (o separados por coma). Los teléfonos necesitan al menos 10 dígitos. */
export function leerDestinatarios(texto: string, canal: CanalAviso): { destinatarios: string[]; invalidos: string[] } {
  const partes = texto.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
  const destinatarios: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    const valido = canal === "email" ? EMAIL.test(p) : p.replace(/\D/g, "").length >= 10 && /^[+\d\s()-]+$/.test(p);
    if (!valido) invalidos.push(p);
    else if (!destinatarios.includes(p)) destinatarios.push(p);
  }
  return { destinatarios: destinatarios.slice(0, 10), invalidos };
}

export type Aviso = { asunto: string; texto: string };

/** Lo que pasó, para armar los avisos: de la validación (modo evento) o del día (modo resumen). */
export type Hechos = { pagosConfirmados: number; porVencer: number; vencidas: number; errores: ErrorCorridaValidador[] };

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function lineaDe(evento: EventoValidador, h: Hechos): string | null {
  switch (evento) {
    case "pagos_confirmados":
      return h.pagosConfirmados ? `${cuantos(h.pagosConfirmados, "pago confirmado", "pagos confirmados")}.` : null;
    case "por_vencer":
      return h.porVencer ? `${cuantos(h.porVencer, "cuota vence", "cuotas vencen")} esta semana.` : null;
    case "vencidas":
      return h.vencidas ? `${cuantos(h.vencidas, "cuota vencida", "cuotas vencidas")} (pasó la gracia).` : null;
    case "errores":
      return h.errores.length
        ? `La corrida tuvo ${cuantos(h.errores.length, "error", "errores")}: ${h.errores.map((e) => (e.compania ? `${e.compania}: ${e.mensaje}` : e.mensaje)).join(" ")}`
        : null;
  }
}

const ASUNTO: Record<EventoValidador, string> = {
  pagos_confirmados: "Validador: pagos confirmados",
  por_vencer: "Validador: cuotas que vencen esta semana",
  vencidas: "Validador: cuotas vencidas",
  errores: "Validador: la corrida tuvo errores",
};

/** Evento por evento: un aviso por cada evento elegido que tenga novedades. */
export function avisosPorEvento(hechos: Hechos, eventos: EventoValidador[], enlace: string | null): Aviso[] {
  return EVENTOS_VALIDADOR.filter((e) => eventos.includes(e.id)).flatMap(({ id }) => {
    const linea = lineaDe(id, hechos);
    return linea ? [{ asunto: ASUNTO[id], texto: [linea, enlace ? `Detalle: ${enlace}` : null].filter(Boolean).join("\n\n") }] : [];
  });
}

/** Resumen diario: un solo aviso con el resumen del día y una línea por cada evento elegido. Sin eventos elegidos, nada. */
export function avisoDeResumen(resumen: string | null, hechos: Hechos, eventos: EventoValidador[], enlace: string | null): Aviso | null {
  if (!eventos.length) return null;
  const lineas = EVENTOS_VALIDADOR.filter((e) => eventos.includes(e.id)).map(({ id }) => lineaDe(id, hechos)).filter((l): l is string => Boolean(l));
  const texto = [resumen?.trim() || null, lineas.length ? lineas.map((l) => `• ${l}`).join("\n") : "Sin novedades en lo que elegiste avisar.", enlace ? `Detalle: ${enlace}` : null]
    .filter(Boolean)
    .join("\n\n");
  return { asunto: "Validador de pagos: resumen del día", texto };
}
