import "server-only";
import { createCipheriv, randomBytes } from "node:crypto";

/** Cifra un secreto con AES-256-GCM. La clave debe ser base64 de 32 bytes. */
export function cifrarCredencial(valor: string, claveBase64: string | undefined): string {
  if (!claveBase64) throw new Error("Falta COTIZACION_CREDENTIALS_KEY.");
  const clave = Buffer.from(claveBase64, "base64");
  if (clave.length !== 32) throw new Error("COTIZACION_CREDENTIALS_KEY debe contener 32 bytes en base64.");
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  const cifrado = Buffer.concat([cifrador.update(valor, "utf8"), cifrador.final()]);
  return [iv, cifrador.getAuthTag(), cifrado].map((parte) => parte.toString("base64url")).join(".");
}
