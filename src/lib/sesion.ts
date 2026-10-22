/**
 * Sesión simple firmada con HMAC. Solo usa Web Crypto para poder correr
 * también en el proxy. Token: "<vencimiento-ms>.<firma>".
 */
export const COOKIE_SESION = "radar_sesion";
export const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function firmar(secreto: string, dato: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", clave, encoder.encode(dato)));
}

/** Comparación en tiempo constante para strings de igual largo. */
export function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secreto(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET falta o es muy corto (mínimo 32 caracteres)");
  }
  return s;
}

export async function crearToken(ahora: number = Date.now()): Promise<string> {
  const vence = String(ahora + DURACION_SESION_MS);
  return `${vence}.${await firmar(secreto(), vence)}`;
}

export async function tokenValido(
  token: string | undefined,
  ahora: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const [vence, firma] = token.split(".");
  if (!vence || !firma || !/^\d+$/.test(vence)) return false;
  if (Number(vence) < ahora) return false;
  return igualesSeguro(firma, await firmar(secreto(), vence));
}

/** Compara la contraseña ingresada con APP_PASSWORD sin filtrar su largo. */
export async function claveCorrecta(ingresada: string): Promise<boolean> {
  const esperada = process.env.APP_PASSWORD;
  if (!esperada) throw new Error("Falta la variable de entorno APP_PASSWORD");
  const s = secreto();
  return igualesSeguro(await firmar(s, ingresada), await firmar(s, esperada));
}
