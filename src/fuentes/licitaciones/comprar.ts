import type { Zona } from "@/db/schema";
import {
  calcularScoreBase,
  clasificarSector,
  esCuitDeEmpresa,
  fechaLegible,
  formatearCuit,
  oracion,
  ramosLicitacion,
  recortar,
  tituloPropio,
} from "../clasificacion";
import { zonaDeLocalidad } from "../localidades";
import type { LeadCapturado } from "../tipos";

// Adjudicaciones de COMPR.AR publicadas como datos abiertos en datos.gob.ar
// (dataset "Sistema de Contrataciones Electrónicas", licencia CC BY 4.0).
// El CSV de adjudicaciones no trae domicilio: se cruza por CUIT con el padrón
// de proveedores (SiPRO) para saber si la empresa es de la provincia.

export const URL_DATASET = "https://datos.gob.ar/dataset/sistema-de-contrataciones-electronicas";
const BASE = "https://infra.datos.gob.ar/catalog/jgm/dataset/4/distribution";
export const URL_ADJUDICACIONES = `${BASE}/4.22/download/Adjudicaciones.csv`;
export const URL_CONVOCATORIAS = `${BASE}/4.21/download/Convocatorias.csv`;
export const URL_SIPRO = `${BASE}/4.23/download/SiPRO.csv`;

/** Solo adjudicaciones de los últimos 6 meses: después la empresa ya contrató sus seguros. */
export const DIAS_RECIENTES = 180;
/** Por debajo de este monto (en pesos) el contrato suele no exigir garantía. */
export const MONTO_MINIMO = 5_000_000;

const PERSONERIAS_EXCLUIDAS = /persona fisica|organismo publico/i;

export type Proveedor = {
  cuit: string;
  razonSocial: string;
  localidad: string;
  zona: Zona;
};

/**
 * Proveedor del SiPRO si es una empresa con domicilio en la provincia de
 * Buenos Aires. Las personas físicas se descartan acá (Ley 25.326).
 */
export function proveedorBonaerense(fila: Record<string, string>): Proveedor | null {
  const cuit = formatearCuit(fila.CUIT_NIT ?? "");
  if (!cuit || !esCuitDeEmpresa(cuit)) return null;
  const personeria = (fila.Tipo_de_Personeria ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (PERSONERIAS_EXCLUIDAS.test(personeria)) return null;
  if ((fila.Provincia ?? "").trim().toLowerCase() !== "buenos aires") return null;
  const localidad = tituloPropio(fila.Localidad ?? "") || "Provincia de Buenos Aires";
  return {
    cuit,
    razonSocial: (fila.Razon_Social ?? "").trim(),
    localidad,
    zona: zonaDeLocalidad(localidad),
  };
}

export type Adjudicacion = {
  proceso: string;
  cuit: string;
  empresa: string;
  organismo: string;
  procedimiento: string;
  fecha: string; // AAAA-MM-DD
  rubros: string[];
  montoPesos: number;
  enDivisa: boolean;
};

/** "28/12/2016 04:05:45 p.m." → "2016-12-28". */
export function fechaIso(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function leerAdjudicacion(fila: Record<string, string>): Adjudicacion | null {
  const cuit = formatearCuit(fila.CUIT ?? "");
  const fecha = fechaIso(fila.Fecha_de_Adjudicacion ?? "");
  if (!cuit || !fecha || !fila.Numero_Proceso) return null;
  const monto = Number.parseFloat(fila.Monto ?? "") || 0;
  const enPesos = /peso/i.test(fila.Moneda ?? "");
  return {
    proceso: fila.Numero_Proceso.trim(),
    cuit,
    empresa: (fila.Descripcion_Proveedor ?? "").trim(),
    organismo: (fila.Descripcion_SAF ?? "").replace(/^\d+\s*-\s*/, "").trim(),
    procedimiento: (fila.Tipo_de_Procedimiento ?? "").trim(),
    fecha,
    rubros: (fila.Rubros ?? "")
      .split(";")
      .map((r) => r.trim())
      .filter(Boolean),
    montoPesos: enPesos ? monto : 0,
    enDivisa: !enPesos && monto > 0,
  };
}

/** Primer día (AAAA-MM-DD) de la ventana de adjudicaciones recientes. */
export function inicioVentana(ahora: Date, dias = DIAS_RECIENTES): string {
  return new Date(ahora.getTime() - dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Una empresa puede tener varias órdenes de compra en el mismo proceso
 * (renglones, ampliaciones): se suman en una sola adjudicación.
 */
export function agruparPorProceso(adjudicaciones: Adjudicacion[]): Adjudicacion[] {
  const porClave = new Map<string, Adjudicacion>();
  for (const a of adjudicaciones) {
    const clave = `${a.proceso}|${a.cuit}`;
    const previa = porClave.get(clave);
    if (!previa) {
      porClave.set(clave, { ...a, rubros: [...a.rubros] });
      continue;
    }
    previa.montoPesos += a.montoPesos;
    previa.enDivisa ||= a.enDivisa;
    if (a.fecha < previa.fecha) previa.fecha = a.fecha;
    for (const r of a.rubros) if (!previa.rubros.includes(r)) previa.rubros.push(r);
  }
  return [...porClave.values()];
}

export type Convocatoria = { nombre: string; objeto: string };

export function leerConvocatoria(fila: Record<string, string>): [string, Convocatoria] | null {
  if (!fila.Numero_Proceso) return null;
  return [
    fila.Numero_Proceso.trim(),
    { nombre: (fila.Nombre_del_Proceso ?? "").trim(), objeto: (fila.Objeto_del_Proceso ?? "").trim() },
  ];
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Convierte una adjudicación en lead, o null si el contrato es demasiado chico. */
export function adjudicacionALead(
  adj: Adjudicacion,
  proveedor: Proveedor,
  convocatoria?: Convocatoria,
): LeadCapturado | null {
  if (!adj.enDivisa && adj.montoPesos < MONTO_MINIMO) return null;

  const objeto = convocatoria?.nombre || convocatoria?.objeto || adj.rubros.join(", ");
  const sector = clasificarSector(
    `${adj.empresa}. ${convocatoria?.nombre ?? ""} ${convocatoria?.objeto ?? ""} ${adj.rubros.join(" ")}`,
  );
  const monto = adj.enDivisa ? "en moneda extranjera" : `por $ ${pesos.format(adj.montoPesos)}`;

  return {
    clave: `comprar:${adj.proceso}:${adj.cuit}`,
    empresa: tituloPropio(adj.empresa || proveedor.razonSocial),
    cuit: adj.cuit,
    rubro: oracion(adj.rubros[0] ?? "Proveedor del Estado"),
    localidad: proveedor.localidad,
    zona: proveedor.zona,
    sectorId: sector,
    motivo: recortar(`Ganó licitación nacional: ${oracion(objeto)}`, 110),
    descripcion:
      `Adjudicataria del proceso ${adj.proceso} (${adj.procedimiento.toLowerCase()}) de ` +
      `${adj.organismo}, el ${fechaLegible(adj.fecha)}, ${monto}. ` +
      `Para firmar el contrato suele exigirse seguro de caución.`,
    fuente: "COMPR.AR – adjudicaciones",
    fuenteUrl: URL_DATASET,
    alcanceLicitacion: "nacional",
    ramos: ramosLicitacion(sector),
    scoreBase: calcularScoreBase("licitacion", {
      sector,
      zona: proveedor.zona,
      montoPesos: adj.montoPesos,
      enDivisa: adj.enDivisa,
    }),
  };
}
