const PESOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const PORCENTAJE = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });

/** 180000 → "$ 180.000". */
export function pesos(valor: number): string {
  return PESOS.format(valor);
}

/** 0.125 → "12,5 %". */
export function porcentaje(valor: number): string {
  return PORCENTAJE.format(valor);
}

const PESOS_CENTAVOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

/** 72500 → "$ 72.500,00" (como figura en un comprobante). */
export function pesosConCentavos(valor: number): string {
  return PESOS_CENTAVOS.format(valor);
}

const DOLARES_CENTAVOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** 1915.61 → "$ 1.915,61"; en dólares, "US$ 1.915,61". */
export function importe(valor: number, moneda: "ARS" | "USD"): string {
  return moneda === "USD" ? DOLARES_CENTAVOS.format(valor) : PESOS_CENTAVOS.format(valor);
}
