import "server-only";
import { guardarConexion } from "./estado";

export interface ConexionBanco {
  configurada(): Promise<boolean>;
  configurar(datos: { banco: string; alias: string }): Promise<void>;
  desconectar(): Promise<void>;
  movimientosDesde(desde: Date): Promise<{ fecha: Date; monto: number; detalle: string }[]>;
}

/**
 * No hay una API única del BCRA para leer movimientos autorizados por cliente.
 * El adaptador bancario se habilitará cuando la cuenta contrate un proveedor
 * compatible (por ejemplo Interbanking para empresas) y configure OAuth.
 */
export const banco: ConexionBanco = {
  async configurada() {
    return false;
  },
  async configurar() {
    throw new Error("La conexión automática requiere credenciales y contrato de un proveedor bancario.");
  },
  async desconectar() {
    await guardarConexion("banco", "sin_conectar");
  },
  async movimientosDesde() {
    throw new Error("Todavía no hay un proveedor bancario real configurado; no se consultaron movimientos.");
  },
};
