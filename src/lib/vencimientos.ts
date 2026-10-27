import { diaYMes, diasEntre, sumarDias } from "./fechas";

// Vencimientos agrupados por semana (de lunes a domingo).

/** Lunes de la semana de una fecha AAAA-MM-DD. */
export function lunesDe(iso: string): string {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 domingo
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia);
}

export type SemanaVencimientos<T> = { desde: string; hasta: string; titulo: string; items: (T & { dias: number })[] };

export function agruparPorSemana<T extends { vence: string }>(items: T[], hoy: string, dias: number): SemanaVencimientos<T>[] {
  const limite = sumarDias(hoy, dias);
  const esteLunes = lunesDe(hoy);
  const semanas = new Map<string, (T & { dias: number })[]>();
  for (const item of items) {
    if (item.vence < hoy || item.vence > limite) continue;
    const lunes = lunesDe(item.vence);
    semanas.set(lunes, [...(semanas.get(lunes) ?? []), { ...item, dias: diasEntre(hoy, item.vence) }]);
  }
  return [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([desde, lista]) => {
      const hasta = sumarDias(desde, 6);
      const titulo =
        desde === esteLunes
          ? "Esta semana"
          : desde === sumarDias(esteLunes, 7)
            ? "La semana que viene"
            : `Semana del ${diaYMes(desde)} al ${diaYMes(hasta)}`;
      return { desde, hasta, titulo, items: lista.sort((a, b) => a.vence.localeCompare(b.vence)) };
    });
}
