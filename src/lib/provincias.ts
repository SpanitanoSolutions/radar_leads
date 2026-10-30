/** Las 24 jurisdicciones, para elegir la de la cuenta. */
export const PROVINCIAS = [
  "Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
] as const;

export const PROVINCIA_POR_DEFECTO = "Buenos Aires";

/** Una provincia que no está en la lista vuelve a la de por defecto. */
export function provinciaValida(valor: string | null | undefined): string {
  return PROVINCIAS.find((provincia) => provincia === valor) ?? PROVINCIA_POR_DEFECTO;
}
