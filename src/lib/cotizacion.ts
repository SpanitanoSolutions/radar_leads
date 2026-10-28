import { normalizar } from "@/fuentes/clasificacion";

export type EstadoCotizacion = "atencion" | "esperando" | "lista" | "enviada" | "ganada" | "perdida";
export type FiltroCotizacion = { q?: string; estado?: string; ramo?: string; origen?: string; ejecutivo?: string; desde?: string; hasta?: string };

export type SolicitudParaLista = {
  numero: number;
  cliente: string;
  ramo: string;
  bien: string | null;
  origen: string;
  estado: EstadoCotizacion;
  cotizaciones: { compania: string; precio: number | null }[];
  ejecutivo?: string | null;
  creadoEl?: Date;
};

export const ESTADOS_COTIZACION: { id: EstadoCotizacion; texto: string }[] = [
  { id: "atencion", texto: "Requiere tu atención" },
  { id: "esperando", texto: "Esperando compañías" },
  { id: "lista", texto: "Comparativa lista" },
  { id: "enviada", texto: "Enviada al cliente" },
  { id: "ganada", texto: "Ganada" },
  { id: "perdida", texto: "Perdida" },
];

export function filtrarSolicitudes<T extends SolicitudParaLista>(solicitudes: T[], filtros: FiltroCotizacion): T[] {
  const q = normalizar(filtros.q?.trim() ?? "");
  return solicitudes.filter((solicitud) => {
    if (filtros.estado && solicitud.estado !== filtros.estado) return false;
    if (filtros.ramo && solicitud.ramo !== filtros.ramo) return false;
    if (filtros.origen && solicitud.origen !== filtros.origen) return false;
    if (filtros.ejecutivo && solicitud.ejecutivo !== filtros.ejecutivo) return false;
    const fecha = solicitud.creadoEl?.toISOString().slice(0, 10);
    if (filtros.desde && (!fecha || fecha < filtros.desde)) return false;
    if (filtros.hasta && (!fecha || fecha > filtros.hasta)) return false;
    return !q || normalizar(`${solicitud.cliente} ${solicitud.numero}`).includes(q);
  });
}

export function mejorCotizacion(cotizaciones: { compania: string; precio: number | null }[]): { compania: string; precio: number } | null {
  return cotizaciones
    .filter((cotizacion): cotizacion is { compania: string; precio: number } => cotizacion.precio !== null)
    .sort((a, b) => a.precio - b.precio)[0] ?? null;
}

export function resumenCotizacion(solicitudes: SolicitudParaLista[]) {
  const mes = solicitudes.filter((solicitud) => !["ganada", "perdida"].includes(solicitud.estado));
  return {
    activas: mes.length,
    atencion: solicitudes.filter((solicitud) => solicitud.estado === "atencion").length,
    delMes: solicitudes.length,
    recibidas: solicitudes.reduce(
      (total, solicitud) => total + solicitud.cotizaciones.filter((cotizacion) => cotizacion.precio !== null).length,
      0,
    ),
    ganadas: solicitudes.filter((solicitud) => solicitud.estado === "ganada").length,
    cerradas: solicitudes.filter((solicitud) => solicitud.estado === "ganada" || solicitud.estado === "perdida").length,
  };
}

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Valida CUIT/CUIL argentino, incluido el dígito verificador. */
export function validarCuitCuil(valor: string): boolean {
  const numero = valor.replace(/\D/g, "");
  if (!/^\d{11}$/.test(numero)) return false;
  const suma = PESOS_CUIT.reduce((total, peso, indice) => total + Number(numero[indice]) * peso, 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return Number(numero[10]) === verificador;
}

export type ReglaSeguimiento = {
  intervaloDiasHabiles: number;
  porRamo: Record<string, number>;
  esperarConFolio: boolean;
};

/** Interpreta solo las reglas explícitas admitidas; rechaza frases ambiguas. */
export function interpretarEstrategiaSeguimiento(texto: string): ReglaSeguimiento | null {
  const normal = normalizar(texto);
  const regla: ReglaSeguimiento = { intervaloDiasHabiles: 3, porRamo: {}, esperarConFolio: false };
  const general = normal.match(/cada\s+(\d+)\s+dias?\s+habil(?:es)?/);
  if (general) regla.intervaloDiasHabiles = Math.min(30, Math.max(1, Number(general[1])));
  else if (/cada\s+\d+\s+dias?/.test(normal)) return null;

  const porRamo = /para\s+(.+?)\s+cada\s+(\d+)\s+dias?(?:\s+habil(?:es)?)?(?=$|[,;.])/g;
  for (const coincidencia of normal.matchAll(porRamo)) {
    const ramo = coincidencia[1].trim().replace(/\s+/g, " ");
    regla.porRamo[ramo] = Math.min(30, Math.max(1, Number(coincidencia[2])));
  }
  if (/folio/.test(normal) && /(esperar|pausar|detener)/.test(normal)) regla.esperarConFolio = true;
  if (!general && !Object.keys(regla.porRamo).length && !regla.esperarConFolio) return null;
  return regla;
}

/** Suma días hábiles sin contar fines de semana ni feriados recibidos. */
export function sumarDiasHabiles(fecha: string, cantidad: number, feriados: string[] = []): string {
  const excluidos = new Set(feriados);
  const cursor = new Date(`${fecha}T12:00:00Z`);
  let sumados = 0;
  const direccion = cantidad < 0 ? -1 : 1;
  while (sumados < Math.abs(cantidad)) {
    cursor.setUTCDate(cursor.getUTCDate() + direccion);
    const dia = cursor.toISOString().slice(0, 10);
    const semana = cursor.getUTCDay();
    if (semana !== 0 && semana !== 6 && !excluidos.has(dia)) sumados++;
  }
  return cursor.toISOString().slice(0, 10);
}

export type CampoRiesgo = { campo: string; etiqueta: string; requerido?: boolean };
export const CAMPOS_RIESGO_POR_RAMO: Record<string, CampoRiesgo[]> = {
  Automotor: [
    { campo: "marca", etiqueta: "Marca", requerido: true },
    { campo: "modelo", etiqueta: "Modelo", requerido: true },
    { campo: "anio", etiqueta: "Año", requerido: true },
    { campo: "version", etiqueta: "Versión" },
    { campo: "uso", etiqueta: "Uso", requerido: true },
    { campo: "conductor", etiqueta: "Conductor" },
    { campo: "fechaNacimiento", etiqueta: "Fecha de nacimiento" },
    { campo: "codigoPostal", etiqueta: "Código postal", requerido: true },
    { campo: "cuitCuil", etiqueta: "CUIT/CUIL" },
    { campo: "formaDePago", etiqueta: "Forma de pago" },
  ],
  Flotas: [
    { campo: "cantidadUnidades", etiqueta: "Cantidad de unidades", requerido: true },
    { campo: "actividad", etiqueta: "Actividad", requerido: true },
    { campo: "zona", etiqueta: "Zona de circulación" },
    { campo: "cuitCuil", etiqueta: "CUIT/CUIL" },
  ],
};

export function validarDatosRiesgo(ramo: string, datos: Record<string, string>): string[] {
  const campos = CAMPOS_RIESGO_POR_RAMO[ramo] ?? [];
  const errores = campos.filter((campo) => campo.requerido && !datos[campo.campo]?.trim()).map((campo) => `Completá ${campo.etiqueta.toLowerCase()}.`);
  const cuit = datos.cuitCuil?.trim();
  if (cuit && !validarCuitCuil(cuit)) errores.push("El CUIT/CUIL no es válido.");
  if (ramo === "Automotor" && datos.anio) {
    const anio = Number(datos.anio);
    if (!Number.isInteger(anio) || anio < 1900 || anio > new Date().getFullYear() + 1) errores.push("El año del vehículo no es válido.");
  }
  return errores;
}

export type ValidacionCotizacion = { campo: string; esperado: string; recibido: string; estado: "coincide" | "diferencia" | "sin_dato" };

/** Contrasta los campos que existen tanto en la solicitud como en la respuesta; nunca infiere coincidencias cuando falta información. */
export function validarCotizacionContraSolicitud(
  pedido: Record<string, unknown>,
  respuesta: { sumaAsegurada?: number | null; coberturas?: { nombre: string; valor?: string }[]; riesgoCotizado?: Record<string, string> },
): ValidacionCotizacion[] {
  const recibido = respuesta.riesgoCotizado ?? {};
  const validaciones: ValidacionCotizacion[] = [];
  const campos = [
    ["cuitCuil", "CUIT/CUIL"], ["marca", "Marca"], ["modelo", "Modelo"],
    ["anio", "Año"], ["codigoPostal", "Código postal"],
  ] as const;
  for (const [clave, etiqueta] of campos) {
    const esperado = String(pedido[clave] ?? "").trim();
    if (!esperado) continue;
    const actual = String(recibido[clave] ?? "").trim();
    const normalizarCampo = (valor: string) => clave === "cuitCuil" ? valor.replace(/\D/g, "") : normalizar(valor);
    validaciones.push({ campo: etiqueta, esperado, recibido: actual, estado: !actual ? "sin_dato" : normalizarCampo(esperado) === normalizarCampo(actual) ? "coincide" : "diferencia" });
  }
  const sumaEsperada = Number(pedido.sumaAsegurada);
  if (Number.isFinite(sumaEsperada) && sumaEsperada > 0) {
    const actual = respuesta.sumaAsegurada;
    validaciones.push({ campo: "Suma asegurada", esperado: sumaEsperada.toLocaleString("es-AR"), recibido: actual == null ? "" : actual.toLocaleString("es-AR"), estado: actual == null ? "sin_dato" : Math.abs(actual - sumaEsperada) < 0.01 ? "coincide" : "diferencia" });
  }
  const coberturasSolicitadas = String(pedido.coberturasSolicitadas ?? "").split(/[,;\n]/).map((valor) => valor.trim()).filter(Boolean);
  if (coberturasSolicitadas.length) {
    const recibidas = new Set((respuesta.coberturas ?? []).map((cobertura) => normalizar(cobertura.nombre)));
    for (const cobertura of coberturasSolicitadas) {
      validaciones.push({ campo: `Cobertura: ${cobertura}`, esperado: cobertura, recibido: recibidas.has(normalizar(cobertura)) ? cobertura : recibidas.size ? "No figura" : "", estado: !recibidas.size ? "sin_dato" : recibidas.has(normalizar(cobertura)) ? "coincide" : "diferencia" });
    }
  }
  return validaciones;
}
