import { normalizarEncabezado, type CampoCartera } from "./importacion";

// Cada compañía exporta la cartera con sus propios encabezados. Los formatos
// conocidos se reconocen por columnas que solo usa esa compañía y se relacionan
// solos, con la compañía y sus códigos de ramo. Para los demás queda la
// sugerencia por sinónimos de CAMPOS_CARTERA.
//
// Cada columna del formato tiene una decisión: va a un dato de UNIQO o se
// guarda como "otro dato" de la póliza con un nombre claro. No se pierde nada
// de lo que exporta la compañía; `omitidas` queda para lo que no sea un dato
// (y se le dice al productor por qué).

export type OtroDato = {
  /** Cómo se muestra en la póliza. */
  etiqueta: string;
  /** Los montos se guardan con formato de pesos. */
  tipo?: "monto";
  /** Un 0 es que la compañía no lo informa (en los montos, siempre). */
  sinCero?: boolean;
  /**
   * El monto llega sin la coma decimal ("18061979.00" era $ 180.619,79): el
   * lugar de la coma se elige comparándolo con el monto de `comparar` de la
   * misma póliza o, si no lo tiene, con el típico de su `agrupar` en el archivo.
   */
  sinComaDecimal?: { comparar: string; agrupar?: string };
};

export type FormatoCartera = {
  compania: string;
  /** Cómo se lo nombra al productor: "listado de cartera vigente de Mapfre". */
  nombre: string;
  /** Encabezados (normalizados) que tienen que estar todos para reconocerlo. */
  huella: string[];
  /** Encabezado normalizado → dato de UNIQO. */
  columnas: Record<string, CampoCartera>;
  /** Encabezado normalizado → "otro dato" de la póliza. */
  otros: Record<string, OtroDato>;
  /** Encabezado normalizado → por qué no se importa (se le muestra al productor). */
  omitidas: Record<string, string>;
  /** Códigos de ramo propios de la compañía → ramo de UNIQO. */
  ramos?: Record<string, string>;
  /** Ramos en los que la columna de suma asegurada no es la suma total (se guarda como ajuste). */
  sumaNoEsTotalEn?: string[];
  /**
   * La fecha de fin de vigencia es el fin del período facturado: salvo en las
   * pólizas anuales (según `facturacion`), no es el vencimiento. Se guarda
   * como "Fin del período facturado" y la póliza sigue vigente mientras venga
   * en la cartera.
   */
  finDelPeriodo?: { facturacion: string };
  /**
   * Si la compañía no informa la prima anual: el premio de la última factura
   * (o, si todavía no hay, el de la anterior) por las facturas que hace al año
   * según `facturacion` ("MENSUAL" → ×12). Si la facturación viene vacía, se
   * supone la de `siNoInforma` según el grupo de la póliza (la sección) y la
   * prima queda "a confirmar"; sin eso, no se calcula.
   */
  primaAnual?: {
    premio: string;
    premioAnterior?: string;
    facturacion: string;
    siNoInforma?: { agrupar: string; facturas: Record<string, number> };
  };
};

export const FORMATOS_CARTERA: FormatoCartera[] = [
  {
    // Listado "Cartera vigente" del sistema de productores (TronWeb).
    compania: "Mapfre",
    nombre: "listado de cartera vigente de Mapfre",
    huella: ["seccion", "nro tw", "tomador", "fecha vig"],
    columnas: {
      tomador: "nombre",
      "nro documento": "documento",
      "fec nac benef": "fechaNacimiento",
      telefono: "telefono",
      domicilio: "domicilio",
      localidad: "localidad",
      "cod postal": "codigoPostal",
      seccion: "ramo", // "AUTOMOTORES", "COMBINADO FAMILIAR"
      ramo: "producto", // "AUTOMOVILES INDIVIDUAL SCORING", "POLIZA MAS"
      poliza: "numero",
      // Fin del período facturado: en las pólizas de refacturación mensual es el mes en curso.
      "fecha vig": "vigenciaHasta",
      "forma de cobro": "formaPago", // TC, DD, AG, CR
      // En combinado e integral es la suma total; en autos, el ajuste del endoso (ver sumaNoEsTotalEn).
      "suma aseg ult fact": "sumaAsegurada",
    },
    otros: {
      "tipo fact": { etiqueta: "Facturación" }, // MENSUAL, SEMESTRAL, ANUAL
      "premio ult fact": { etiqueta: "Premio de la última factura", tipo: "monto" },
      // Mapfre lo exporta sin la coma decimal: "18061979.00" es $ 180.619,79 y "734524.00", $ 73.452,40.
      "premio fact ant": {
        etiqueta: "Premio de la factura anterior",
        tipo: "monto",
        sinComaDecimal: { comparar: "premio ult fact", agrupar: "seccion" },
      },
      anualidad: { etiqueta: "Anualidad" },
      "cant siniestros": { etiqueta: "Siniestros informados por Mapfre" },
      "end ult fact": { etiqueta: "Endoso de la última factura", sinCero: true },
      "end fact ant": { etiqueta: "Endoso de la factura anterior", sinCero: true },
      // En combinado e integral es la suma; en autos, el ajuste del endoso.
      "suma aseg fact ant": { etiqueta: "Suma de la factura anterior", tipo: "monto" },
      "nro tw": { etiqueta: "N° TronWeb" },
      solicitud: { etiqueta: "Solicitud" },
      productor: { etiqueta: "Código de productor" },
    },
    omitidas: {},
    // En autos, "SUMA ASEG.ÚLT.FACT." es el ajuste del endoso: se guarda como tal.
    sumaNoEsTotalEn: ["Auto", "Moto", "Flota"],
    // "FECHA VIG." es el fin del período facturado (el mes, en las mensuales).
    finDelPeriodo: { facturacion: "tipo fact" },
    // Mapfre informa el premio de cada factura, no la prima anual.
    primaAnual: {
      premio: "premio ult fact",
      premioAnterior: "premio fact ant",
      facturacion: "tipo fact",
      // Cuando no la informa: en la cartera, los vencimientos de combinado e integral caen
      // dentro de tres meses (trimestral) y los de autos dentro del mes, como los mensuales.
      siNoInforma: {
        agrupar: "seccion",
        facturas: { "combinado familiar": 4, "integral de comercio": 4, automotores: 12, motos: 12 },
      },
    },
  },
  {
    // Reporte "Detalle" de cartera: una fila por certificado.
    compania: "Sancor",
    nombre: "detalle de cartera de Sancor",
    huella: ["denominacion", "nro asoc", "certificado", "cliente"],
    columnas: {
      denominacion: "nombre",
      cliente: "documento", // "D0000031000444", "J30-70000000-8"
      ramo: "ramo",
      producto: "producto", // "864"
      poliza: "numero",
      certificado: "certificado",
      "fecha inicio vigencia": "vigenciaDesde",
      "fecha fin vigencia": "vigenciaHasta",
      prima: "prima",
      premio: "premio",
      "suma asegurada": "sumaAsegurada",
    },
    otros: {
      "nro asoc": { etiqueta: "N° de asociado en Sancor" },
      referencia: { etiqueta: "Referencia" },
      "grupo estadistico": { etiqueta: "Grupo estadístico" },
      productor: { etiqueta: "Productor" },
      organizador: { etiqueta: "Organizador" },
    },
    omitidas: {},
    // Deducidos de las carteras: sumas aseguradas, grupo estadístico y tipo de cliente.
    ramos: { "200": "Auto", "600": "AP", "1720": "Vida", "1800": "Hogar", "2100": "Integral" },
  },
];

/** El formato conocido al que corresponden los encabezados, o null. */
export function detectarFormato(encabezados: string[]): FormatoCartera | null {
  const presentes = new Set(encabezados.map(normalizarEncabezado));
  return FORMATOS_CARTERA.find((f) => f.huella.every((e) => presentes.has(e))) ?? null;
}

/** Cada columna, el dato que le corresponde según el formato. Cada dato (salvo "otro") se usa una sola vez. */
export function mapeoDeFormato(encabezados: string[], formato: FormatoCartera): (CampoCartera | "")[] {
  const usados = new Set<CampoCartera>();
  return encabezados.map((e) => {
    const n = normalizarEncabezado(e);
    if (n in formato.otros) return "otro";
    const campo = formato.columnas[n];
    if (!campo || usados.has(campo)) return "";
    usados.add(campo);
    return campo;
  });
}

/** Por qué no se importa cada columna, para mostrarlo al relacionarlas. */
export function motivosDeFormato(encabezados: string[], formato: FormatoCartera): (string | null)[] {
  return encabezados.map((e) => formato.omitidas[normalizarEncabezado(e)] ?? null);
}
