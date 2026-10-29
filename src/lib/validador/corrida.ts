import type { ErrorCorridaValidador } from "@/db/schema";
import { sumarDias } from "@/lib/fechas";

// Una corrida del Validador (sección 6 de docs/specs/validador-v2.md): qué
// período se le pide a cada compañía, cómo terminó y el resumen para el
// productor. El resumen sin IA siempre existe; la IA solo lo mejora.

/** Desde una semana antes de la última corrida buena (o 60 días sin corridas) hasta dentro de un mes. */
export function periodoDeConsulta(hoy: string, ultimaBuena: string | null): { desde: string; hasta: string } {
  const desde = ultimaBuena ? sumarDias(ultimaBuena, -7) : sumarDias(hoy, -60);
  return { desde: desde < sumarDias(hoy, -60) ? sumarDias(hoy, -60) : desde, hasta: sumarDias(hoy, 31) };
}

export function estadoDeCorrida(errores: ErrorCorridaValidador[]): "ok" | "con_errores" {
  return errores.length ? "con_errores" : "ok";
}

export type DatosResumen = {
  companias: number;
  pagadas: number;
  canceladas: number;
  aRevisar: number;
  noIdentificados: number;
  porVencer: number;
  vencidas: number;
  errores: ErrorCorridaValidador[];
};

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** "Se revisaron 3 compañías: se confirmaron 39 pagos. 12 cuotas vencen esta semana…" */
export function resumenDeCorrida(d: DatosResumen): string {
  const partes: string[] = [];
  const hechos = [
    d.pagadas ? `se ${d.pagadas === 1 ? "confirmó 1 pago" : `confirmaron ${d.pagadas} pagos`}` : null,
    d.canceladas ? `se ${d.canceladas === 1 ? "canceló 1 cuota" : `cancelaron ${d.canceladas} cuotas`}` : null,
  ].filter(Boolean);
  const revisadas = d.companias ? `Se ${d.companias === 1 ? "revisó 1 compañía" : `revisaron ${d.companias} compañías`}` : "No había compañías para revisar";
  partes.push(`${revisadas}${hechos.length ? `: ${hechos.join(" y ")}` : d.companias ? ": no hubo pagos nuevos" : ""}.`);

  const agenda = [
    d.porVencer ? `${cuantos(d.porVencer, "cuota vence", "cuotas vencen")} esta semana` : null,
    d.vencidas ? `${cuantos(d.vencidas, "está vencida", "están vencidas")}` : null,
  ].filter(Boolean);
  if (agenda.length) partes.push(`${agenda.join(" y ")}.`.replace(/^./, (l) => l.toUpperCase()));

  const revisar = [
    d.aRevisar ? cuantos(d.aRevisar, "caso para revisar", "casos para revisar") : null,
    d.noIdentificados ? cuantos(d.noIdentificados, "pago no identificado", "pagos no identificados") : null,
  ].filter(Boolean);
  if (revisar.length) partes.push(`Hay ${revisar.join(" y ")}.`);

  for (const error of d.errores) partes.push(error.compania ? `${error.compania}: ${error.mensaje}` : error.mensaje);
  return partes.join(" ");
}
