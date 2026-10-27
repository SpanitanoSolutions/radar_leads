import { sumarDias } from "./fechas";

// Cartera vista como una fila por póliza (la usa el resumen diario) y qué
// leads ya son clientes. La cartera tiene datos de personas: se usa solo
// dentro de la app, detrás del login.

export type Poliza = {
  cliente: string;
  cuit: string | null;
  ramos: string[];
  compania: string | null;
  vencimiento: string | null; // AAAA-MM-DD
};

/** Pólizas que vencen entre hoy y dentro de `dias` días, la más cercana primero. */
export function proximosVencimientos<T extends Poliza>(polizas: T[], hoy: string, dias: number): (T & { dias: number })[] {
  const limite = sumarDias(hoy, dias);
  const diasHasta = (fecha: string) =>
    Math.round(
      (Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) -
        Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))) /
        86_400_000,
    );
  return polizas
    .filter((p) => p.vencimiento && p.vencimiento >= hoy && p.vencimiento <= limite)
    .map((p) => ({ ...p, dias: diasHasta(p.vencimiento!) }))
    .sort((a, b) => a.dias - b.dias);
}

/** CUIT sin guiones de los clientes que tienen uno, para reconocerlos entre los leads. */
export function cuitsDeClientes(polizas: Pick<Poliza, "cuit">[]): Set<string> {
  return new Set(polizas.map((p) => p.cuit?.replace(/\D/g, "") ?? "").filter((c) => c.length === 11));
}

export function yaEsCliente(cuit: string | null, clientes: Set<string>): boolean {
  const digitos = cuit?.replace(/\D/g, "") ?? "";
  return digitos.length === 11 && clientes.has(digitos);
}
