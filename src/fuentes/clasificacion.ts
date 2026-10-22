import type { Zona } from "@/db/schema";

// Reglas compartidas por todas las fuentes: a qué sector pertenece una empresa,
// qué ramos ofrecerle y con qué score base entra al radar.

export type SectorId = "flotas" | "construccion" | "industria" | "gastronomia" | "salud" | "comercio";

/** Minúsculas, sin acentos y con espacios simples. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Se buscan sobre texto normalizado. Ante un empate gana el primero de la lista.
const PALABRAS: [SectorId, RegExp][] = [
  [
    "flotas",
    // Sin "flota" ni "camión" sueltos: en una licitación suelen describir al
    // comprador ("neumáticos para la flota del organismo"), no a la empresa.
    /\b(transportes?|fletes?|logisticas?|servicios? logisticos?|reparto\w*|mudanzas?|remis\w*|taxis?|colectivos?|omnibus|micros?|pasajeros|traslados? de (pasajeros|personas|cargas|mercaderias|pacientes)|ambulancias?|acarreos?|courier|mensajeria|alquiler de (vehiculos|camionetas|autos))\b/g,
  ],
  [
    "construccion",
    /\b(construccion\w*|construir|constructora\w*|obras? (civil|civiles|publicas?|privadas?|viales?|sanitarias?|electricas?|hidraulicas?|de infraestructura|de arquitectura)|edificacion\w*|refaccion\w*|remodelacion\w*|pavimento\w*|pavimentacion\w*|viales?|hormigon|asfalt\w*|cloacas?|movimientos? de suelos?|demolicion\w*|albanileria|ingenieria civil)\b/g,
  ],
  [
    "industria",
    /\b(fabricacion\w*|fabrica|industria|industrializacion|metalurgic\w*|frigorific\w*|pesquer\w*|pesca|elaboracion\w*|manufactur\w*|astilleros?|curtiembres?|textil\w*|aserraderos?|imprenta\w*|matriceria|torneria|mecanizado\w*)\b/g,
  ],
  [
    "gastronomia",
    /\b(gastronomi\w*|restaurant\w*|restoran\w*|bar|bares|cafeteria\w*|cafe|coffee|parrillas?|rotiseria\w*|catering|confiteria\w*|panaderia\w*|pizzeria\w*|heladeria\w*|bakery|comidas?|racionamiento|viandas?|servicio de comedor)\b/g,
  ],
  [
    "salud",
    /\b(salud|medic(o|os|a|as|ina|inal|inales|amentos?)|odontolog\w*|clinica\w*|sanatorio\w*|farmac\w*|optica\w*|kinesiolog\w*|laboratorio de analisis|analisis clinicos|enfermeria|geriatric\w*|adultos mayores|droguer\w*|veterinari\w*|psicolog\w*|hospital\w*|consultorio\w*)\b/g,
  ],
  [
    "comercio",
    /\b(comercializacion|comercio|ventas?|compraventa|distribuidor\w*|distribucion|mayorista|minorista|importacion|exportacion|almacen\w*|despensas?|ferreteria\w*|corralon\w*|supermercado\w*|autoservicio\w*|kioscos?|libreria\w*|repuestos|bazar|indumentaria|materiales de construccion)\b/g,
  ],
];

/** Lo primero que dice un objeto social suele ser a qué se dedica de verdad. */
function pesoPorPosicion(posicion: number): number {
  if (posicion < 100) return 3;
  if (posicion < 250) return 2;
  return 1;
}

/**
 * Casi todos los objetos sociales repiten "compra, venta, importación,
 * exportación…": esas palabras pesan poco para que ganen las de la actividad.
 */
const PESO_SECTOR: Record<SectorId, number> = {
  flotas: 1,
  construccion: 1,
  industria: 1,
  gastronomia: 1,
  salud: 1,
  comercio: 0.4,
};

/**
 * Sector de una empresa según el texto que la describe (objeto social, rubro
 * u objeto de la licitación). Suma las palabras clave distintas de cada
 * sector (repetir "venta" diez veces no suma más), con más peso al principio
 * del texto. Sin coincidencias, "comercio".
 */
export function clasificarSector(texto: string): SectorId {
  // "Venta de materiales de construcción" es un corralón, no una constructora.
  const t = normalizar(texto).replace(/materiales? (de|para la) construccion/g, "materiales de construccion");
  let mejor: { sector: SectorId; puntos: number } = { sector: "comercio", puntos: 0 };
  for (const [sector, patron] of PALABRAS) {
    const vistas = new Set<string>();
    let puntos = 0;
    for (const m of t.matchAll(patron)) {
      const posicion = m.index ?? 0;
      if (sector === "construccion" && t.slice(0, posicion).endsWith("materiales de ")) continue;
      if (vistas.has(m[0])) continue;
      vistas.add(m[0]);
      puntos += pesoPorPosicion(posicion) * PESO_SECTOR[sector];
    }
    if (puntos > mejor.puntos) mejor = { sector, puntos };
  }
  return mejor.sector;
}

/** Nombre corto del rubro cuando la fuente no trae uno propio. */
export const RUBRO_POR_SECTOR: Record<SectorId, string> = {
  flotas: "Transporte y logística",
  construccion: "Construcción",
  industria: "Industria",
  gastronomia: "Gastronomía",
  salud: "Salud",
  comercio: "Comercio",
};

/** Ramos típicos de cada sector (coinciden con la pantalla "Mis sectores"). */
export const RAMOS_POR_SECTOR: Record<SectorId, string[]> = {
  flotas: ["Flota", "Carga", "ART"],
  construccion: ["RC", "ART", "Todo riesgo construcción"],
  industria: ["Integral", "ART"],
  gastronomia: ["Integral de comercio", "ART"],
  salud: ["RC profesional", "Integral"],
  comercio: ["Integral de comercio", "RC"],
};

/**
 * Para firmar un contrato con el Estado se pide seguro de caución. Si el
 * servicio es de transporte suma flota; si es una obra, RC, ART y todo riesgo.
 */
export function ramosLicitacion(sector: SectorId): string[] {
  if (sector === "flotas") return ["Caución", "Flota"];
  if (sector === "construccion") return ["Caución", "RC", "ART", "Todo riesgo construcción"];
  return ["Caución"];
}

export type TipoEvento = "licitacion" | "sociedad" | "transferencia";

// Score base = punto de partida del tipo de evento + cuánto encaja el sector +
// cercanía (al productor le conviene lo que puede visitar) + tamaño del contrato.
const BASE: Record<TipoEvento, number> = { licitacion: 72, sociedad: 68, transferencia: 66 };

const PUNTOS_SECTOR: Record<TipoEvento, Record<SectorId, number>> = {
  licitacion: { flotas: 12, construccion: 12, industria: 5, gastronomia: 0, salud: 0, comercio: 0 },
  sociedad: { flotas: 14, construccion: 12, industria: 6, gastronomia: 4, salud: 2, comercio: 0 },
  transferencia: { flotas: 10, construccion: 8, industria: 6, gastronomia: 6, salud: 4, comercio: 2 },
};

const PUNTOS_ZONA: Record<Zona, number> = { mdp: 5, costa: 3, provincia: 0 };

/** Montos adjudicados (en pesos) a partir de los cuales el contrato pesa más. */
export const MONTO_GRANDE = 100_000_000;
export const MONTO_MEDIANO = 20_000_000;

export function calcularScoreBase(
  tipo: TipoEvento,
  datos: { sector: SectorId; zona: Zona; montoPesos?: number; enDivisa?: boolean },
): number {
  let score = BASE[tipo] + PUNTOS_SECTOR[tipo][datos.sector] + PUNTOS_ZONA[datos.zona];
  if (tipo === "licitacion") {
    if (datos.enDivisa || (datos.montoPesos ?? 0) >= MONTO_GRANDE) score += 6;
    else if ((datos.montoPesos ?? 0) >= MONTO_MEDIANO) score += 3;
  }
  return Math.max(0, Math.min(95, score));
}

/** CUIT con guiones si tiene 11 dígitos; si no, null. */
export function formatearCuit(texto: string): string | null {
  const d = texto.replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Los CUIT de personas jurídicas empiezan con 30, 33 o 34. */
export function esCuitDeEmpresa(cuit: string): boolean {
  return /^3[034]/.test(cuit.replace(/\D/g, ""));
}

/**
 * Borra DNI y CUIT/CUIL de personas físicas de un texto antes de guardarlo
 * (Ley 25.326): solo guardamos datos de empresas.
 */
export function quitarDatosPersonales(texto: string): string {
  return texto
    .replace(/\b(D\.?\s?N\.?\s?I\.?|L\.?\s?C\.?|L\.?\s?E\.?)\s*(N\s?[°º.]\s*)?:?\s*\d{1,2}\.?\d{3}\.?\d{3}\b,?/gi, "")
    .replace(/\b(CUIT|CUIL)\s*(N\s?[°º.]\s*)?:?\s*(20|23|24|27)\s?-?\s?\d{8}\s?-?\s?\d\b,?/gi, "")
    .replace(/\b(20|23|24|27)-\d{8}-\d\b,?/g, "")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const SIGLAS = /^(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?c\.?s\.?|s\.?a\.?u\.?|s\.?h\.?|u\.?t\.?e\.?|s\.?a\.?c\.?i\.?f\.?)$/i;
const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en"]);

/**
 * "CONSTRUCCIONES DEL SUR SRL" → "Construcciones del Sur SRL". Las palabras
 * que ya tienen minúsculas quedan como están.
 */
export function tituloPropio(texto: string): string {
  const todoEnMinuscula = !/[A-ZÁÉÍÓÚÑ]/.test(texto);
  return texto
    .replace(/\s+/g, " ")
    .replace(/[\s,;:-]+\.?$/, "")
    .trim()
    .split(" ")
    .map((palabra, i) => {
      if (!todoEnMinuscula && /[a-záéíóúñü]/.test(palabra)) return palabra;
      if (SIGLAS.test(palabra)) return palabra.toUpperCase();
      const minuscula = palabra.toLowerCase();
      if (i > 0 && MINUSCULAS.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    })
    .join(" ");
}

/** Corta en el último espacio antes de `largo` y agrega "…". */
export function recortar(texto: string, largo: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= largo) return t;
  const corte = t.lastIndexOf(" ", largo - 1);
  return `${t.slice(0, corte > largo / 2 ? corte : largo - 1).replace(/[\s,;:.-]+$/, "")}…`;
}

/** "2026-06-22" → "22/06/2026". */
export function fechaLegible(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "TRANSPORTE DE CARGAS" o "transporte de cargas" → "Transporte de cargas". */
export function oracion(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  const mayusculas = (t.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length;
  const minusculas = (t.match(/[a-záéíóúñ]/g) ?? []).length;
  const base = mayusculas > minusculas ? t.toLowerCase() : t;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
