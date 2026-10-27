import "server-only";
import { guardarConexion, leerConexion } from "./estado";

/**
 * Mercado Pago: links de pago para las cuotas y confirmación automática de
 * cobros (el validador puede confirmar un pago sin comprobante).
 *
 * Hoy es SIMULADO: guarda el estado en la tabla conexiones y no consulta nada.
 * Lo va a reemplazar la API de Mercado Pago con OAuth del productor
 * (POST /checkout/preferences para los links y GET /v1/payments/search para
 * los cobros), con el token en MERCADOPAGO_ACCESS_TOKEN.
 */
export interface ConexionMercadoPago {
  conectado(): Promise<boolean>;
  conectar(cuenta: string): Promise<void>;
  desconectar(): Promise<void>;
  linkDePago(concepto: { descripcion: string; monto: number }): Promise<string | null>;
  /** Cobros acreditados desde una fecha: monto, fecha y número de operación. */
  cobrosDesde(desde: Date): Promise<{ monto: number; fecha: Date; operacion: string }[]>;
}

export const mercadoPagoSimulado: ConexionMercadoPago = {
  async conectado() {
    return (await leerConexion("mercadopago"))?.estado === "conectado";
  },
  async conectar(cuenta) {
    await guardarConexion("mercadopago", "conectado", { cuenta });
  },
  async desconectar() {
    await guardarConexion("mercadopago", "sin_conectar");
  },
  async linkDePago() {
    return null;
  },
  async cobrosDesde() {
    return [];
  },
};

export const mercadoPago: ConexionMercadoPago = mercadoPagoSimulado;
