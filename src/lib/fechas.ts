const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/** Fecha calendario (AAAA-MM-DD) en hora argentina. */
export function diaEnArgentina(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** Días calendario de una fecha AAAA-MM-DD a otra (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** "Hoy", "Ayer", "Hace 3 días"… contando días calendario en Argentina. */
export function haceCuanto(fecha: Date, ahora: Date = new Date()): string {
  const dias = diasEntre(diaEnArgentina(fecha), diaEnArgentina(ahora));
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 30) return `Hace ${dias} días`;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    day: "numeric",
    month: "short",
  }).format(fecha);
}

/** "jueves 22 de octubre" en hora argentina. */
export function fechaLarga(fecha: Date = new Date()): string {
  const texto = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-10-22" + 7 → "2026-10-29". */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + dias));
  return d.toISOString().slice(0, 10);
}

/** "2026-10-29" → "29/10". */
export function diaYMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "2026-11-05" → "05/11/2026". */
export function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Fecha y hora en Argentina: "27/10 10:14". */
export function diaYHora(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`;
}

/** "jueves 29/10". */
export function diaDeLaSemana(iso: string): string {
  const nombre = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][
    new Date(`${iso}T12:00:00Z`).getUTCDay()
  ];
  return `${nombre} ${diaYMes(iso)}`;
}
