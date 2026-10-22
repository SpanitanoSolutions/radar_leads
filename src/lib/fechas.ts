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

function diasEntre(desde: string, hasta: string): number {
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
