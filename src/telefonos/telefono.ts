import { normalizar } from "@/fuentes/clasificacion";

// Reglas para buscar y aceptar el teléfono de una empresa. Solo vale el número
// que la propia empresa publica para que la contacten (web, perfil de Google,
// redes oficiales, guías comerciales): nunca teléfonos personales de socios o
// empleados (Ley 25.326) ni números sin una página que los respalde.

export type EmpresaABuscar = {
  empresa: string;
  cuit: string | null;
  localidad: string;
  rubro: string;
};

export type TelefonoEncontrado = {
  telefono: string;
  tipo: "comercial" | "general";
  fuenteUrl: string;
};

/** Una misma empresa puede tener varios leads (p. ej. varias licitaciones): se busca una sola vez. */
export function claveEmpresa(e: Pick<EmpresaABuscar, "empresa" | "cuit" | "localidad">): string {
  const cuit = (e.cuit ?? "").replace(/\D/g, "");
  if (cuit.length === 11) return `cuit:${cuit}`;
  return `nombre:${normalizar(e.empresa)}|${normalizar(e.localidad)}`;
}

/**
 * Teléfono limpio, o null si no parece un teléfono argentino: entre 8 y 13
 * dígitos y sin forma de CUIT ("30-71222454-8").
 */
export function limpiarTelefono(texto: string): string | null {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!/^\+?[\d\s()./-]+$/.test(t)) return null;
  if (/^\d{2}-\d{8}-\d$/.test(t)) return null;
  const digitos = t.replace(/\D/g, "").length;
  if (digitos < 8 || digitos > 13) return null;
  return t.replace(/\./g, " ").replace(/\s+/g, " ");
}

function esUrl(texto: string): boolean {
  try {
    const url = new URL(texto);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Lo que Claude registró con la herramienta `registrar_telefono`. Devuelve
 * null si no encontró nada o si el dato no se puede usar.
 */
export function interpretarRegistro(entrada: unknown): TelefonoEncontrado | null {
  if (!entrada || typeof entrada !== "object") return null;
  const { telefono, tipo, fuente_url: fuenteUrl } = entrada as Record<string, unknown>;
  if (tipo !== "comercial" && tipo !== "general") return null;
  if (typeof telefono !== "string" || typeof fuenteUrl !== "string" || !esUrl(fuenteUrl)) return null;
  const limpio = limpiarTelefono(telefono);
  return limpio ? { telefono: limpio, tipo, fuenteUrl } : null;
}

export const INSTRUCCIONES = `Buscás el teléfono de contacto de empresas argentinas para un productor asesor de seguros.

Reglas:
- Buscá el teléfono que la propia empresa publica para que la contacten: su sitio web, su perfil de Google o Maps, sus redes sociales oficiales o su ficha en una guía comercial.
- Preferí el teléfono del área comercial o de ventas. Si no hay, el teléfono general de la empresa.
- Nunca busques ni devuelvas teléfonos personales de socios, directivos o empleados, ni datos de sitios que listan personas.
- Antes de aceptar un número, verificá que la página corresponde a esa empresa: misma razón social o nombre comercial, y misma localidad o rubro. Ante la duda, no devuelvas número.
- Las empresas recién constituidas muchas veces no tienen teléfono publicado: en ese caso registrá "no_encontrado" sin insistir.
- Hacé como máximo tres búsquedas y al terminar llamá una sola vez a la herramienta registrar_telefono.`;

export function consultaTelefono(e: EmpresaABuscar): string {
  return [
    `Empresa: ${e.empresa}`,
    e.cuit ? `CUIT: ${e.cuit}` : null,
    `Localidad: ${e.localidad}, provincia de Buenos Aires`,
    `Rubro: ${e.rubro}`,
    "",
    "Encontrá su teléfono de contacto y registralo con registrar_telefono.",
  ]
    .filter((linea) => linea !== null)
    .join("\n");
}
