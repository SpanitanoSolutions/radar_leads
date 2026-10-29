import { companiaCanonica } from "@/lib/importacion";
import { ramoCanonico } from "@/lib/ramos";

// Período de gracia: días después del vencimiento antes de marcar una cuota
// como vencida, por compañía × ramo, con un valor para la 1.ª cuota y otro
// para las siguientes. Los carga el productor: sin fila, no hay gracia.

/** En `ramo`, vale para todos los ramos de la compañía. */
export const TODOS_LOS_RAMOS = "*";

/** Una fila de validador_gracia. */
export type FilaGracia = {
  compania: string;
  ramo: string;
  diasPrimera: number;
  diasSiguientes: number;
  habilitado: boolean;
  orgId: string | null;
  producerId: string | null;
};

export type AlcanceGracia = { compania: string; ramo: string; orgId: string | null; producerId: string | null };

export type Gracia = { diasPrimera: number; diasSiguientes: number };

export const SIN_GRACIA: Gracia = { diasPrimera: 0, diasSiguientes: 0 };

function aplica(fila: FilaGracia, alcance: AlcanceGracia): boolean {
  return companiaCanonica(fila.compania) === companiaCanonica(alcance.compania)
    && (fila.ramo === TODOS_LOS_RAMOS || ramoCanonico(fila.ramo) === ramoCanonico(alcance.ramo))
    && (fila.orgId === null || fila.orgId === alcance.orgId)
    && (fila.producerId === null || fila.producerId === alcance.producerId);
}

/** Primero pesa el alcance (productor > organización > plataforma); después, el ramo exacto sobre "*". */
function especificidad(fila: FilaGracia): number {
  const nivel = fila.producerId ? 2 : fila.orgId ? 1 : 0;
  return nivel * 2 + (fila.ramo !== TODOS_LOS_RAMOS ? 1 : 0);
}

/**
 * La gracia de una compañía y un ramo, en cascada plataforma → organización →
 * productor. Decide la fila más específica: si está deshabilitada, no hay
 * gracia aunque un nivel de arriba la tenga. Con el interruptor general
 * apagado o sin filas, tampoco.
 */
export function resolverGracia(filas: FilaGracia[], alcance: AlcanceGracia, habilitada = true): Gracia {
  if (!habilitada) return SIN_GRACIA;
  const fila = filas.filter((f) => aplica(f, alcance)).sort((a, b) => especificidad(b) - especificidad(a))[0];
  if (!fila?.habilitado) return SIN_GRACIA;
  return { diasPrimera: Math.max(0, fila.diasPrimera), diasSiguientes: Math.max(0, fila.diasSiguientes) };
}

/** La 1.ª cuota usa sus días; las demás, los de las siguientes. */
export function diasDeGracia(gracia: Gracia, numeroCuota: number): number {
  return numeroCuota <= 1 ? gracia.diasPrimera : gracia.diasSiguientes;
}

// ---------- Configuración → General: la grilla compañía × ramo ----------

export type Dias = { diasPrimera: number; diasSiguientes: number };

export type FilaGrilla = {
  compania: string;
  /** Lo cargado para este ramo; en "Todos los ramos", lo de la compañía. */
  propia: Dias | null;
  /** Lo que rige si no se carga nada: en un ramo, lo de "Todos los ramos"; en "Todos los ramos", nada (sin gracia). */
  heredada: Dias | null;
};

const mismoRamo = (a: string, b: string) => a === b || (a !== TODOS_LOS_RAMOS && b !== TODOS_LOS_RAMOS && ramoCanonico(a) === ramoCanonico(b));

/** Las filas del alcance de una compañía y un ramo (puede haber nombres viejos, como "SANCOR"). */
export function filasDe<T extends FilaGracia>(filas: T[], compania: string, ramo: string, alcance: { orgId: string | null; producerId: string | null }): T[] {
  return filas.filter(
    (f) => companiaCanonica(f.compania) === companiaCanonica(compania) && mismoRamo(f.ramo, ramo) && f.orgId === alcance.orgId && f.producerId === alcance.producerId,
  );
}

const dias = (f: FilaGracia | undefined): Dias | null => (f?.habilitado ? { diasPrimera: f.diasPrimera, diasSiguientes: f.diasSiguientes } : f ? { diasPrimera: 0, diasSiguientes: 0 } : null);

/** Una fila por compañía (las dadas y las que tienen gracia cargada), por nombre canónico. */
export function grillaDeGracia(filas: FilaGracia[], companias: string[], ramo: string, alcance: { orgId: string | null; producerId: string | null }): FilaGrilla[] {
  const nombres = [...new Set([...companias, ...filas.filter((f) => f.orgId === alcance.orgId && f.producerId === alcance.producerId).map((f) => f.compania)].map(companiaCanonica))];
  return nombres
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((compania) => ({
      compania,
      propia: dias(filasDe(filas, compania, ramo, alcance)[0]),
      heredada: ramo === TODOS_LOS_RAMOS ? null : dias(filasDe(filas, compania, TODOS_LOS_RAMOS, alcance)[0]),
    }));
}

/** Null borra lo cargado: en "Todos los ramos" la compañía queda sin gracia; en un ramo, vuelve a heredar. */
export type CambioGracia = { compania: string; dias: Dias | null };

export const MAXIMO_DIAS_GRACIA = 365;

/** Los dos valores de cada compañía tal como vienen del formulario. Vacíos los dos: borra; uno solo: error. */
export function leerGrillaGracia(entradas: { compania: string; primera: string; siguientes: string }[]): { cambios: CambioGracia[]; errores: string[] } {
  const cambios: CambioGracia[] = [];
  const errores: string[] = [];
  const numero = (texto: string) => (/^\d{1,3}$/.test(texto) && Number(texto) <= MAXIMO_DIAS_GRACIA ? Number(texto) : null);
  for (const e of entradas) {
    const [primera, siguientes] = [e.primera.trim(), e.siguientes.trim()];
    if (!primera && !siguientes) {
      cambios.push({ compania: e.compania, dias: null });
      continue;
    }
    if (!primera || !siguientes) {
      errores.push(`${e.compania}: completá los dos valores o dejá los dos vacíos.`);
      continue;
    }
    const [p, s] = [numero(primera), numero(siguientes)];
    if (p === null || s === null) {
      errores.push(`${e.compania}: los días tienen que ser números enteros de 0 a ${MAXIMO_DIAS_GRACIA}.`);
      continue;
    }
    cambios.push({ compania: e.compania, dias: { diasPrimera: p, diasSiguientes: s } });
  }
  return { cambios, errores };
}
