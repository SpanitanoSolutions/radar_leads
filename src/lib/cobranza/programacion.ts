import { sumarDias } from "@/lib/fechas";
import { enZona } from "@/lib/validador/programacion";
import { diaIso } from "./reglas";
import type { ConfiguracionCobranza } from "./tipos";

// Cuándo corre el agente por su cuenta. El plan de Vercel solo permite crons
// diarios: /api/cron/cobranza pasa una vez por día y corre si ese día está
// permitido, ya es la hora configurada y todavía no corrió por el cron.

/** Tienen que coincidir con /api/cron/cobranza en vercel.json ("0 13 * * *", las 10:00 de Argentina). */
export const PASADAS_CRON_UTC = ["13:00"];

export function tocaCorrer(config: Pick<ConfiguracionCobranza, "zonaHoraria" | "diasPermitidos" | "horaEjecucion">, ultimaCron: Date | null, ahora: Date): boolean {
  const local = enZona(ahora, config.zonaHoraria);
  if (!config.diasPermitidos.includes(diaIso(local.dia))) return false;
  if (local.hora < config.horaEjecucion) return false;
  return !ultimaCron || enZona(ultimaCron, config.zonaHoraria).dia !== local.dia;
}

/**
 * La próxima pasada del cron en que va a correr de verdad, o null si en dos
 * semanas no corre nunca (por ejemplo, una hora posterior a la pasada diaria,
 * o ningún día permitido).
 */
export function proximaPasada(
  config: Pick<ConfiguracionCobranza, "zonaHoraria" | "diasPermitidos" | "horaEjecucion">,
  ultimaCron: Date | null,
  ahora: Date,
  pasadas: string[] = PASADAS_CRON_UTC,
): Date | null {
  const hoy = ahora.toISOString().slice(0, 10);
  for (let d = 0; d <= 14; d++) {
    for (const hora of [...pasadas].sort()) {
      const pasada = new Date(`${sumarDias(hoy, d)}T${hora}:00Z`);
      if (pasada >= ahora && tocaCorrer(config, ultimaCron, pasada)) return pasada;
    }
  }
  return null;
}

/** La hora local de cada pasada del cron, para explicarla en la pantalla ("10:00"). */
export function pasadasLocales(zona: string, pasadas: string[] = PASADAS_CRON_UTC): string[] {
  return pasadas.map((h) => enZona(new Date(`2026-01-15T${h}:00Z`), zona).hora);
}
