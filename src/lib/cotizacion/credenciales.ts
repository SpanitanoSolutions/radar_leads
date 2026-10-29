import "server-only";
import { cifrar } from "@/lib/cifrado";

/** Cifra un secreto con AES-256-GCM. La clave debe ser base64 de 32 bytes. */
export function cifrarCredencial(valor: string, claveBase64: string | undefined): string {
  return cifrar(valor, claveBase64, "COTIZACION_CREDENTIALS_KEY");
}
