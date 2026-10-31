import { diasEntre } from "@/lib/fechas";
import type { EstadoCaso, TipoEventoCobranza } from "./tipos";

// Cómo se muestra cada estado y cada evento, en qué pestaña cae un caso y los
// KPIs del tablero. Todo puro: la pantalla y la API usan lo mismo.

export type Tono = "gris" | "rojo" | "rojo-oscuro" | "azul" | "ambar" | "verde" | "violeta" | "teal";

export const ESTADO_INFO: Record<EstadoCaso, { texto: string; tono: Tono; descripcion: string }> = {
  pendiente: { texto: "Pendiente", tono: "gris", descripcion: "Todavía no se lo contactó." },
  sin_respuesta: { texto: "Sin contacto", tono: "rojo", descripcion: "Se le escribió y no respondió." },
  respondio: { texto: "Respondió", tono: "azul", descripcion: "Hizo una consulta: revisala." },
  promesa: { texto: "Promesa", tono: "ambar", descripcion: "Prometió pagar en una fecha." },
  informo_pago: { texto: "Informó pago", tono: "teal", descripcion: "Dice que ya pagó: lo confirma el Validador de pagos." },
  escalado: { texto: "Escalado", tono: "violeta", descripcion: "Te lo pasó el agente para que lo resuelvas vos." },
  rechazado: { texto: "Rechazado", tono: "rojo-oscuro", descripcion: "Dijo que no va a pagar." },
  pagado: { texto: "Pagado", tono: "verde", descripcion: "El recibo está pagado." },
  excluido: { texto: "Excluido", tono: "gris", descripcion: "No entra al agente por las reglas de la configuración." },
  sin_datos: { texto: "Sin datos", tono: "ambar", descripcion: "No tiene teléfono ni email." },
};

export const EVENTO_INFO: Record<TipoEventoCobranza, { texto: string; tono: Tono }> = {
  llamada_buzon: { texto: "Llamada a buzón", tono: "gris" },
  sin_respuesta: { texto: "Sin respuesta", tono: "gris" },
  llamada_pendiente: { texto: "Llamada para vos", tono: "ambar" },
  whatsapp_enviado: { texto: "WhatsApp enviado", tono: "verde" },
  whatsapp_respondido: { texto: "WhatsApp respondido", tono: "azul" },
  email_enviado: { texto: "Email enviado", tono: "verde" },
  email_respondido: { texto: "Email respondido", tono: "azul" },
  para_aprobar: { texto: "Para aprobar", tono: "ambar" },
  promesa: { texto: "Promesa de pago", tono: "ambar" },
  informo_pago: { texto: "Informó pago", tono: "teal" },
  respondio: { texto: "Consulta", tono: "azul" },
  rechazo: { texto: "Rechazó pagar", tono: "rojo-oscuro" },
  baja: { texto: "Pidió la baja", tono: "gris" },
  escalado: { texto: "Escalado / notificado", tono: "violeta" },
  correo_fallido: { texto: "Correo fallido", tono: "rojo" },
  error: { texto: "Error", tono: "rojo" },
  pagado: { texto: "Pagado", tono: "verde" },
  reactivado: { texto: "Reactivado", tono: "gris" },
  excluido: { texto: "Excluido", tono: "gris" },
  validador: { texto: "Desde el Validador", tono: "violeta" },
  nota: { texto: "Nota", tono: "gris" },
};

/** Los que el agente sigue (KPI "Activos"): ni pagados, ni excluidos, ni sin datos. */
export const EN_GESTION: EstadoCaso[] = ["pendiente", "sin_respuesta", "respondio", "promesa", "informo_pago", "escalado", "rechazado"];
/** Los que esperan algo del productor (contador del menú). */
export const REQUIEREN_ATENCION: EstadoCaso[] = ["respondio", "informo_pago", "escalado", "rechazado"];
/** A los que el agente puede escribirles (después pasan las reglas de src/lib/cobranza/reglas.ts). */
export const CONTACTABLES: EstadoCaso[] = ["pendiente", "sin_respuesta", "promesa"];
/** "Reactivar recibo" vuelve estos a la gestión. */
export const REACTIVABLES: EstadoCaso[] = ["escalado", "rechazado", "excluido", "respondio", "informo_pago", "sin_respuesta"];

export const enGestion = (estado: EstadoCaso) => EN_GESTION.includes(estado);

export type Pestana = "activos" | "sin_datos" | "excluidos" | "aprobar";

export const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "activos", texto: "Activos" },
  { id: "sin_datos", texto: "Sin datos de contacto" },
  { id: "excluidos", texto: "Excluidas por reglas" },
  { id: "aprobar", texto: "Para aprobar" },
];

/** Activos muestra lo que está en gestión y lo pagado en el mes (el KPI "Pagados (mes)"). */
export function pestanaDe(caso: { estado: EstadoCaso; pagadoEl: Date | null }, mes: string, zonaDia: (d: Date) => string): Exclude<Pestana, "aprobar"> | null {
  if (caso.estado === "sin_datos") return "sin_datos";
  if (caso.estado === "excluido") return "excluidos";
  if (caso.estado === "pagado") return caso.pagadoEl && zonaDia(caso.pagadoEl).startsWith(mes) ? "activos" : null;
  return "activos";
}

export type Totales = { cantidad: number; ars: number; usd: number };
const vacio = (): Totales => ({ cantidad: 0, ars: 0, usd: 0 });
function sumar(t: Totales, monto: number, moneda: string) {
  t.cantidad++;
  if (moneda === "USD") t.usd += monto;
  else t.ars += monto;
}

export type CasoParaKpis = {
  estado: EstadoCaso;
  monto: number;
  moneda: string;
  ultimoContactoEl: Date | null;
  pagadoEl: Date | null;
  /** Lo calcula el motor: el agente le escribiría hoy. */
  aContactarHoy: boolean;
};

/** Los 5 KPIs del tablero. `dia` pasa un instante al día local (AAAA-MM-DD). */
export function kpisCobranza(casos: CasoParaKpis[], hoy: string, dia: (d: Date) => string) {
  const k = { activos: vacio(), hoy: { ...vacio(), contactados: 0, porContactar: 0 }, promesas: vacio(), escalados: vacio(), pagadosMes: vacio() };
  const mes = hoy.slice(0, 7);
  for (const c of casos) {
    const monto = Math.round(c.monto * 100) / 100;
    if (enGestion(c.estado)) sumar(k.activos, monto, c.moneda);
    if (c.estado === "promesa") sumar(k.promesas, monto, c.moneda);
    if (c.estado === "escalado" || c.estado === "rechazado") sumar(k.escalados, monto, c.moneda);
    if (c.estado === "pagado" && c.pagadoEl && dia(c.pagadoEl).startsWith(mes)) sumar(k.pagadosMes, monto, c.moneda);
    const contactadoHoy = Boolean(c.ultimoContactoEl && dia(c.ultimoContactoEl) === hoy);
    if (contactadoHoy) k.hoy.contactados++;
    else if (c.aContactarHoy) k.hoy.porContactar++;
    if (contactadoHoy || c.aContactarHoy) sumar(k.hoy, monto, c.moneda);
  }
  for (const t of [k.activos, k.hoy, k.promesas, k.escalados, k.pagadosMes]) {
    t.ars = Math.round(t.ars * 100) / 100;
    t.usd = Math.round(t.usd * 100) / 100;
  }
  return k;
}

/** Columna Vencimiento: "hace 27d", "hoy", "en 15d". */
export function vencimientoRelativo(dias: number): string {
  if (dias === 0) return "hoy";
  return dias < 0 ? `hace ${-dias}d` : `en ${dias}d`;
}

/** Chip del encabezado del caso: "Vencido hace 11 días", "Vence hoy", "Vence en 3 días". */
export function chipVencimiento(dias: number): { texto: string; tono: Tono } {
  const n = (d: number) => (d === 1 ? "1 día" : `${d} días`);
  if (dias < 0) return { texto: `Vencido hace ${n(-dias)}`, tono: "rojo" };
  if (dias === 0) return { texto: "Vence hoy", tono: "ambar" };
  return { texto: `Vence en ${n(dias)}`, tono: dias <= 5 ? "ambar" : "gris" };
}

/** Columna Intentos: "3 intentos" y "Últ. contacto hoy" / "hace 10d" / "Sin contactos". */
export function textoIntentos(intentos: number, ultimo: Date | null, hoy: string, dia: (d: Date) => string) {
  const cantidad = intentos === 1 ? "1 intento" : `${intentos} intentos`;
  if (!ultimo) return { cantidad, ultimo: "Sin contactos" };
  const hace = diasEntre(dia(ultimo), hoy);
  return { cantidad, ultimo: hace <= 0 ? "Últ. contacto hoy" : hace === 1 ? "Últ. contacto ayer" : `Últ. contacto hace ${hace}d` };
}
