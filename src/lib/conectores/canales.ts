import { ACCION_DE } from "./permisos";
import {
  ErrorConector,
  llamar,
  type ArgumentosDe,
  type Capacidad,
  type CodigoErrorConector,
  type ConectorCompania,
  type ResultadoDe,
  type TipoConector,
} from "./tipos";

/** Prioridad automática: la API es lo más confiable y barato; el portal, lo más caro y frágil. */
export const ORDEN_CANALES: readonly TipoConector[] = ["api", "portal", "archivo"];

/** Tope por llamada. El portal navega con IA y tarda más. */
export const TIEMPO_MAXIMO_MS: Record<TipoConector, number> = { api: 30_000, portal: 300_000, archivo: 60_000 };

export type SaludCanal = { credencialVencida: boolean; portalCambiado: boolean };

export type IntentoCanal = {
  compania: string;
  canal: TipoConector;
  operacion: Capacidad | "probarConexion";
  resultado: "ok" | "error";
  codigoError: CodigoErrorConector | null;
  duracionMs: number;
};

export type ResultadoCanales<T> =
  | { ok: true; valor: T; canal: TipoConector; intentos: IntentoCanal[] }
  /** La compañía pidió un dato que no está: se frena y se le pregunta al productor. */
  | { ok: false; motivo: "requiere_dato"; pregunta: string; canal: TipoConector; intentos: IntentoCanal[] }
  /** Un envío que no se sabe si salió: no se reintenta por otro canal para no duplicarlo. */
  | { ok: false; motivo: "incierto"; canal: TipoConector; intentos: IntentoCanal[] }
  | { ok: false; motivo: "no_encontrado" | "sin_permiso"; canal: TipoConector; intentos: IntentoCanal[] }
  /** Ningún canal automático funcionó: queda el canal manual (correo o presentación manual). */
  | { ok: false; motivo: "manual"; intentos: IntentoCanal[] };

/** Los canales válidos de una lista guardada (conector_companias.canales), sin repetir y en su orden. */
export function canalesValidos(valores: readonly string[]): TipoConector[] {
  return [...new Set(valores)].filter((valor): valor is TipoConector => (ORDEN_CANALES as readonly string[]).includes(valor));
}

/**
 * Canales que tienen la capacidad y están sanos, en orden de prioridad. Con
 * `orden` (el de la compañía), solo esos canales y en ese orden: una lista
 * vacía deja solo el canal manual.
 */
export function ordenarCanales(
  conectores: ConectorCompania[],
  capacidad: Capacidad,
  salud: (conector: ConectorCompania) => SaludCanal | undefined = () => undefined,
  orden: readonly TipoConector[] = ORDEN_CANALES,
): ConectorCompania[] {
  return conectores
    .filter((conector) => orden.includes(conector.tipo) && conector.capacidades.includes(capacidad))
    .filter((conector) => {
      const estado = salud(conector);
      return !estado?.credencialVencida && !estado?.portalCambiado;
    })
    .sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo));
}

/**
 * Si conviene probar el canal siguiente. Para leer o cotizar, cualquier falla
 * técnica pasa al siguiente. Para un envío, solo las fallas que garantizan
 * que no salió nada (credencial, portal cambiado, servicio caído): un timeout
 * deja la duda y el productor tiene que revisarlo.
 */
export function pasaAlSiguiente(codigo: CodigoErrorConector, capacidad: Capacidad): boolean | "incierto" {
  if (codigo === "requiere_dato" || codigo === "no_encontrado" || codigo === "sin_permiso") return false;
  if (ACCION_DE[capacidad] === "enviar" && codigo === "timeout") return "incierto";
  return true;
}

/**
 * Qué dice un intento de la salud del canal. Si la compañía pidió un dato o
 * no encontró algo, el canal funcionó. Sin permiso no se llegó a la compañía.
 */
export function efectoEnSalud(intento: IntentoCanal): "exito" | "falla" | null {
  if (intento.resultado === "ok") return "exito";
  if (intento.codigoError === "sin_permiso") return null;
  if (intento.codigoError === "requiere_dato" || intento.codigoError === "no_encontrado") return "exito";
  return "falla";
}

function conTiempoMaximo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new ErrorConector("timeout", "La compañía no respondió a tiempo.")), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

export type OpcionesCanales = {
  registrar?: (intento: IntentoCanal) => Promise<void>;
  salud?: (conector: ConectorCompania) => SaludCanal | undefined;
  /** El orden de la compañía; sin él, API → portal → archivo. */
  canales?: readonly TipoConector[];
  tiempoMaximoMs?: Partial<Record<TipoConector, number>>;
  reloj?: () => number;
};

/** Prueba los canales en orden y pasa al siguiente si uno falla. Cada intento queda registrado. */
export async function ejecutarConCanales<C extends Capacidad>(
  conectores: ConectorCompania[],
  capacidad: C,
  argumentos: ArgumentosDe<C>,
  opciones: OpcionesCanales = {},
): Promise<ResultadoCanales<ResultadoDe<C>>> {
  const reloj = opciones.reloj ?? Date.now;
  const intentos: IntentoCanal[] = [];
  const anotar = async (intento: IntentoCanal) => {
    intentos.push(intento);
    await opciones.registrar?.(intento);
  };
  for (const conector of ordenarCanales(conectores, capacidad, opciones.salud, opciones.canales)) {
    const inicio = reloj();
    const base = { compania: conector.compania, canal: conector.tipo, operacion: capacidad };
    try {
      const tope = opciones.tiempoMaximoMs?.[conector.tipo] ?? TIEMPO_MAXIMO_MS[conector.tipo];
      const valor = await conTiempoMaximo(llamar(conector, capacidad, argumentos), tope);
      await anotar({ ...base, resultado: "ok", codigoError: null, duracionMs: reloj() - inicio });
      return { ok: true, valor, canal: conector.tipo, intentos };
    } catch (error) {
      const codigo = error instanceof ErrorConector ? error.codigo : "no_disponible";
      await anotar({ ...base, resultado: "error", codigoError: codigo, duracionMs: reloj() - inicio });
      const seguir = pasaAlSiguiente(codigo, capacidad);
      if (seguir === true) continue;
      if (seguir === "incierto") return { ok: false, motivo: "incierto", canal: conector.tipo, intentos };
      if (codigo === "requiere_dato") {
        const pregunta = error instanceof ErrorConector && error.pregunta ? error.pregunta : "La compañía pidió un dato que falta.";
        return { ok: false, motivo: "requiere_dato", pregunta, canal: conector.tipo, intentos };
      }
      return { ok: false, motivo: codigo === "sin_permiso" ? "sin_permiso" : "no_encontrado", canal: conector.tipo, intentos };
    }
  }
  return { ok: false, motivo: "manual", intentos };
}
