import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado de secretos (credenciales de portales) con AES-256-GCM y una clave
// de entorno de 32 bytes en base64. El resultado es "iv.tag.contenido" en
// base64url. Los mensajes de error nunca incluyen el secreto ni la clave.

/** La clave de las credenciales de portales. Si falta, sirve la que ya usaba Cotización. */
export function claveCredenciales(entorno: Record<string, string | undefined> = process.env): { clave: string | undefined; nombre: string } {
  if (entorno.CREDENCIALES_PORTAL_KEY) return { clave: entorno.CREDENCIALES_PORTAL_KEY, nombre: "CREDENCIALES_PORTAL_KEY" };
  if (entorno.COTIZACION_CREDENTIALS_KEY) return { clave: entorno.COTIZACION_CREDENTIALS_KEY, nombre: "COTIZACION_CREDENTIALS_KEY" };
  return { clave: undefined, nombre: "CREDENCIALES_PORTAL_KEY" };
}

function leerClave(claveBase64: string | undefined, nombre: string): Buffer {
  if (!claveBase64) throw new Error(`Falta ${nombre}.`);
  const clave = Buffer.from(claveBase64, "base64");
  if (clave.length !== 32) throw new Error(`${nombre} debe contener 32 bytes en base64.`);
  return clave;
}

export function cifrar(valor: string, claveBase64: string | undefined, nombreClave = "CREDENCIALES_PORTAL_KEY"): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", leerClave(claveBase64, nombreClave), iv);
  const cifrado = Buffer.concat([cifrador.update(valor, "utf8"), cifrador.final()]);
  return [iv, cifrador.getAuthTag(), cifrado].map((parte) => parte.toString("base64url")).join(".");
}

/** Falla si el texto fue alterado o la clave no es la misma con la que se cifró. */
export function descifrar(cifrado: string, claveBase64: string | undefined, nombreClave = "CREDENCIALES_PORTAL_KEY"): string {
  const clave = leerClave(claveBase64, nombreClave);
  const partes = cifrado.split(".");
  if (partes.length !== 3 || partes.some((parte) => !parte)) throw new Error("La credencial guardada no se puede leer.");
  const [iv, tag, contenido] = partes.map((parte) => Buffer.from(parte, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("La credencial guardada no se puede leer.");
  try {
    const descifrador = createDecipheriv("aes-256-gcm", clave, iv);
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(contenido), descifrador.final()]).toString("utf8");
  } catch {
    throw new Error("La credencial guardada no se puede leer: cambió la clave o el dato está dañado.");
  }
}
