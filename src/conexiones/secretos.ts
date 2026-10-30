import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guardarConexion, leerConexion } from "./estado";

export type CredencialesOAuth = {
  accessToken: string;
  refreshToken?: string;
  venceEl?: number;
};

function claveCifrado() {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 32) throw new Error("Falta configurar SESSION_SECRET para cifrar credenciales.");
  return createHash("sha256").update(`uniqo-integraciones:${secreto}`).digest();
}

export function cifrarSecreto(valor: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", claveCifrado(), iv);
  const cifrado = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), cifrado].map((parte) => parte.toString("base64url")).join(".");
}

export function descifrarSecreto(valor: string): string {
  const partes = valor.split(".");
  if (partes.length !== 3 || partes.some((parte) => !parte)) throw new Error("La credencial guardada no se puede leer.");
  const [iv, tag, contenido] = partes.map((parte) => Buffer.from(parte, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("La credencial guardada no se puede leer.");
  const decipher = createDecipheriv("aes-256-gcm", claveCifrado(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(contenido), decipher.final()]).toString("utf8");
}

export async function guardarCredenciales(clave: string, credenciales: CredencialesOAuth, datos: Record<string, string | boolean | number | null> = {}) {
  await guardarConexion(clave, "conectado", {
    ...datos,
    credencialesCifradas: cifrarSecreto(JSON.stringify(credenciales)),
  });
}

export async function leerCredenciales(clave: string): Promise<CredencialesOAuth | null> {
  const fila = await leerConexion(clave);
  const cifrado = fila?.datos.credencialesCifradas;
  if (typeof cifrado !== "string") return null;
  return JSON.parse(descifrarSecreto(cifrado)) as CredencialesOAuth;
}

export async function borrarCredenciales(clave: string) {
  const fila = await leerConexion(clave);
  if (!fila) return;
  await db.delete(schema.conexiones).where(eq(schema.conexiones.clave, clave));
}

/** El token de acceso, renovado si venció. Con `renovar`, lo renueva aunque no haya vencido (el proveedor lo rechazó). */
export async function tokenVigente(clave: string, proveedor: "google" | "mercadopago", renovar = false): Promise<string> {
  const actual = await leerCredenciales(clave);
  if (!actual) throw new Error("La cuenta no autorizó el acceso. Volvé a conectarla.");
  if (!renovar && (!actual.venceEl || actual.venceEl > Date.now() + 60_000)) return actual.accessToken;
  if (!actual.refreshToken) throw new Error("La autorización venció. Volvé a conectar la cuenta.");

  const google = proveedor === "google";
  const clientId = process.env[google ? "GOOGLE_CLIENT_ID" : "MERCADOPAGO_CLIENT_ID"];
  const clientSecret = process.env[google ? "GOOGLE_CLIENT_SECRET" : "MERCADOPAGO_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error(`Falta configurar las credenciales OAuth de ${google ? "Google" : "Mercado Pago"}.`);

  const parametros = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: actual.refreshToken,
    grant_type: "refresh_token",
  };
  const respuesta = await fetch(google ? "https://oauth2.googleapis.com/token" : "https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": google ? "application/x-www-form-urlencoded" : "application/json" },
    body: google ? new URLSearchParams(parametros) : JSON.stringify(parametros),
    signal: AbortSignal.timeout(20_000),
  });
  const cuerpo = (await respuesta.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (cuerpo.error === "invalid_grant") {
    // La autorización se revocó o venció: no se recupera sola. La pantalla
    // de Configuración lo muestra y pide volver a autorizar.
    const error = `${google ? "Google" : "Mercado Pago"} ya no acepta la autorización de esta cuenta. Volvé a autorizarla.`;
    await guardarConexion(clave, "en_proceso", { ...(await datosSinCredenciales(clave)), error });
    throw new Error(error);
  }
  if (!respuesta.ok || !cuerpo.access_token) throw new Error("El proveedor rechazó renovar la autorización. Volvé a conectar la cuenta.");
  const renovada: CredencialesOAuth = {
    accessToken: cuerpo.access_token,
    refreshToken: cuerpo.refresh_token ?? actual.refreshToken,
    venceEl: cuerpo.expires_in ? Date.now() + cuerpo.expires_in * 1000 : undefined,
  };
  await guardarCredenciales(clave, renovada, await datosSinCredenciales(clave));
  return renovada.accessToken;
}

async function datosSinCredenciales(clave: string) {
  const fila = await leerConexion(clave);
  return Object.fromEntries(
    Object.entries(fila?.datos ?? {}).filter(([nombre]) => nombre !== "credencialesCifradas" && nombre !== "error"),
  ) as Record<string, string | boolean | number | null>;
}
