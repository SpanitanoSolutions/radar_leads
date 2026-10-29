import type { EstadoValidacion, OrigenConfirmacion } from "@/db/schema";
import { normalizar } from "@/fuentes/clasificacion";
import type { Paso } from "@/lib/cobranza";
import type { Moneda } from "@/lib/conectores/tipos";
import { diaEnArgentina, diasEntre, sumarDias } from "@/lib/fechas";
import { companiaCanonica } from "@/lib/importacion";
import { calcularEstado, totalizar, type ResultadoEstado, type Total } from "./estados";
import type { Gracia } from "./gracia";

// Lo que muestra la pantalla del Validador (sección 5 de
// docs/specs/validador-v2.md): el estado de cada cuota con su gracia, los
// filtros, la lista por asegurado, el calendario, las tablas y los totales.
// Puro: arma lo que se ve; los pagos los deciden estados.ts y matching.ts.

export const VENTANA = {
  /** Cuotas impagas: las que vencieron hasta hace cuatro meses y las de los próximos dos. */
  diasAtras: 120,
  diasAdelante: 60,
  /** Pagadas y canceladas: los últimos doce meses. */
  meses: 12,
} as const;

export type CuotaValidador = {
  id: number;
  polizaId: number;
  aseguradoId: number;
  asegurado: string;
  compania: string | null;
  ramo: string;
  poliza: string | null;
  item: string | null;
  endoso: string | null;
  cupon: string | null;
  numero: number;
  cantidadCuotas: number;
  monto: number;
  moneda: Moneda;
  vencimiento: string;
  /** El medio con que se pagó o, si está impaga, la forma de pago de la póliza. */
  medio: string | null;
  pagada: boolean;
  cancelada: boolean;
  /** Cuándo se registró el pago en UNIQO. */
  pagadaEl: Date | null;
  /** Día en que pagó el asegurado (o, si no se sabe, el día en que se registró). */
  fechaPago: string | null;
  origenConfirmacion: OrigenConfirmacion | null;
  ultimaRevision: Date | null;
  canceladaEl: string | null;
  motivoCancelacion: string | null;
};

export type CuotaPantalla = CuotaValidador & ResultadoEstado;

/** El estado de cada cuota hoy, con la gracia de su compañía y ramo. */
export function conEstados(cuotas: CuotaValidador[], hoy: string, graciaDe: (compania: string | null, ramo: string) => Gracia): CuotaPantalla[] {
  return cuotas.map((c) => ({ ...c, ...calcularEstado(c, { hoy, gracia: graciaDe(c.compania, c.ramo) }) }));
}

export const esAbierta = (c: { estado: EstadoValidacion }) => c.estado !== "pagada" && c.estado !== "cancelada";

/** Las cuatro tarjetas del inicio. Monitoreadas son las impagas: pendientes más vencidas. */
export function tarjetasInicio(cuotas: CuotaPantalla[], hoy: string) {
  const abiertas = cuotas.filter(esAbierta);
  const vencidas = abiertas.filter((c) => c.estado === "vencida").length;
  return {
    monitoreadas: abiertas.length,
    confirmadasHoy: cuotas.filter((c) => c.estado === "pagada" && c.pagadaEl && diaEnArgentina(c.pagadaEl) === hoy).length,
    pendientes: abiertas.length - vencidas,
    vencidas,
  };
}

// ---------- Filtros ----------

export type FiltrosValidador = { q: string; compania: string; ramo: string; medio: string; desde: string; hasta: string };

const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function leerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosValidador {
  const texto = (clave: string) => (typeof sp[clave] === "string" ? (sp[clave] as string).trim().slice(0, 120) : "");
  const dia = (clave: string) => (esDia(texto(clave)) ? texto(clave) : "");
  return { q: texto("q"), compania: texto("cia"), ramo: texto("ramo"), medio: texto("medio"), desde: dia("desde"), hasta: dia("hasta") };
}

/**
 * Busca por asegurado, póliza o cupón; la compañía se compara por su nombre
 * canónico ("SANCOR" es Sancor). El rango de fechas va sobre la fecha que
 * corresponde a la pestaña: vencimiento, pago o cancelación.
 */
export function filtrar<T extends CuotaValidador>(cuotas: T[], f: FiltrosValidador, fecha: (c: T) => string | null = (c) => c.vencimiento): T[] {
  const buscado = normalizar(f.q);
  const compania = f.compania ? companiaCanonica(f.compania) : "";
  return cuotas.filter((c) => {
    if (buscado && !normalizar(`${c.asegurado} ${c.poliza ?? ""} ${c.cupon ?? ""}`).includes(buscado)) return false;
    if (compania && companiaCanonica(c.compania ?? "") !== compania) return false;
    if (f.ramo && c.ramo !== f.ramo) return false;
    if (f.medio && (c.medio ?? "") !== f.medio) return false;
    const dia = fecha(c);
    if (f.desde && (!dia || dia < f.desde)) return false;
    if (f.hasta && (!dia || dia > f.hasta)) return false;
    return true;
  });
}

export type PestanaCuotas = "pendientes" | "pagadas" | "canceladas";

/**
 * Las cuotas de una pestaña con los filtros: el rango de fechas es sobre el
 * vencimiento en Pendientes, el día de pago en Pagadas y el de la cancelación
 * en Canceladas.
 */
export function cuotasDePestana(cuotas: CuotaPantalla[], pestana: PestanaCuotas, f: FiltrosValidador): CuotaPantalla[] {
  if (pestana === "pendientes") return filtrar(cuotas.filter(esAbierta), f);
  if (pestana === "pagadas") return filtrar(cuotas.filter((c) => c.estado === "pagada"), f, (c) => c.fechaPago);
  return filtrar(cuotas.filter((c) => c.estado === "cancelada"), f, (c) => c.canceladaEl ?? c.vencimiento);
}

/** Las opciones de los filtros, con lo que hay en las cuotas. */
export function opcionesDeFiltros(cuotas: CuotaValidador[]) {
  const unicos = (valores: (string | null)[]) => [...new Set(valores.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "es"));
  return {
    companias: unicos(cuotas.map((c) => (c.compania ? companiaCanonica(c.compania) : null))),
    ramos: unicos(cuotas.map((c) => c.ramo)),
    medios: unicos(cuotas.map((c) => c.medio)),
  };
}

// ---------- Textos ----------

export type Tono = "rojo" | "ambar-fuerte" | "ambar" | "gris" | "verde";

/** "Hoy", "en 3 d", "vencida hace 5 d"; en gracia, cuánto hace que venció. */
export function etiquetaDias(c: Pick<ResultadoEstado, "estado" | "diasParaVencer">): { texto: string; tono: Tono } {
  const d = c.diasParaVencer;
  if (c.estado === "vencida") return { texto: `vencida hace ${-d} d`, tono: "rojo" };
  if (d === 0) return { texto: "Hoy", tono: "ambar-fuerte" };
  if (d < 0) return { texto: `en gracia, venció hace ${-d} d`, tono: "ambar-fuerte" };
  return { texto: `en ${d} d`, tono: d <= 7 ? "ambar" : "gris" };
}

const ESTADOS: Record<EstadoValidacion, { texto: string; tono: Tono }> = {
  pendiente: { texto: "Pendiente", tono: "gris" },
  por_vencer: { texto: "Por vencer", tono: "ambar" },
  vencida: { texto: "Vencida", tono: "rojo" },
  pagada: { texto: "Pagada", tono: "verde" },
  cancelada: { texto: "Cancelada", tono: "gris" },
};

export function textoEstado(c: Pick<ResultadoEstado, "estado" | "enGracia">): { texto: string; tono: Tono } {
  return c.enGracia ? { texto: "En gracia", tono: "ambar-fuerte" } : ESTADOS[c.estado];
}

/** Los medios para marcar una cuota pagada a mano. */
export const MEDIOS_MANUALES = ["Transferencia", "Depósito", "Débito automático", "Rapipago", "Pago Fácil", "Mercado Pago", "Efectivo al productor"];

export const ORIGEN_CONFIRMACION: Record<OrigenConfirmacion, string> = {
  listado: "Listado de la compañía",
  comprobante: "Comprobante",
  portal: "Portal de la compañía",
  manual: "Manual",
};

/** "hoy", "ayer", "hace 46 d". Sin fecha, "nunca". */
export function haceDias(fecha: Date | null, hoy: string): string {
  if (!fecha) return "nunca";
  const d = diasEntre(diaEnArgentina(fecha), hoy);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} d`;
}

/** "4/12" y, en flotas, el ítem. */
export function textoCuota(c: Pick<CuotaValidador, "numero" | "cantidadCuotas">): string {
  return `${c.numero}/${c.cantidadCuotas}`;
}

// ---------- Lista por asegurado ----------

export type GrupoAsegurado<T> = { aseguradoId: number; asegurado: string; cuotas: T[]; companias: string[]; total: Total };

/** Las cuotas de cada asegurado, en el orden dado; el grupo va donde va su primera cuota. */
export function agruparPorAsegurado<T extends CuotaValidador>(cuotas: T[], orden: (a: T, b: T) => number): GrupoAsegurado<T>[] {
  const grupos = new Map<number, T[]>();
  for (const c of [...cuotas].sort(orden)) grupos.set(c.aseguradoId, [...(grupos.get(c.aseguradoId) ?? []), c]);
  return [...grupos.values()].map((lista) => ({
    aseguradoId: lista[0].aseguradoId,
    asegurado: lista[0].asegurado,
    cuotas: lista,
    companias: [...new Set(lista.map((c) => (c.compania ? companiaCanonica(c.compania) : "—")))],
    total: totalizar(lista),
  }));
}

export const porVencimiento = (a: CuotaValidador, b: CuotaValidador) => a.vencimiento.localeCompare(b.vencimiento) || a.id - b.id;
export const porPagoReciente = (a: CuotaValidador, b: CuotaValidador) => (b.fechaPago ?? "").localeCompare(a.fechaPago ?? "") || a.id - b.id;

// ---------- Pagadas ----------

/** Desde qué día se muestran las pagadas: el primero del mes, doce meses atrás contando el actual. */
export function desdePagadas(hoy: string): string {
  const [anio, mes] = hoy.split("-").map(Number);
  const indice = anio * 12 + (mes - 1) - (VENTANA.meses - 1);
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}-01`;
}

export type PeriodoPagadas = "mes" | "anteriores";

export function periodoDePago(c: Pick<CuotaValidador, "fechaPago">, hoy: string): PeriodoPagadas {
  return (c.fechaPago ?? "").slice(0, 7) === hoy.slice(0, 7) ? "mes" : "anteriores";
}

/** Este mes y Anteriores: una línea por moneda, pagos y asegurados. */
export function totalesPagadas(cuotas: CuotaValidador[], hoy: string): Record<PeriodoPagadas, Total> {
  return {
    mes: totalizar(cuotas.filter((c) => periodoDePago(c, hoy) === "mes")),
    anteriores: totalizar(cuotas.filter((c) => periodoDePago(c, hoy) === "anteriores")),
  };
}

// ---------- Calendario ----------

export type DiaCalendario = { dia: string; delMes: boolean; total: Total };

/** "2026-11"; si no es un mes válido, el de hoy. */
export function leerMes(valor: unknown, hoy: string): string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : hoy.slice(0, 7);
}

export function mesVecino(mes: string, delta: number): string {
  const [anio, m] = mes.split("-").map(Number);
  const indice = anio * 12 + (m - 1) + delta;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`;
}

/** "noviembre de 2026". */
export function nombreMes(mes: string): string {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T12:00:00Z`));
}

/** Las semanas del mes, de lunes a domingo, con lo que vence cada día (por moneda). */
export function calendarioDelMes(cuotas: Pick<CuotaValidador, "vencimiento" | "monto" | "moneda" | "aseguradoId">[], mes: string): DiaCalendario[][] {
  const primero = `${mes}-01`;
  const diaSemana = new Date(`${primero}T12:00:00Z`).getUTCDay(); // 0 domingo
  let dia = sumarDias(primero, diaSemana === 0 ? -6 : 1 - diaSemana);
  const porDia = new Map<string, typeof cuotas>();
  for (const c of cuotas) if (c.vencimiento.startsWith(mes)) porDia.set(c.vencimiento, [...(porDia.get(c.vencimiento) ?? []), c]);
  const semanas: DiaCalendario[][] = [];
  while (semanas.length === 0 || dia.startsWith(mes)) {
    const semana: DiaCalendario[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push({ dia, delMes: dia.startsWith(mes), total: totalizar(porDia.get(dia) ?? []) });
      dia = sumarDias(dia, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

// ---------- Tabla ----------

export const COLUMNAS_ORDEN = ["asegurado", "compania", "ramo", "poliza", "cuota", "monto", "vencimiento", "pago", "cancelacion", "medio", "estado", "revision"] as const;
export type ColumnaOrden = (typeof COLUMNAS_ORDEN)[number];
export type Sentido = "asc" | "desc";

export type Orden = { columna: ColumnaOrden; sentido: Sentido };

/** El orden de la URL; si no hay uno válido, el de la pestaña. */
export function leerOrden(columna: unknown, sentido: unknown, porDefecto: Orden): Orden {
  const elegida = COLUMNAS_ORDEN.find((c) => c === columna);
  if (!elegida) return porDefecto;
  return { columna: elegida, sentido: sentido === "desc" ? "desc" : "asc" };
}

/** Pendientes por vencimiento; pagadas y canceladas, las más recientes primero. */
export const ORDEN_DE: Record<PestanaCuotas, Orden> = {
  pendientes: { columna: "vencimiento", sentido: "asc" },
  pagadas: { columna: "pago", sentido: "desc" },
  canceladas: { columna: "cancelacion", sentido: "desc" },
};

const ORDEN_ESTADO: EstadoValidacion[] = ["vencida", "por_vencer", "pendiente", "pagada", "cancelada"];

/** Ordena por la columna elegida. Los montos se ordenan por moneda y después por monto: ARS y USD no se comparan. */
export function ordenarCuotas<T extends CuotaPantalla>(cuotas: T[], columna: ColumnaOrden, sentido: Sentido): T[] {
  const texto = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "es", { numeric: true });
  const comparar: Record<ColumnaOrden, (a: T, b: T) => number> = {
    asegurado: (a, b) => texto(a.asegurado, b.asegurado),
    compania: (a, b) => texto(a.compania, b.compania),
    ramo: (a, b) => texto(a.ramo, b.ramo),
    poliza: (a, b) => texto(a.poliza, b.poliza),
    cuota: (a, b) => a.numero - b.numero,
    monto: (a, b) => a.moneda.localeCompare(b.moneda) || a.monto - b.monto,
    vencimiento: (a, b) => a.vencimiento.localeCompare(b.vencimiento),
    pago: (a, b) => texto(a.fechaPago, b.fechaPago),
    cancelacion: (a, b) => texto(a.canceladaEl, b.canceladaEl),
    medio: (a, b) => texto(a.medio, b.medio),
    estado: (a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado),
    revision: (a, b) => (a.ultimaRevision?.getTime() ?? 0) - (b.ultimaRevision?.getTime() ?? 0),
  };
  const signo = sentido === "asc" ? 1 : -1;
  return [...cuotas].sort((a, b) => signo * comparar[columna](a, b) || a.vencimiento.localeCompare(b.vencimiento) || a.id - b.id);
}

// ---------- Fuentes y Cobranza ----------

/**
 * Cada corrida guarda lo que informó cada conector en su período, así que el
 * mismo pago aparece en varias fuentes: se muestra solo la última de cada
 * compañía.
 */
export function ultimasFuentes(fuentes: { id: number; compania: string; creadoEl: Date }[]): Set<number> {
  const ultima = new Map<string, { id: number; creadoEl: Date }>();
  for (const f of fuentes) {
    const clave = companiaCanonica(f.compania);
    const actual = ultima.get(clave);
    if (!actual || f.creadoEl > actual.creadoEl || (f.creadoEl.getTime() === actual.creadoEl.getTime() && f.id > actual.id)) ultima.set(clave, f);
  }
  return new Set([...ultima.values()].map((f) => f.id));
}

/** El paso de la secuencia de Cobranza para el borrador que se pide desde el Validador. */
export function pasoParaCobranza(vencimiento: string, hoy: string): Paso {
  if (vencimiento < hoy) return 3;
  return vencimiento === hoy ? 2 : 1;
}
