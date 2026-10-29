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
