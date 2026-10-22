import type { Zona } from "@/db/schema";

// Nomenclador para ubicar a una empresa en una de las tres zonas del radar.
// Alcanza con que aparezca el partido o una localidad conocida.

/** Partido de General Pueyrredón. */
const MDP = [
  "Mar del Plata",
  "Batán",
  "Sierra de los Padres",
  "Chapadmalal",
  "Estación Chapadmalal",
  "Estación Camet",
  "El Boquerón",
  "Laguna de los Padres",
  "Colonia Barragán",
  "General Pueyrredón",
];

/** Costa atlántica y partidos vecinos. */
const COSTA = [
  // Mar Chiquita
  "Mar Chiquita",
  "Santa Clara del Mar",
  "Mar de Cobo",
  "Coronel Vidal",
  "General Pirán",
  "Vivoratá",
  "Camet Norte",
  "La Caleta",
  // General Alvarado
  "General Alvarado",
  "Miramar",
  "Mechongué",
  "Comandante Nicanor Otamendi",
  "Mar del Sud",
  // Balcarce y Lobería
  "Balcarce",
  "Napaleofú",
  "Lobería",
  // Necochea
  "Necochea",
  "Quequén",
  // Villa Gesell, Pinamar y Madariaga
  "Villa Gesell",
  "Mar de las Pampas",
  "Mar Azul",
  "Pinamar",
  "Cariló",
  "Valeria del Mar",
  "Ostende",
  "General Juan Madariaga",
  "General Madariaga",
  // Partido de La Costa
  "Partido de La Costa",
  "San Clemente del Tuyú",
  "Santa Teresita",
  "Mar de Ajó",
  "San Bernardo",
  "Las Toninas",
  "Mar del Tuyú",
  "Costa del Este",
  "Aguas Verdes",
  "La Lucila del Mar",
];

/** Resto de los partidos de la provincia y localidades que aparecen seguido. */
const PROVINCIA = [
  "Adolfo Alsina",
  "Adolfo Gonzales Chaves",
  "Alberti",
  "Almirante Brown",
  "Arrecifes",
  "Avellaneda",
  "Ayacucho",
  "Azul",
  "Bahía Blanca",
  "Baradero",
  "Benito Juárez",
  "Berazategui",
  "Berisso",
  "Bolívar",
  "Bragado",
  "Brandsen",
  "Campana",
  "Cañuelas",
  "Capitán Sarmiento",
  "Carlos Casares",
  "Carlos Tejedor",
  "Carmen de Areco",
  "Castelli",
  "Chacabuco",
  "Chascomús",
  "Chivilcoy",
  "Colón",
  "Coronel Dorrego",
  "Coronel Pringles",
  "Coronel Rosales",
  "Coronel Suárez",
  "Daireaux",
  "Dolores",
  "Ensenada",
  "Escobar",
  "Esteban Echeverría",
  "Exaltación de la Cruz",
  "Ezeiza",
  "Florencio Varela",
  "Florentino Ameghino",
  "General Alvear",
  "General Arenales",
  "General Belgrano",
  "General Guido",
  "General La Madrid",
  "General Las Heras",
  "General Lavalle",
  "General Paz",
  "General Pinto",
  "General Rodríguez",
  "General San Martín",
  "General Viamonte",
  "General Villegas",
  "Guaminí",
  "Hipólito Yrigoyen",
  "Hurlingham",
  "Ituzaingó",
  "José C. Paz",
  "Junín",
  "La Matanza",
  "La Plata",
  "Lanús",
  "Laprida",
  "Las Flores",
  "Leandro N. Alem",
  "Lezama",
  "Lincoln",
  "Lobos",
  "Lomas de Zamora",
  "Luján",
  "Magdalena",
  "Maipú",
  "Malvinas Argentinas",
  "Marcos Paz",
  "Mercedes",
  "Merlo",
  "Monte Hermoso",
  "Moreno",
  "Morón",
  "Navarro",
  "Nueve de Julio",
  "9 de Julio",
  "Olavarría",
  "Patagones",
  "Pehuajó",
  "Pellegrini",
  "Pergamino",
  "Pilar",
  "Presidente Perón",
  "Puán",
  "Punta Indio",
  "Quilmes",
  "Ramallo",
  "Rauch",
  "Rojas",
  "Roque Pérez",
  "Saavedra",
  "Saladillo",
  "Salliqueló",
  "San Andrés de Giles",
  "San Antonio de Areco",
  "San Cayetano",
  "San Fernando",
  "San Isidro",
  "San Miguel",
  "San Nicolás",
  "San Pedro",
  "San Vicente",
  "Suipacha",
  "Tandil",
  "Tapalqué",
  "Tigre",
  "Tordillo",
  "Tornquist",
  "Trenque Lauquen",
  "Tres Arroyos",
  "Tres de Febrero",
  "Tres Lomas",
  "Veinticinco de Mayo",
  "25 de Mayo",
  "Vicente López",
  "Villarino",
  "Zárate",
  // Localidades con nombre distinto al de su partido
  "San Justo",
  "Ramos Mejía",
  "Haedo",
  "Castelar",
  "Caseros",
  "Burzaco",
  "Banfield",
  "Temperley",
  "Adrogué",
  "Bernal",
  "Wilde",
  "Martínez",
  "Olivos",
  "Florida",
  "Munro",
  "Villa Ballester",
  "Boulogne",
  "Don Torcuato",
  "Grand Bourg",
  "Ciudad Evita",
  "González Catán",
  "Laferrere",
  "City Bell",
  "Gonnet",
  "Punta Alta",
  "Quilmes Oeste",
  "Villa Bosch",
  "La Tablada",
  "Villa Martelli",
  "Lomas del Mirador",
];

export type Lugar = { nombre: string; zona: Zona };

/**
 * Pasa a minúsculas sin acentos y expande abreviaturas frecuentes en los
 * edictos ("Gral." → "general"), para comparar nombres de lugares.
 */
export function normalizarLugar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bgral\.?\s*/g, "general ")
    .replace(/\bcnel\.?\s*/g, "coronel ")
    .replace(/\bpte\.?\s*/g, "presidente ")
    .replace(/\balte\.?\s*/g, "almirante ")
    .replace(/\bsta\.?\s+/g, "santa ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LUGARES = [
  ...MDP.map((nombre) => ({ nombre, zona: "mdp" as const })),
  ...COSTA.map((nombre) => ({ nombre, zona: "costa" as const })),
  ...PROVINCIA.map((nombre) => ({ nombre, zona: "provincia" as const })),
]
  .map((l) => ({
    ...l,
    patron: new RegExp(`(?<![a-z0-9])${escapar(normalizarLugar(l.nombre))}(?![a-z0-9])`, "g"),
  }))
  // Los nombres largos primero: "Mar del Plata" antes que "Mar Chiquita".
  .sort((a, b) => b.nombre.length - a.nombre.length);

// Muchos partidos se llaman igual que una calle ("Balcarce 1234", "Av. Rivadavia").
const ES_CALLE_ANTES = /(calle|av|avda|avenida|diag|diagonal|ruta|pje|pasaje|bv|boulevard)\.?\s*$/;
const ES_CALLE_DESPUES = /^\s*(n\s?[°º]|nro|numero|\d)/;

/** Primer lugar conocido que aparece en el texto, ignorando nombres de calles. */
export function buscarLugar(texto: string): Lugar | null {
  const t = normalizarLugar(texto);
  let mejor: { lugar: Lugar; posicion: number } | null = null;
  for (const { nombre, zona, patron } of LUGARES) {
    patron.lastIndex = 0;
    for (let m = patron.exec(t); m; m = patron.exec(t)) {
      const antes = t.slice(Math.max(0, m.index - 12), m.index);
      const despues = t.slice(m.index + m[0].length, m.index + m[0].length + 6);
      if (ES_CALLE_ANTES.test(antes) || ES_CALLE_DESPUES.test(despues)) continue;
      if (!mejor || m.index < mejor.posicion) mejor = { lugar: { nombre, zona }, posicion: m.index };
      break;
    }
  }
  return mejor?.lugar ?? null;
}

/** Zona de una localidad bonaerense; si no la conocemos, "provincia". */
export function zonaDeLocalidad(localidad: string): Zona {
  return buscarLugar(localidad)?.zona ?? "provincia";
}
