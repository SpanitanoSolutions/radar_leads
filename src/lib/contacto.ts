// Teléfonos argentinos: para el botón "Llamar" (tel:) y para saber si se puede
// escribir por WhatsApp (wa.me), que solo tiene sentido con un celular.

/** Número para un enlace tel:, sin espacios ni guiones. */
export function enlaceTelefono(numero: string): string {
  return `tel:${numero.replace(/[^\d+]/g, "")}`;
}

/**
 * Número internacional de WhatsApp (549 + característica + número) si el
 * teléfono es un celular argentino; si no, null.
 * Acepta "+54 9 223 555-1234" y el formato local "(0223) 15-555-1234".
 */
export function numeroWhatsApp(numero: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  // Internacional: 54 9 + 10 dígitos.
  if (/^549\d{10}$/.test(digitos) && numero.trim().startsWith("+")) return digitos;
  // Local: (0)característica + 15 + número; característica + número = 10 dígitos.
  const m = /^\(?0?(\d{2,4})\)?[\s.-]*15[\s.-]*([\d\s.-]{6,9})$/.exec(numero.trim());
  if (m) {
    const nacional = m[1] + m[2].replace(/\D/g, "");
    if (nacional.length === 10) return `549${nacional}`;
  }
  return null;
}

/** Enlace wa.me con el mensaje ya escrito, o null si no es un celular. */
export function enlaceWhatsApp(numero: string, mensaje?: string): string | null {
  const wa = numeroWhatsApp(numero);
  if (!wa) return null;
  return `https://wa.me/${wa}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
}

/** Búsqueda en Google para encontrar el contacto a mano. */
export function busquedaManual(empresa: string, localidad: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${empresa}" ${localidad} teléfono`)}`;
}

/** Score que pierde un lead del que no se encontró forma de contacto. */
export const PENALIZACION_SIN_CONTACTO = -10;

/** Se buscó en Google Maps sin coincidencia y tampoco hay teléfono por otra vía. */
export function sinContacto(lead: { contactoEstado: string | null; telefono: string | null }): boolean {
  return lead.contactoEstado === "sin-resultado" && !lead.telefono;
}

/** "https://www.empresa.com.ar/contacto" → "empresa.com.ar"; si no es una URL, el texto tal cual. */
export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
