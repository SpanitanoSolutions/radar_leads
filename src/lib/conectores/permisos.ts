import { CAPACIDADES, ErrorConector, llamar, type ArgumentosDe, type Capacidad, type ConectorCompania } from "./tipos";

/** Qué puede hacer un agente solo (tabla "Permisos" de docs/specs/conectores.md). */
export type TipoAccion = "leer" | "cotizar" | "enviar";

export const ACCION_DE: Record<Capacidad, TipoAccion> = {
  cotizar: "cotizar",
  consultarCotizacion: "leer",
  obtenerCoberturas: "leer",
  obtenerEstadoCobranza: "leer",
  obtenerCuotas: "leer",
  obtenerCancelaciones: "leer",
  verificarPoliza: "leer",
  obtenerRequisitos: "leer",
  denunciarSiniestro: "enviar",
  subirDocumentos: "enviar",
  consultarSiniestro: "leer",
  descargarDocumentos: "leer",
};

/** Aprobación explícita del productor para un envío, después de ver la vista previa. */
export type AprobacionEnvio = { id: string; capacidad: Capacidad; aprobadoPor: string; aprobadoEl: Date };

export type Autorizacion = {
  /** La solicitud de cotización que aprobó el productor, o "Cotizar automáticamente" activo. */
  cotizar?: { solicitudId: number; motivo: "aprobada" | "automatica" };
  envios: AprobacionEnvio[];
  /** Aprobaciones ya usadas: cada una sirve para un solo envío. */
  usadas: Set<string>;
};

export function autorizacion(permisos: { cotizar?: Autorizacion["cotizar"]; envios?: AprobacionEnvio[] } = {}): Autorizacion {
  return { cotizar: permisos.cotizar, envios: permisos.envios ?? [], usadas: new Set() };
}

export type VerificacionPermiso = { ok: true; aprobacion: AprobacionEnvio | null } | { ok: false; mensaje: string };

export function verificarPermiso(capacidad: Capacidad, permisos: Autorizacion): VerificacionPermiso {
  switch (ACCION_DE[capacidad]) {
    case "leer":
      return { ok: true, aprobacion: null };
    case "cotizar":
      return permisos.cotizar
        ? { ok: true, aprobacion: null }
        : { ok: false, mensaje: "Para cotizar hace falta que el productor apruebe la solicitud o active \"Cotizar automáticamente\"." };
    case "enviar": {
      const aprobacion = permisos.envios.find((envio) => envio.capacidad === capacidad && !permisos.usadas.has(envio.id));
      return aprobacion
        ? { ok: true, aprobacion }
        : { ok: false, mensaje: "Este envío necesita la aprobación del productor, caso por caso." };
    }
  }
}

/**
 * Envuelve un conector para que cada llamada respete los permisos. Una
 * aprobación de envío se gasta solo si el envío sale bien, así un canal caído
 * no la consume y el siguiente canal puede usarla. Solo expone las
 * capacidades conocidas: si una implementación trae métodos de más, no se ven.
 */
export function conPermisos(conector: ConectorCompania, permisos: Autorizacion): ConectorCompania {
  const envuelto: ConectorCompania = {
    compania: conector.compania,
    tipo: conector.tipo,
    capacidades: conector.capacidades,
    probarConexion: (credencial) => conector.probarConexion(credencial),
  };
  const metodos = envuelto as unknown as Record<Capacidad, (...args: unknown[]) => Promise<unknown>>;
  for (const capacidad of CAPACIDADES) {
    if (!conector.capacidades.includes(capacidad) || typeof conector[capacidad] !== "function") continue;
    metodos[capacidad] = async (...args: unknown[]) => {
      const verificacion = verificarPermiso(capacidad, permisos);
      if (!verificacion.ok) throw new ErrorConector("sin_permiso", verificacion.mensaje);
      // Se reserva antes de llamar para que dos envíos simultáneos no usen la misma aprobación.
      const reservada = verificacion.aprobacion?.id;
      if (reservada) permisos.usadas.add(reservada);
      try {
        return await llamar(conector, capacidad, args as ArgumentosDe<typeof capacidad>);
      } catch (error) {
        if (reservada) permisos.usadas.delete(reservada);
        throw error;
      }
    };
  }
  return envuelto;
}
