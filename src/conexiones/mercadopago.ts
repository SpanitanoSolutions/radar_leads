import "server-only";
import { borrarCredenciales, leerCredenciales, tokenVigente } from "./secretos";
import { leerConexion } from "./estado";

export interface ConexionMercadoPago {
  conectado(): Promise<boolean>;
  conectar(cuenta: string): Promise<void>;
  desconectar(): Promise<void>;
  linkDePago(concepto: { descripcion: string; monto: number }): Promise<string | null>;
  cobrosDesde(desde: Date): Promise<{ monto: number; fecha: Date; operacion: string }[]>;
}

async function pedirMP(ruta: string, init: RequestInit = {}) {
  const accessToken = await tokenVigente("mercadopago", "mercadopago");
  const respuesta = await fetch(`https://api.mercadopago.com${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) throw new Error(`Mercado Pago respondió ${respuesta.status}.`);
  return respuesta;
}

export const mercadoPago: ConexionMercadoPago = {
  async conectado() {
    const fila = await leerConexion("mercadopago");
    return fila?.estado === "conectado" && Boolean(await leerCredenciales("mercadopago"));
  },
  async conectar() {
    throw new Error("Conectá Mercado Pago con OAuth desde el botón Autorizar.");
  },
  async desconectar() {
    await borrarCredenciales("mercadopago");
  },
  async linkDePago(concepto) {
    if (!Number.isFinite(concepto.monto) || concepto.monto <= 0) throw new Error("El importe del link debe ser mayor a cero.");
    const respuesta = await pedirMP("/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: concepto.descripcion.slice(0, 250), quantity: 1, currency_id: "ARS", unit_price: concepto.monto }],
        ...(process.env.APP_URL ? { back_urls: { success: process.env.APP_URL, pending: process.env.APP_URL, failure: process.env.APP_URL } } : {}),
        auto_return: process.env.APP_URL ? "approved" : undefined,
      }),
    });
    const resultado = (await respuesta.json()) as { init_point?: string };
    return resultado.init_point ?? null;
  },
  async cobrosDesde(desde) {
    const inicio = desde.toISOString();
    const fin = new Date().toISOString();
    const consulta = new URLSearchParams({
      range: "date_created",
      begin_date: inicio,
      end_date: fin,
      sort: "date_created",
      criteria: "desc",
      limit: "100",
    });
    const resultado = (await pedirMP(`/v1/payments/search?${consulta}`).then((r) => r.json())) as {
      results?: { id: number; status: string; transaction_amount: number; date_approved?: string; date_created: string }[];
    };
    return (resultado.results ?? [])
      .filter((p) => p.status === "approved")
      .map((p) => ({ monto: p.transaction_amount, fecha: new Date(p.date_approved ?? p.date_created), operacion: String(p.id) }));
  },
};
