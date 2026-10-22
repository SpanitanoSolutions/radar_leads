import type { EstadoLead, Lead } from "@/db/schema";
import { tipoDeEvento } from "./evento";

// Cerrar el ciclo: qué se vendió (o por qué no) y cuánto rinde cada fuente.

export const MOTIVOS_DESCARTE = [
  { id: "ya-tiene-productor", nombre: "Ya tiene productor" },
  { id: "no-atendio", nombre: "No atendió" },
  { id: "muy-chico", nombre: "Muy chico" },
  { id: "no-le-interesa", nombre: "No le interesa" },
  { id: "datos-incorrectos", nombre: "Datos incorrectos" },
  { id: "otro", nombre: "Otro" },
] as const;

export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]["id"];

export function esMotivoDescarte(valor: string): valor is MotivoDescarte {
  return MOTIVOS_DESCARTE.some((m) => m.id === valor);
}

export function nombreMotivo(id: string | null): string | null {
  return MOTIVOS_DESCARTE.find((m) => m.id === id)?.nombre ?? null;
}

/** Descartes que implican que el productor intentó el contacto (llamó). */
export function motivoImplicaContacto(motivo: MotivoDescarte): boolean {
  return motivo !== "otro";
}

/** Estados que implican que ya se habló con la empresa. */
export function estadoImplicaContacto(estado: EstadoLead): boolean {
  return estado === "llamado" || estado === "reunion" || estado === "cerrado";
}

/** "$ 150.000", "150000", "150.000,50" → 150000 (pesos enteros); vacío o inválido → null. */
export function parsearMonto(texto: string | null | undefined): number | null {
  const limpio = (texto ?? "").replace(/[$\s]/g, "");
  if (!limpio) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(limpio)) return null;
  const numero = Number(limpio.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? Math.round(numero) : null;
}

/** De dónde vino el lead, separando las dos clases de aviso del Boletín. */
export function origenDeLead(lead: Pick<Lead, "clave" | "alcanceLicitacion" | "motivo" | "fuente">): string {
  const clave = lead.clave ?? "";
  if (clave.startsWith("comprar:")) return "Licitaciones (COMPR.AR)";
  if (clave.startsWith("bo-pba:")) {
    return tipoDeEvento(lead) === "sociedad" ? "Sociedades nuevas (Boletín Oficial)" : "Fondos de comercio (Boletín Oficial)";
  }
  return lead.fuente;
}

export type FilaResultados = {
  nombre: string;
  leads: number;
  contactados: number;
  reuniones: number;
  cerrados: number;
  descartados: number;
  comision: number;
  prima: number;
  /** Cerrados sobre leads (0 a 1). */
  conversion: number;
  /** Cerrados sobre contactados (0 a 1). */
  conversionContactados: number;
};

type LeadResultado = Pick<
  Lead,
  | "clave"
  | "alcanceLicitacion"
  | "motivo"
  | "fuente"
  | "sectorId"
  | "estado"
  | "esEjemplo"
  | "contactadoEl"
  | "reunionEl"
  | "cierreComision"
  | "cierrePrima"
>;

function fila(nombre: string, leads: LeadResultado[]): FilaResultados {
  const contactados = leads.filter((l) => l.contactadoEl || estadoImplicaContacto(l.estado)).length;
  const reuniones = leads.filter((l) => l.reunionEl || l.estado === "reunion").length;
  const cerrados = leads.filter((l) => l.estado === "cerrado");
  return {
    nombre,
    leads: leads.length,
    contactados,
    reuniones,
    cerrados: cerrados.length,
    descartados: leads.filter((l) => l.estado === "descartado").length,
    comision: cerrados.reduce((total, l) => total + (l.cierreComision ?? 0), 0),
    prima: cerrados.reduce((total, l) => total + (l.cierrePrima ?? 0), 0),
    conversion: leads.length ? cerrados.length / leads.length : 0,
    conversionContactados: contactados ? cerrados.length / contactados : 0,
  };
}

function agrupar(leads: LeadResultado[], clave: (l: LeadResultado) => string, nombre: (k: string) => string) {
  const grupos = new Map<string, LeadResultado[]>();
  for (const l of leads) grupos.set(clave(l), [...(grupos.get(clave(l)) ?? []), l]);
  return [...grupos].map(([k, ls]) => fila(nombre(k), ls)).sort((a, b) => b.cerrados - a.cerrados || b.leads - a.leads);
}

/** Embudo por origen y por sector, sin contar los leads de ejemplo. */
export function calcularResultados(todos: LeadResultado[], nombresSector: Record<string, string> = {}) {
  const leads = todos.filter((l) => !l.esEjemplo);
  return {
    total: fila("Total", leads),
    porOrigen: agrupar(leads, origenDeLead, (k) => k),
    porSector: agrupar(leads, (l) => l.sectorId, (k) => nombresSector[k] ?? k),
  };
}
