import { createHash, randomBytes } from "node:crypto";

// Claves de la API (/api/v1). La clave se muestra una sola vez; en la base
// queda el hash y el prefijo para reconocerla.

export const PREFIJO_CLAVE = "uniqo_";

export function generarClave(): { clave: string; prefijo: string; hash: string } {
  const clave = `${PREFIJO_CLAVE}${randomBytes(32).toString("base64url")}`;
  return { clave, prefijo: clave.slice(0, PREFIJO_CLAVE.length + 6), hash: hashClave(clave) };
}

export function hashClave(clave: string): string {
  return createHash("sha256").update(clave, "utf8").digest("hex");
}

/** "Bearer uniqo_…" → la clave, o null si el encabezado no tiene una con el formato de UNIQO. */
export function claveDelEncabezado(encabezado: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(encabezado?.trim() ?? "");
  return m && m[1].startsWith(PREFIJO_CLAVE) && m[1].length > PREFIJO_CLAVE.length + 20 ? m[1] : null;
}

export type ErrorApi = { status: 400 | 401 | 403 | 404 | 409 | 500; codigo: string; mensaje: string };

/** Página y tamaño de la lista: página desde 1, hasta 100 por página. */
export function leerPaginacion(params: URLSearchParams): { pagina: number; porPagina: number } {
  const pagina = Math.max(1, Math.floor(Number(params.get("pagina")) || 1));
  const porPagina = Math.min(100, Math.max(1, Math.floor(Number(params.get("porPagina")) || 50)));
  return { pagina, porPagina };
}
