import { sumarDias } from "@/lib/fechas";
import type { TipoRespuesta } from "./herramientas";

// Respuestas de los asegurados (WhatsApp o correo): de quién son y, sin IA,
// qué dicen. Con IA lo decide el agente con cobranza_registrar_respuesta.

/** Los últimos 10 dígitos: "+54 9 223 512-0087" y "223 512-0087" son el mismo número. */
export function claveTelefono(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-10) : null;
}

export function claveCorreo(correo: string | null | undefined): string | null {
  const m = /[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/.exec(correo ?? "");
  return m ? m[0].toLowerCase() : null;
}

/** "Ref. C-123" en el texto o el asunto: el caso al que responde. */
export function referenciaCaso(...textos: (string | null | undefined)[]): number | null {
  for (const t of textos) {
    const m = /\bC-(\d{1,9})\b/.exec(t ?? "");
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Sin IA, una lectura prudente: la baja y "ya pagué" se reconocen; una promesa
 * solo con "mañana" (la única fecha segura); todo lo demás es una consulta
 * para el productor.
 */
export function clasificarSinIA(texto: string, hoy: string): { tipo: TipoRespuesta; fecha?: string } {
  const t = texto.toLowerCase();
  if (/no (me )?(escrib|mand|contact|molest)|(dar(me)?|darme) de baja (de )?(los )?mensajes|basta de mensajes|\bstop\b|no quiero (recibir|que me)/.test(t)) return { tipo: "baja" };
  if (/no (voy a|pienso) pagar|no (lo |la )?pago m[aá]s|no tengo intenci[oó]n de pagar/.test(t)) return { tipo: "rechazo" };
  if (/ya (lo |la |las |los )?(pagu[eé]|abon[eé]|transfer[ií]|deposit[eé])|ya (est[aá]|qued[oó]) pag|te mand[eé] el comprobante/.test(t)) return { tipo: "ya_pago" };
  if (/\bma[ñn]ana (lo |la )?(pago|abono|transfiero|deposito)|(pago|abono|transfiero|deposito) (lo |la )?ma[ñn]ana/.test(t)) return { tipo: "promesa_pago", fecha: sumarDias(hoy, 1) };
  return { tipo: "respondio" };
}
