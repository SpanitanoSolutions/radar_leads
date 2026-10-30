import { normalizar } from "@/fuentes/clasificacion";
import { mejorResultadoConfirmado } from "@/lib/cotizacion";
import { pesos } from "@/lib/formato";

// El comparativo de la pestaña Cotizaciones (fase 4 de docs/specs/cotizacion-v2.md):
// las filas de la spec, en vista compacta o detallada. Las coberturas llegan
// con el nombre que les da cada compañía ("RC, robo e incendio total", "Todo
// riesgo con franquicia"): cada una va a las filas que nombra, sin inferir lo
// que no dice. "Terceros completo" no nombra ninguna y va a "Otras coberturas".

export type VistaComparativo = "compacta" | "detallada";

export type Cobertura = { nombre: string; valor?: string; incluida?: boolean };

export type ResultadoComparativo = {
  envioId: number;
  primaNeta: number | null;
  primaTotal: number;
  gastos: number;
  impuestos: number;
  moneda: string;
  franquicia: string | null;
  sumaAsegurada: number | null;
  vigencia: string | null;
  condiciones: string | null;
  coberturas: Cobertura[];
  confirmado: boolean;
};

/** Las filas de cobertura de la spec, con lo que las nombra (sobre el texto sin tildes y en minúsculas). */
export const FILAS_COBERTURA = [
  { id: "danos", etiqueta: "Daños", patron: /\bdan(o|os)\b|todo riesgo|destruccion/ },
  { id: "robo", etiqueta: "Robo", patron: /\brobo\b|\bhurto\b/ },
  { id: "cristales", etiqueta: "Cristales", patron: /cristal|parabrisa|luneta|vidrio/ },
  { id: "rc", etiqueta: "Responsabilidad civil", patron: /\brc\b|responsabilidad civil/ },
  { id: "servicios", etiqueta: "Servicios", patron: /servicio|asistencia|grua|remolque|auxilio|sustituto|traslado/ },
] as const;

export type IdFilaCobertura = (typeof FILAS_COBERTURA)[number]["id"];

const NOMBRES_DE_FILA = new Set(FILAS_COBERTURA.map((fila) => normalizar(fila.etiqueta)));

function filasDe(nombre: string): IdFilaCobertura[] {
  const texto = normalizar(nombre);
  return FILAS_COBERTURA.filter((fila) => fila.patron.test(texto)).map((fila) => fila.id);
}

/** Cómo se lee una cobertura en su fila: el valor solo si se llama como la fila ("Cristales: Hasta $ 300.000" → "Hasta $ 300.000"). */
function textoCobertura(cobertura: Cobertura, etiqueta: string | null): string {
  const mismoNombre = etiqueta !== null && normalizar(cobertura.nombre) === normalizar(etiqueta);
  const valor = cobertura.valor?.trim() || (cobertura.incluida === false ? "No incluye" : null);
  if (mismoNombre) return valor ?? "Incluida";
  return valor ? `${cobertura.nombre}: ${valor}` : cobertura.nombre;
}

/** Lo de cada fila de cobertura para una respuesta, y lo que no nombra ninguna. */
export function coberturasPorFila(coberturas: Cobertura[]): Record<IdFilaCobertura | "otras", string | null> {
  const textos: Record<IdFilaCobertura | "otras", string[]> = { danos: [], robo: [], cristales: [], rc: [], servicios: [], otras: [] };
  for (const cobertura of coberturas) {
    if (!cobertura.nombre?.trim()) continue;
    const filas = filasDe(cobertura.nombre);
    if (!filas.length) textos.otras.push(textoCobertura(cobertura, null));
    for (const id of filas) textos[id].push(textoCobertura(cobertura, FILAS_COBERTURA.find((fila) => fila.id === id)!.etiqueta));
  }
  return Object.fromEntries(Object.entries(textos).map(([id, lista]) => [id, lista.length ? lista.join("; ") : null])) as Record<IdFilaCobertura | "otras", string | null>;
}

/** Lo que se carga a mano en cada fila de cobertura: la cobertura que se llama como la fila. */
export function coberturasManuales(coberturas: Cobertura[]): Record<IdFilaCobertura, string> {
  return Object.fromEntries(FILAS_COBERTURA.map((fila) => [
    fila.id,
    coberturas.find((cobertura) => normalizar(cobertura.nombre) === normalizar(fila.etiqueta))?.valor ?? "",
  ])) as Record<IdFilaCobertura, string>;
}

/**
 * Las coberturas al guardar a mano: se conservan las que trajo la compañía y
 * se reemplazan las que se cargan en las filas (las que se llaman como la fila).
 * Una fila vacía saca la que había.
 */
export function unirCoberturasManuales(existentes: Cobertura[], manuales: Partial<Record<IdFilaCobertura, string>>): Cobertura[] {
  const conservadas = existentes.filter((cobertura) => !NOMBRES_DE_FILA.has(normalizar(cobertura.nombre)));
  const cargadas = FILAS_COBERTURA.flatMap((fila) => {
    const valor = manuales[fila.id]?.trim().slice(0, 200);
    return valor ? [{ nombre: fila.etiqueta, valor }] : [];
  });
  return [...conservadas, ...cargadas];
}

function precio(valor: number, moneda: string): string {
  return moneda === "USD" ? `US$ ${valor.toLocaleString("es-AR")}` : pesos(valor);
}

export type FilaComparativo = { id: string; etiqueta: string; celdas: (string | null)[] };

/**
 * Las filas de datos del comparativo, una celda por compañía (null si no
 * respondió o no lo informó). La prima total y "Tu revisión" las arma la
 * pantalla, porque llevan la confirmación. La compacta deja lo que decide:
 * prima neta y franquicia; la detallada, todas las de la spec.
 */
export function filasComparativo(resultados: (ResultadoComparativo | undefined)[], vista: VistaComparativo): FilaComparativo[] {
  const montoSiHay = (r: ResultadoComparativo | undefined, monto: number | null | undefined) => r && monto != null && monto > 0 ? precio(monto, r.moneda) : null;
  const coberturas = resultados.map((r) => (r ? coberturasPorFila(r.coberturas) : null));
  const filas: FilaComparativo[] = [
    { id: "primaNeta", etiqueta: "Prima neta", celdas: resultados.map((r) => montoSiHay(r, r?.primaNeta)) },
    { id: "gastos", etiqueta: "Gastos", celdas: resultados.map((r) => montoSiHay(r, r?.gastos)) },
    { id: "impuestos", etiqueta: "Impuestos", celdas: resultados.map((r) => montoSiHay(r, r?.impuestos)) },
    { id: "franquicia", etiqueta: "Franquicia", celdas: resultados.map((r) => r?.franquicia ?? null) },
    { id: "sumaAsegurada", etiqueta: "Suma asegurada o límite", celdas: resultados.map((r) => montoSiHay(r, r?.sumaAsegurada)) },
    { id: "vigencia", etiqueta: "Vigencia", celdas: resultados.map((r) => r?.vigencia ?? null) },
    { id: "condiciones", etiqueta: "Condiciones", celdas: resultados.map((r) => r?.condiciones ?? null) },
    ...FILAS_COBERTURA.map((fila) => ({ id: fila.id, etiqueta: fila.etiqueta, celdas: coberturas.map((c) => c?.[fila.id] ?? null) })),
    { id: "otras", etiqueta: "Otras coberturas", celdas: coberturas.map((c) => c?.otras ?? null) },
  ];
  if (vista === "compacta") return filas.filter((fila) => fila.id === "primaNeta" || fila.id === "franquicia");
  // "Otras coberturas" solo si alguna respuesta tiene alguna.
  return filas.filter((fila) => fila.id !== "otras" || fila.celdas.some(Boolean));
}

/** "Mejor precio": la menor prima total entre las respuestas confirmadas; las demás no compiten. */
export function envioConMejorPrecio(resultados: (ResultadoComparativo | undefined)[]): number | null {
  return mejorResultadoConfirmado(resultados.filter((r): r is ResultadoComparativo => Boolean(r)))?.envioId ?? null;
}

export function precioComparativo(resultado: ResultadoComparativo): string {
  return precio(resultado.primaTotal, resultado.moneda);
}
