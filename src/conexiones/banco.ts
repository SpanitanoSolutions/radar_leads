import "server-only";
import { guardarConexion, leerConexion } from "./estado";

/**
 * Cuenta bancaria del productor: para que el conciliador compare lo liquidado
 * con lo depositado y el validador confirme transferencias.
 *
 * Hoy es SIMULADA: guarda el banco y el alias (datos que no son secretos) y no
 * lee movimientos. La va a reemplazar la lectura de extractos (CSV que exporta
 * el home banking, con el mismo asistente de la importación) o una API de
 * agregación bancaria con el token en BANCO_API_TOKEN.
 */
export interface ConexionBanco {
  configurada(): Promise<boolean>;
  configurar(datos: { banco: string; alias: string }): Promise<void>;
  desconectar(): Promise<void>;
  movimientosDesde(desde: Date): Promise<{ fecha: Date; monto: number; detalle: string }[]>;
}

export const bancoSimulado: ConexionBanco = {
  async configurada() {
    return (await leerConexion("banco"))?.estado === "conectado";
  },
  async configurar({ banco, alias }) {
    await guardarConexion("banco", "conectado", { banco, alias });
  },
  async desconectar() {
    await guardarConexion("banco", "sin_conectar");
  },
  async movimientosDesde() {
    return [];
  },
};

export const banco: ConexionBanco = bancoSimulado;
