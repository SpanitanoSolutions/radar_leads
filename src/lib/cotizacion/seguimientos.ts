import { interpretarEstrategiaSeguimiento, sumarDiasHabiles } from "@/lib/cotizacion";
import { diaEnArgentina, sumarDias } from "@/lib/fechas";

/** Feriados inamovibles de fecha fija (Ley 27.399, art. 1). Carnaval y Viernes Santo se calculan aparte. */
const INAMOVIBLES = ["01-01", "03-24", "04-02", "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"];

/** Feriados trasladables (Ley 27.399, art. 1): Güemes, San Martín, Diversidad Cultural y Soberanía Nacional. */
const TRASLADABLES = ["06-17", "08-17", "10-12", "11-20"];

/**
 * Lo que fija el Gobierno cada año y no sale de una regla:
 * - los días no laborables con fines turísticos o "puente" (Ley 27.399, art. 7);
 * - los trasladables que caen sábado o domingo y la Jefatura de Gabinete decide mover (Decreto 614/2025);
 * - los feriados extraordinarios.
 * Hay que sumar cada año apenas se publique en el Boletín Oficial. Los puente suelen salir en
 * noviembre o diciembre del año anterior; los de 2027 todavía no salieron (30/10/2026).
 */
export const DIAS_NO_HABILES_POR_ANIO: Record<number, string[]> = {
  // Decreto 106/2023.
  2024: ["2024-04-01", "2024-06-21", "2024-10-11"],
  // Decreto 1027/2024 (puente) y Resolución 139/2025 de la Jefatura de Gabinete (el 12 de octubre, domingo, pasó al viernes 10).
  2025: ["2025-05-02", "2025-08-15", "2025-10-10", "2025-11-21"],
  // Resolución 164/2025 de la Jefatura de Gabinete (puente) y Decreto 1103/2026 (lunes 9 de noviembre, visita del papa León XIV).
  2026: ["2026-03-23", "2026-07-10", "2026-11-09", "2026-12-07"],
};

/**
 * Ley 27.399, art. 6: un trasladable que cae martes o miércoles pasa al lunes anterior, y uno que
 * cae jueves o viernes, al lunes siguiente. Si cae sábado, domingo o lunes queda donde está.
 */
export function trasladarFeriado(fecha: string): string {
  const semana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const corrimiento = { 2: -1, 3: -2, 4: 4, 5: 3 }[semana] ?? 0;
  return sumarDias(fecha, corrimiento);
}

/** Lunes y martes de Carnaval y Viernes Santo, a partir de la fecha de Pascua. */
function feriadosDePascua(anio: number): string[] {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascua = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return [-48, -47, -2].map((diferencia) => sumarDias(pascua, diferencia));
}

/** Días no hábiles nacionales del año: feriados inamovibles y trasladables ya movidos, Carnaval, Viernes Santo y lo que fijó el Gobierno. */
export function feriadosNacionalesArgentina(anio: number): string[] {
  return [...new Set([
    ...INAMOVIBLES.map((dia) => `${anio}-${dia}`),
    ...TRASLADABLES.map((dia) => trasladarFeriado(`${anio}-${dia}`)),
    ...feriadosDePascua(anio),
    ...(DIAS_NO_HABILES_POR_ANIO[anio] ?? []),
  ])].sort();
}

/**
 * Próximo seguimiento según la estrategia. Se cuenta desde el día en Argentina (no desde la fecha
 * en UTC, que entre las 21 y las 24 ya es el día siguiente) y se guarda al comienzo de ese día, para
 * que lo tome el cron de esa mañana (corre a las 10 de Argentina). Sin `feriados`, usa los nacionales
 * del año y del siguiente, por si el plazo cruza el 1 de enero.
 */
export function calcularProximoSeguimiento(ultimaActividad: Date, ramo: string, textoReglas: string, feriados?: string[]): Date | null {
  const reglas = interpretarEstrategiaSeguimiento(textoReglas);
  if (!reglas) return null;
  const ramoNormalizado = ramo.trim().toLocaleLowerCase("es-AR");
  const dias = Object.entries(reglas.porRamo).find(([nombre]) => nombre.toLocaleLowerCase("es-AR") === ramoNormalizado)?.[1]
    ?? reglas.intervaloDiasHabiles;
  const hoy = diaEnArgentina(ultimaActividad);
  const anio = Number(hoy.slice(0, 4));
  const siguiente = sumarDiasHabiles(hoy, dias, feriados ?? [...feriadosNacionalesArgentina(anio), ...feriadosNacionalesArgentina(anio + 1)]);
  return new Date(`${siguiente}T00:00:00-03:00`);
}
