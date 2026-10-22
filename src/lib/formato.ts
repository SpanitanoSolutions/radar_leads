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
