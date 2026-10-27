import "server-only";
import { guardarConexion, leerConexion } from "./estado";

/**
 * Portal de productores de cada compañía: cotizar, bajar pólizas y seguir
 * siniestros en las compañías con acceso de productor.
 *
 * Hoy es SIMULADO: guarda el usuario (no la clave) y no entra a ningún portal.
 * Lo van a reemplazar las integraciones con cada portal de productores
 * (Mapfre, Sancor, Federación Patronal, La Segunda y Fianzas y Crédito),
 * automatizando el portal. Las claves irán en variables de
 * entorno por compañía (PORTAL_MAPFRE_CLAVE, …), nunca en la base.
 */
export interface ConexionPortal {
  estado(compania: string): Promise<"conectado" | "sin_conectar" | "por_email">;
  conectar(compania: string, usuario: string): Promise<void>;
  /** Compañías sin portal: el agente les escribe a esta dirección. */
  porEmail(compania: string, email: string): Promise<void>;
  desconectar(compania: string): Promise<void>;
  /** Envía la solicitud al portal. El resultado llegará por el proceso receptor. */
  pedirCotizacion(compania: string, pedido: {
    solicitudId: number;
    solicitudNumero: number;
    cliente: string;
    tipo: "renovacion" | "mejora" | "nueva";
    ramo: string;
    bien: string | null;
    motivo: string | null;
  }): Promise<{ referencia: string }>;
}

export const portalSimulado: ConexionPortal = {
  async estado(compania) {
    const estado = (await leerConexion(`portal:${compania}`))?.estado;
    return estado === "conectado" || estado === "por_email" ? estado : "sin_conectar";
  },
  async conectar(compania, usuario) {
    await guardarConexion(`portal:${compania}`, "conectado", { usuario });
  },
  async porEmail(compania, email) {
    await guardarConexion(`portal:${compania}`, "por_email", { email });
  },
  async desconectar(compania) {
    await guardarConexion(`portal:${compania}`, "sin_conectar");
  },
  async pedirCotizacion(compania) {
    throw new Error(`El portal de ${compania} no tiene un conector real configurado; no se solicitó ninguna cotización.`);
  },
};

export const portal: ConexionPortal = portalSimulado;
