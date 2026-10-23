import type { AlcanceLicitacion, EstadoLead, Prioridad, Zona } from "@/db/schema";

export const ZONAS: { id: Zona; nombre: string; detalle: string }[] = [
  { id: "mdp", nombre: "Mar del Plata y Batán", detalle: "General Pueyrredón" },
  {
    id: "costa",
    nombre: "Costa y partidos vecinos",
    detalle: "Mar Chiquita, Balcarce, General Alvarado y alrededores",
  },
  {
    id: "provincia",
    nombre: "Resto de la provincia",
    detalle: "Incluye conurbano, La Plata y el interior bonaerense",
  },
];

export const ALCANCES: { id: AlcanceLicitacion; nombre: string; detalle: string }[] = [
  { id: "municipal", nombre: "Municipales", detalle: "Municipios de la zona elegida" },
  {
    id: "provincial",
    nombre: "Provinciales",
    detalle: "PBAC y PBA Contrataciones (obra pública)",
  },
  { id: "nacional", nombre: "Nacionales", detalle: "COMPR.AR y CONTRAT.AR" },
];

export const PRIORIDADES: { id: Prioridad; nombre: string }[] = [
  { id: "alta", nombre: "Alta" },
  { id: "media", nombre: "Media" },
  { id: "baja", nombre: "Baja" },
];

export const ESTADOS: { id: EstadoLead; nombre: string }[] = [
  { id: "nuevo", nombre: "Nuevo" },
  { id: "llamado", nombre: "Llamado" },
  { id: "reunion", nombre: "Reunión agendada" },
  { id: "cerrado", nombre: "Cerrado" },
  { id: "descartado", nombre: "Descartado" },
];

export function nombreEstado(id: EstadoLead): string {
  return ESTADOS.find((e) => e.id === id)?.nombre ?? id;
}

/** Explicación corta de cada ramo para la ficha del lead. */
export const RAMOS: Record<string, string> = {
  Flota: "Camiones, utilitarios o autos de la empresa.",
  Carga: "Mercadería en tránsito.",
  ART: "Obligatoria al tener personal en relación de dependencia.",
  AP: "Accidentes personales de choferes o pasajeros.",
  Caución: "Garantía que exige la licitación o el contrato.",
  RC: "Responsabilidad civil frente a terceros.",
  "RC transporte de personas": "Responsabilidad civil hacia los pasajeros o pacientes que se trasladan.",
  "Todo riesgo construcción": "Cubre la obra mientras se construye.",
  "Integral de comercio": "Local, mercadería, incendio y robo.",
  Integral: "Cobertura combinada del establecimiento.",
  "RC profesional": "Mala praxis o errores profesionales.",
};

export type EstadoFuente = "activa" | "por-configurar" | "manual" | "sin-datos";

export const FUENTES: {
  nombre: string;
  detalle: string;
  estado: EstadoFuente;
  /** Variable de entorno que la activa: sin ella figura "Por configurar". */
  requiere?: string;
}[] = [
  {
    nombre: "Licitaciones nacionales",
    detalle: "Adjudicaciones de COMPR.AR (datos abiertos, se publican cada algunos meses)",
    estado: "activa",
  },
  {
    nombre: "Licitaciones provinciales y municipales",
    detalle: "PBAC y PBA Contrataciones no publican datos abiertos",
    estado: "por-configurar",
  },
  {
    nombre: "Boletín Oficial de la Provincia",
    detalle: "Sociedades nuevas y transferencias de fondo de comercio, cada día hábil",
    estado: "activa",
  },
  {
    nombre: "Teléfonos de las empresas",
    detalle: "Claude busca en la web el teléfono que publica cada empresa",
    estado: "activa",
    requiere: "ANTHROPIC_API_KEY",
  },
  {
    nombre: "Habilitaciones municipales",
    detalle: "General Pueyrredón las publica sin razón social ni CUIT",
    estado: "sin-datos",
  },
  {
    nombre: "Búsquedas laborales",
    detalle: "Los portales de empleo no permiten la captura automática",
    estado: "sin-datos",
  },
  {
    nombre: "Consulta ART (SRT)",
    detalle: "Manual, solo para leads elegidos",
    estado: "manual",
  },
];

export const URL_CONSULTA_ART =
  "https://www.srt.gob.ar/index.php/consulta-de-alicuota-por-cuit/";
