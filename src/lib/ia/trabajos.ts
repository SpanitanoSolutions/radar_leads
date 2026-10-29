import type { EstadoTrabajoIA } from "./registro";

/** Intentos por trabajo, contando el primero. */
export const MAX_INTENTOS = 3;
/** Espera antes de cada reintento: después del 1.er fallo y del 2.º. */
export const ESPERAS_MINUTOS = [1, 5] as const;
/** Un trabajo que lleva más que esto en `procesando` se considera caído y vuelve a la cola. */
export const MINUTOS_COLGADO = 15;

/**
 * Error con un mensaje apto para guardar y mostrar: los manejadores lo usan
 * para las fallas conocidas. Cualquier otro error se guarda como un texto
 * genérico, porque su mensaje puede traer datos del asegurado.
 */
export class ErrorTrabajo extends Error {
  constructor(mensajeSeguro: string, readonly reintentable = true) {
    super(mensajeSeguro);
    this.name = "ErrorTrabajo";
  }
}

export const ERROR_GENERICO = "Falló el procesamiento. Se puede reintentar o seguir a mano.";

export function errorSeguro(error: unknown): string {
  return error instanceof ErrorTrabajo ? error.message.slice(0, 300) : ERROR_GENERICO;
}

export function esReintentable(error: unknown): boolean {
  return !(error instanceof ErrorTrabajo) || error.reintentable;
}

type TrasFallo =
  | { estado: Extract<EstadoTrabajoIA, "pendiente">; ejecutarDespuesDe: Date }
  | { estado: Extract<EstadoTrabajoIA, "error"> };

/** `intentos` ya incluye el que acaba de fallar. */
export function trasFallo(intentos: number, ahora: Date, reintentable: boolean): TrasFallo {
  if (!reintentable || intentos >= MAX_INTENTOS) return { estado: "error" };
  const minutos = ESPERAS_MINUTOS[Math.min(Math.max(intentos, 1), ESPERAS_MINUTOS.length) - 1];
  return { estado: "pendiente", ejecutarDespuesDe: new Date(ahora.getTime() + minutos * 60_000) };
}

/** Desde cuándo un trabajo en `procesando` cuenta como caído. */
export function limiteColgado(ahora: Date): Date {
  return new Date(ahora.getTime() - MINUTOS_COLGADO * 60_000);
}

/** Un trabajo caído que vuelve a tomarse suma un intento; pasado el máximo, ya no se ejecuta. */
export function agotoIntentos(intentos: number): boolean {
  return intentos > MAX_INTENTOS;
}

/** Progreso entero entre 0 y 100. */
export function porcentaje(hechos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((hechos / total) * 100)));
}
