import type { EtapaSiniestro } from "@/db/schema";

// Siniestros: etapas del trámite y reglas de qué hace falta en cada caso.

export const ETAPAS: { id: EtapaSiniestro; nombre: string }[] = [
  { id: "aviso", nombre: "Aviso" },
  { id: "documentacion", nombre: "Documentación" },
  { id: "compania", nombre: "En la compañía" },
  { id: "inspeccion", nombre: "Inspección" },
  { id: "liquidacion", nombre: "Liquidación" },
  { id: "pago", nombre: "Pago" },
];

export function nombreEtapa(etapa: EtapaSiniestro): string {
  return ETAPAS.find((e) => e.id === etapa)?.nombre ?? etapa;
}

export function indiceEtapa(etapa: EtapaSiniestro): number {
  return ETAPAS.findIndex((e) => e.id === etapa);
}
