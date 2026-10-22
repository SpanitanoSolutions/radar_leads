import type { Ajustes, Lead, Sector, Zona } from "@/db/schema";
import { diasDesde, penalizacionPorAntiguedad, ramosSugeridos, tipoDeEvento, type TipoEvento } from "./evento";
import { nivelScore, scoreFinal, type NivelScore } from "./score";

export type LeadConScore = Lead & {
  score: number;
  nivel: NivelScore;
  sector: Sector;
  tipoEvento: TipoEvento;
  /** Días desde el evento; null si no se conoce la fecha. */
  diasEvento: number | null;
  /** Ramos en el orden en que conviene ofrecerlos hoy. */
  ramosOrdenados: string[];
};

/** Score de un lead hoy: score base, prioridad del sector y antigüedad del evento. */
export function puntuarLead(lead: Lead, sector: Sector, ahora: Date = new Date()) {
  const tipoEvento = tipoDeEvento(lead);
  const diasEvento = lead.fechaEvento ? diasDesde(lead.fechaEvento, ahora) : null;
  const score = scoreFinal(lead.scoreBase, sector.prioridad, penalizacionPorAntiguedad(tipoEvento, diasEvento));
  return {
    score,
    nivel: nivelScore(score),
    tipoEvento,
    diasEvento,
    ramosOrdenados: ramosSugeridos(lead.ramos, tipoEvento, diasEvento),
  };
}

export type Filtros = {
  sector: string; // "todos" o id de sector
  zona: Zona | "todas";
  q: string;
};

const ZONAS_VALIDAS = new Set(["mdp", "costa", "provincia"]);

export function leerFiltros(params: Record<string, string | string[] | undefined>): Filtros {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const zona = uno(params.zona);
  return {
    sector: uno(params.sector) || "todos",
    zona: ZONAS_VALIDAS.has(zona) ? (zona as Zona) : "todas",
    q: uno(params.q).trim(),
  };
}

/**
 * Leads visibles según la configuración del productor: sectores activos,
 * zonas elegidas y alcance de licitaciones. Excluye los descartados.
 * Devuelve cada lead con su score final, ordenados de mayor a menor.
 */
export function leadsVisibles(
  leads: Lead[],
  sectores: Sector[],
  ajustes: Pick<Ajustes, "zonas" | "licitaciones">,
  ahora: Date = new Date(),
): LeadConScore[] {
  const porId = new Map(sectores.map((s) => [s.id, s]));
  const resultado: LeadConScore[] = [];
  for (const lead of leads) {
    const sector = porId.get(lead.sectorId);
    if (!sector || !sector.activo) continue;
    if (lead.estado === "descartado") continue;
    if (!ajustes.zonas[lead.zona]) continue;
    if (lead.alcanceLicitacion && !ajustes.licitaciones[lead.alcanceLicitacion]) continue;
    resultado.push({ ...lead, sector, ...puntuarLead(lead, sector, ahora) });
  }
  return resultado.sort(
    (a, b) => b.score - a.score || b.detectadoEl.getTime() - a.detectadoEl.getTime(),
  );
}

function coincideTexto(lead: Lead, q: string): boolean {
  if (!q) return true;
  const normal = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const buscado = normal(q);
  const digitos = q.replace(/\D/g, "");
  return (
    normal(lead.empresa).includes(buscado) ||
    normal(lead.localidad).includes(buscado) ||
    (digitos.length >= 4 && (lead.cuit ?? "").replace(/\D/g, "").includes(digitos))
  );
}

export function aplicarFiltros(leads: LeadConScore[], f: Filtros): LeadConScore[] {
  return leads.filter(
    (l) =>
      (f.sector === "todos" || l.sectorId === f.sector) &&
      (f.zona === "todas" || l.zona === f.zona) &&
      coincideTexto(l, f.q),
  );
}

/** Cantidad por sector respetando el filtro de zona y la búsqueda (y viceversa). */
export function contarPorSector(leads: LeadConScore[], f: Filtros): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const l of aplicarFiltros(leads, { ...f, sector: "todos" })) {
    conteo.set(l.sectorId, (conteo.get(l.sectorId) ?? 0) + 1);
  }
  return conteo;
}

export function contarPorZona(leads: LeadConScore[], f: Filtros): Map<Zona, number> {
  const conteo = new Map<Zona, number>();
  for (const l of aplicarFiltros(leads, { ...f, zona: "todas" })) {
    conteo.set(l.zona, (conteo.get(l.zona) ?? 0) + 1);
  }
  return conteo;
}

const SIETE_DIAS_MS = 7 * 86_400_000;

export function calcularKpis(visibles: LeadConScore[], ahora: number = Date.now()) {
  return {
    nuevos: visibles.filter((l) => ahora - l.detectadoEl.getTime() <= SIETE_DIAS_MS).length,
    altaSinContactar: visibles.filter((l) => l.nivel === "alto" && l.estado === "nuevo").length,
    enSeguimiento: visibles.filter((l) => l.estado === "llamado" || l.estado === "reunion").length,
    cerrados: visibles.filter((l) => l.estado === "cerrado").length,
  };
}

/** Arma la URL de la lista manteniendo los filtros que no cambian. */
export function urlFiltros(actual: Filtros, cambios: Partial<Filtros>): string {
  const f = { ...actual, ...cambios };
  const p = new URLSearchParams();
  if (f.sector !== "todos") p.set("sector", f.sector);
  if (f.zona !== "todas") p.set("zona", f.zona);
  if (f.q) p.set("q", f.q);
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}
