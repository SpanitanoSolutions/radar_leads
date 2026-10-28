import { normalizarEncabezado, type CampoCartera } from "./importacion";

// Cada compañía exporta la cartera con sus propios encabezados. Los formatos
// conocidos se reconocen por columnas que solo usa esa compañía y se relacionan
// solos, con la compañía y sus códigos de ramo. Para los demás queda la
// sugerencia por sinónimos de CAMPOS_CARTERA.
//
// Cada columna del formato tiene una decisión, pensada en lo que el productor
// necesita ver de sus pólizas y asegurados: va a un dato de UNIQO, se guarda
// como "otro dato" de la póliza con un nombre claro, o no se importa porque
// viene vacía, repite otra o viene rota (y se dice por qué).

export type OtroDato = {
  /** Cómo se muestra en la póliza. */
  etiqueta: string;
  /** Los montos se guardan con formato de pesos. */
  tipo?: "monto";
  /** Un 0 es que la compañía no lo informa (en los montos, siempre). */
  sinCero?: boolean;
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
  /** Ramos en los que la columna de suma asegurada no es la suma total. */
  sumaNoEsTotalEn?: string[];
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
      anualidad: { etiqueta: "Anualidad" },
      "cant siniestros": { etiqueta: "Siniestros informados por Mapfre" },
      "end ult fact": { etiqueta: "Endoso de la última factura", sinCero: true },
      productor: { etiqueta: "Código de productor" },
    },
    omitidas: {
      "nro tw": "Repite el número de póliza con el código de sección.",
      solicitud: "Viene siempre vacía.",
      "premio fact ant": "Viene con los decimales corridos (8019272.00 en vez de 80.192,72).",
      "suma aseg fact ant": "Es la de la factura anterior: se toma la de la última.",
      "end fact ant": "Es el endoso de la factura anterior: se toma el de la última.",
    },
    sumaNoEsTotalEn: ["Auto", "Moto", "Flota"],
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
