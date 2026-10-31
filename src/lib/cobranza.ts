import { diaDeLaSemana, diaYMes, diasEntre } from "./fechas";

// Los mensajes de Cobranza que esperan aprobación ("Para aprobar"): de qué
// cobro son, de qué tipo y cómo se rotulan. El resto de Cobranza v2 está en
// src/lib/cobranza/.

/** Pasos de la secuencia de la v1: quedan para los pedidos del Validador (recordatorio, vence hoy, vencida). */
export type Paso = 1 | 2 | 3 | 4 | 5;

/**
 * Qué espera aprobación: un aviso del Validador (paso), un pedido puntual del
 * Validador, un mensaje del agente o una llamada que el agente le deja al productor.
 */
export type Pendiente = Paso | "diferencia" | "comprobante" | "recibo" | "agente" | "llamada";

const REFERENCIA = /^cuota:(\d+):(?:paso:([1-5])|(diferencia|comprobante|recibo|agente|llamada))$/;

/** "cuota:12:paso:2" → { cuotaId: 12, tipo: 2 }; "cuota:12:agente" → { cuotaId: 12, tipo: "agente" }. */
export function leerReferencia(referencia: string | null): { cuotaId: number; tipo: Pendiente } | null {
  const m = REFERENCIA.exec(referencia ?? "");
  if (!m) return null;
  return { cuotaId: Number(m[1]), tipo: m[2] ? (Number(m[2]) as Paso) : (m[3] as Pendiente) };
}

export function referenciaDe(cuotaId: number, tipo: Pendiente): string {
  return typeof tipo === "number" ? `cuota:${cuotaId}:paso:${tipo}` : `cuota:${cuotaId}:${tipo}`;
}

/** Si al salir cuenta como un intento de cobranza (los pedidos puntuales del Validador, no). */
export function cuentaComoIntento(tipo: Pendiente): boolean {
  return typeof tipo === "number" || tipo === "agente" || tipo === "llamada";
}

/** Pastilla de cada tarjeta para aprobar: "Paso 2 · Vence en 2 días", "Pago incompleto". */
export function etiquetaPendiente(tipo: Pendiente, vencimiento: string, hoy: string): { texto: string; tono: "aviso" | "vencida" | "llamada" | "problema" } {
  if (tipo === "diferencia") return { texto: "Pago incompleto", tono: "problema" };
  if (tipo === "comprobante") return { texto: "Comprobante con problemas", tono: "problema" };
  if (tipo === "recibo") return { texto: "Recibo de pago", tono: "aviso" };
  const dias = diasEntre(hoy, vencimiento);
  const cuando =
    dias > 0 ? `Vence en ${dias === 1 ? "1 día" : `${dias} días`}` : dias === 0 ? "Vence hoy" : `Vencida hace ${-dias === 1 ? "1 día" : `${-dias} días`}`;
  if (tipo === "llamada") return { texto: `Llamada · ${cuando}`, tono: "llamada" };
  const quien = tipo === "agente" ? "Agente" : `Paso ${tipo}`;
  return { texto: `${quien} · ${cuando}`, tono: tipo === 4 ? "llamada" : dias < 0 ? "vencida" : "aviso" };
}

/** "vence el jueves 29/10", "vence hoy", "venció el 22/10". */
export function textoVencimiento(vencimiento: string, hoy: string): string {
  const dias = diasEntre(hoy, vencimiento);
  if (dias === 0) return "vence hoy";
  if (dias < 0) return `venció el ${diaYMes(vencimiento)}`;
  return dias <= 6 ? `vence el ${diaDeLaSemana(vencimiento)}` : `vence el ${diaYMes(vencimiento)}`;
}
