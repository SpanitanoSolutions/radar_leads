import { finDeSemana, sumarDias } from "@/lib/fechas";
import { CONFIG_POR_DEFECTO, type ConfigValidador, type Frecuencia } from "./configuracion";

// Programación del Validador (Configuración → Programación): cuándo toca la
// validación y cuándo el enriquecimiento, en la zona horaria configurada.
// El cron puede pasar más seguido que la frecuencia: corre una vez por
// período, desde la hora configurada del primer día del período.

export type Etapa = "validacion" | "enriquecimiento";

type Local = { dia: string; hora: string };

function zonaValida(zona: string): string {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: zona });
    return zona;
  } catch {
    return CONFIG_POR_DEFECTO.zonaHoraria;
  }
}

/** Día (AAAA-MM-DD) y hora (HH:MM) de un instante en la zona horaria. */
export function enZona(fecha: Date, zona: string): Local {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zonaValida(zona), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

/** El instante en que en la zona horaria es ese día a esa hora. */
export function instanteEnZona(dia: string, hora: string, zona: string): Date {
  const [anio, mes, d] = dia.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  const supuesto = Date.UTC(anio, mes - 1, d, h, m);
  const local = enZona(new Date(supuesto), zona);
  const [la, lm, ld] = local.dia.split("-").map(Number);
  const [lh, lmi] = local.hora.split(":").map(Number);
  return new Date(supuesto - (Date.UTC(la, lm - 1, ld, lh, lmi) - supuesto));
}

/** Diaria: el mismo día. Semanal: el lunes. Mensual: el 1.º. */
export function inicioDelPeriodo(dia: string, frecuencia: Frecuencia): string {
  if (frecuencia === "semanal") return sumarDias(finDeSemana(dia), -6);
  if (frecuencia === "mensual") return `${dia.slice(0, 8)}01`;
  return dia;
}

function inicioDelSiguiente(inicio: string, frecuencia: Frecuencia): string {
  if (frecuencia === "semanal") return sumarDias(inicio, 7);
  if (frecuencia === "mensual") {
    const [anio, mes] = inicio.split("-").map(Number);
    return mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
  }
  return sumarDias(inicio, 1);
}

const horaDe = (config: ConfigValidador, etapa: Etapa) => (etapa === "validacion" ? config.horaEjecucion : config.horaEnriquecimiento);

/** Si `momento` ya pasó la hora programada del período que empieza en `inicio`. */
const desdeLaHora = (momento: Local, inicio: string, hora: string) => momento.dia > inicio || (momento.dia === inicio && momento.hora >= hora);

/**
 * Si toca correr la etapa ahora. `ultima` es la última vez que corrió por el
 * cron (las corridas a mano no cuentan). Si el cron no pasó a la hora, corre
 * en la próxima pasada del mismo período.
 */
export function tocaEjecutar(config: ConfigValidador, etapa: Etapa, ultima: Date | null, ahora: Date): boolean {
  const hora = horaDe(config, etapa);
  const local = enZona(ahora, config.zonaHoraria);
  const inicio = inicioDelPeriodo(local.dia, config.frecuencia);
  if (!desdeLaHora(local, inicio, hora)) return false;
  if (!ultima) return true;
  const antes = enZona(ultima, config.zonaHoraria);
  return !(antes.dia <= local.dia && desdeLaHora(antes, inicio, hora));
}

/** Cuándo vuelve a tocar: ahora mismo si está pendiente, o la hora del período siguiente. */
export function proximaEjecucion(config: ConfigValidador, etapa: Etapa, ultima: Date | null, ahora: Date): Date {
  if (tocaEjecutar(config, etapa, ultima, ahora)) return ahora;
  const hora = horaDe(config, etapa);
  const local = enZona(ahora, config.zonaHoraria);
  const inicio = inicioDelPeriodo(local.dia, config.frecuencia);
  const dia = desdeLaHora(local, inicio, hora) ? inicioDelSiguiente(inicio, config.frecuencia) : inicio;
  return instanteEnZona(dia, hora, config.zonaHoraria);
}
