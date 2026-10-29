import type { Poliza } from "@/db/schema";
import { esVigente } from "./asegurados";
import { diaEnArgentina, diaYMes, diasEntre, sumarDias } from "./fechas";
import { companiaCanonica } from "./importacion";
import { ramoCanonico } from "./ramos";

// Vencimientos agrupados por semana (de lunes a domingo). Los usan
// /vencimientos y la pestaña Renovaciones del Validador.

/** Las pólizas vigentes con fecha de fin, cada una con su asegurado. */
export function polizasPorVencer<A extends { polizas: Pick<Poliza, "vigenciaHasta" | "bajaEl">[] }>(
  asegurados: A[],
  hoy: string,
): { vence: string; poliza: A["polizas"][number]; asegurado: A }[] {
  return asegurados.flatMap((a) =>
    a.polizas.filter((p) => p.vigenciaHasta && esVigente(p, hoy)).map((p) => ({ vence: p.vigenciaHasta!, poliza: p, asegurado: a })),
  );
}

/** Días de diferencia aceptados entre el fin de una vigencia y el comienzo de la que la renueva. */
const MARGEN_RENOVACION = 5;

type PolizaRenovable = Pick<Poliza, "id" | "aseguradoId" | "ramo" | "compania" | "vigenciaDesde" | "vigenciaHasta" | "bajaEl" | "creadoEl">;

/**
 * Las pólizas vigentes que se renovaron en los últimos `dias` días: su
 * vigencia empezó en ese plazo y continúa otra. Puede ser otra póliza del
 * mismo asegurado, ramo y compañía que terminó ese día (con unos días de
 * margen), o la misma póliza con la vigencia corrida por una reimportación:
 * se creó en UNIQO antes de que empezara su vigencia actual. `polizas` tiene
 * que incluir las dadas de baja, que pueden ser la vigencia anterior.
 */
export function polizasRenovadas<P extends PolizaRenovable>(polizas: P[], hoy: string, dias: number): P[] {
  const desde = sumarDias(hoy, -dias);
  const clave = (p: PolizaRenovable) => `${p.aseguradoId}|${ramoCanonico(p.ramo)}|${companiaCanonica(p.compania ?? "")}`;
  const porClave = new Map<string, P[]>();
  for (const p of polizas) porClave.set(clave(p), [...(porClave.get(clave(p)) ?? []), p]);
  return polizas.filter((p) => {
    const inicio = p.vigenciaDesde;
    if (!inicio || inicio < desde || inicio > hoy || !esVigente(p, hoy)) return false;
    if (diaEnArgentina(p.creadoEl) < inicio) return true;
    return (porClave.get(clave(p)) ?? []).some(
      (q) => q.id !== p.id && q.vigenciaHasta !== null && (q.vigenciaDesde ?? "") < inicio && Math.abs(diasEntre(q.vigenciaHasta, inicio)) <= MARGEN_RENOVACION,
    );
  });
}

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
