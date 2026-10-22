import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron manda "Authorization: Bearer <CRON_SECRET>". Sin secreto
 * configurado no se autoriza nada. La comparación no revela por tiempo
 * cuántos caracteres coinciden.
 */
export function cronAutorizado(encabezado: string | null, secreto: string | undefined): boolean {
  if (!secreto || !encabezado) return false;
  const resumen = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(resumen(encabezado), resumen(`Bearer ${secreto}`));
}
