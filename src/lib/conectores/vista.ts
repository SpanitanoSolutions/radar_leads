import { companiaCanonica } from "@/lib/importacion";
import { canalesValidos, ORDEN_CANALES } from "./canales";
import { ACCION_DE } from "./permisos";
import type { Capacidad, CodigoErrorConector, TipoConector } from "./tipos";

// Lo que muestra Configuración → Conexiones con las compañías ("Pantalla
// común" de docs/specs/conectores.md). Es la misma pantalla para los tres
// agentes: cada uno ve solo sus capacidades. Puro: la pantalla le pasa lo que
// leyó de la base y del registro de conectores.

export type AgenteConector = "cotizacion" | "validador" | "siniestros";

export const AGENTES_CONECTORES: { id: AgenteConector; nombre: string; capacidades: readonly Capacidad[]; sinConexion: string }[] = [
  {
    id: "cotizacion",
    nombre: "Cotización",
    capacidades: ["cotizar", "consultarCotizacion", "obtenerCoberturas"],
    sinConexion: "el agente prepara el correo a la compañía para que lo apruebes, o cargás la cotización a mano",
  },
  {
    id: "validador",
    nombre: "Validador de pagos",
    capacidades: ["obtenerEstadoCobranza", "obtenerCuotas", "obtenerCancelaciones"],
    sinConexion: "los pagos entran por los listados que subís",
  },
  {
    id: "siniestros",
    nombre: "Siniestros",
    capacidades: ["verificarPoliza", "obtenerRequisitos", "denunciarSiniestro", "subirDocumentos", "consultarSiniestro", "descargarDocumentos"],
    sinConexion: "la denuncia y los documentos los presentás vos",
  },
];

/** `?agente=` → el agente, o null para ver los tres. */
export function agenteDe(valor: unknown): AgenteConector | null {
  return AGENTES_CONECTORES.find((a) => a.id === valor)?.id ?? null;
}

/** Las capacidades que le importan a un agente; sin agente, todas. */
export function capacidadesDelAgente(agente: AgenteConector | null): readonly Capacidad[] {
  return agente ? AGENTES_CONECTORES.find((a) => a.id === agente)!.capacidades : AGENTES_CONECTORES.flatMap((a) => a.capacidades);
}

export const TITULO_CANAL: Record<TipoConector, string> = { api: "Conexión directa", portal: "Portal de productores", archivo: "Archivo" };

export const TEXTO_CAPACIDAD: Record<Capacidad, string> = {
  cotizar: "Pedir cotizaciones",
  consultarCotizacion: "Consultar una cotización pedida",
  obtenerCoberturas: "Ver las coberturas",
  obtenerEstadoCobranza: "Leer el estado de la cobranza",
  obtenerCuotas: "Ver las cuotas de una póliza",
  obtenerCancelaciones: "Leer las anulaciones",
  verificarPoliza: "Verificar la póliza",
  obtenerRequisitos: "Ver los requisitos del siniestro",
  denunciarSiniestro: "Hacer la denuncia",
  subirDocumentos: "Subir documentos",
  consultarSiniestro: "Consultar el siniestro",
  descargarDocumentos: "Descargar documentos",
};

/** Cuándo la puede usar el agente solo (tabla "Permisos" de la spec). */
export function permisoDe(capacidad: Capacidad): string {
  const accion = ACCION_DE[capacidad];
  return accion === "leer" ? "Automático" : accion === "cotizar" ? "Al aprobar la solicitud" : "Con tu aprobación, caso por caso";
}

export const TEXTO_ERROR: Record<CodigoErrorConector, string> = {
  credencial_vencida: "rechazó el usuario y la clave",
  portal_cambiado: "cambió y no se encontró lo de siempre",
  timeout: "no respondió a tiempo",
  no_disponible: "no estaba disponible",
  requiere_dato: "pidió un dato",
  no_encontrado: "no encontró lo pedido",
  sin_permiso: "no tenía permiso",
};

export const textoError = (codigo: string | null) => (codigo && codigo in TEXTO_ERROR ? TEXTO_ERROR[codigo as CodigoErrorConector] : "falló");

// ---------- Orden de canales (conector_companias) ----------

/** Sin fila, el orden automático; con la lista vacía, solo correo o carga manual. */
export type ModoCanales = { modo: "automatico" } | { modo: "propio"; canales: TipoConector[] } | { modo: "manual" };

export function modoDeCanales(guardados: readonly string[] | undefined): ModoCanales {
  if (!guardados) return { modo: "automatico" };
  const canales = canalesValidos(guardados);
  return canales.length ? { modo: "propio", canales } : { modo: "manual" };
}

/** Los canales que van a probar los agentes, en orden, entre los que tienen conector. */
export function canalesEnUso(modo: ModoCanales, registrados: readonly TipoConector[]): TipoConector[] {
  const orden = modo.modo === "automatico" ? ORDEN_CANALES : modo.modo === "propio" ? modo.canales : [];
  return orden.filter((canal) => registrados.includes(canal));
}

export function textoModo(modo: ModoCanales): string {
  if (modo.modo === "automatico") return "Automático: conexión directa, después portal y después archivo, entre los que haya.";
  if (modo.modo === "manual") return "Solo correo o carga manual: los agentes no usan ninguna conexión automática.";
  return `${modo.canales.map((c) => TITULO_CANAL[c]).join(", después ")}. Los demás no se usan.`;
}

/**
 * Lo que mandó el formulario del orden: `null` vuelve al automático (se borra
 * la fila), `[]` es solo correo o carga manual. En "propio", cada canal tiene
 * un lugar (1, 2, 3) o queda vacío para no usarlo.
 */
export function leerOrdenCanales(entrada: { modo: string; lugares: Partial<Record<TipoConector, string>> }): { canales: TipoConector[] | null } | { error: string } {
  if (entrada.modo === "automatico") return { canales: null };
  if (entrada.modo === "manual") return { canales: [] };
  if (entrada.modo !== "propio") return { error: "Elegí cómo se conectan los agentes con la compañía." };
  const elegidos = ORDEN_CANALES.flatMap((canal) => {
    const lugar = Number(entrada.lugares[canal] || 0);
    return Number.isInteger(lugar) && lugar >= 1 && lugar <= ORDEN_CANALES.length ? [{ canal, lugar }] : [];
  });
  if (!elegidos.length) return { error: "Elegí al menos un canal con su lugar, o marcá «Solo correo o carga manual»." };
  if (new Set(elegidos.map((e) => e.lugar)).size !== elegidos.length) return { error: "Cada canal tiene que ir en un lugar distinto." };
  return { canales: elegidos.sort((a, b) => a.lugar - b.lugar).map((e) => e.canal) };
}

// ---------- Salud (conector_salud) ----------

export type SaludGuardada = {
  canal: string;
  ultimoExitoEl: Date | null;
  ultimoErrorEl: Date | null;
  codigoUltimoError: string | null;
  credencialVencida: boolean;
  portalCambiado: boolean;
  latenciaMs: number | null;
};

export type Tono = "verde" | "ambar" | "rojo" | "gris";

/**
 * Cómo anda un canal. Con la clave vencida o el portal cambiado, los agentes
 * lo saltean hasta que una prueba o una llamada salga bien.
 */
export function estadoCanal(salud: SaludGuardada | undefined): { tono: Tono; texto: string } {
  if (salud?.credencialVencida) return { tono: "rojo", texto: "Rechazó la clave: los agentes no lo usan" };
  if (salud?.portalCambiado) return { tono: "rojo", texto: "El portal cambió: los agentes no lo usan" };
  if (!salud?.ultimoExitoEl && !salud?.ultimoErrorEl) return { tono: "gris", texto: "Sin uso todavía" };
  if (salud.ultimoErrorEl && (!salud.ultimoExitoEl || salud.ultimoErrorEl > salud.ultimoExitoEl)) return { tono: "ambar", texto: "Falló la última vez" };
  return { tono: "verde", texto: "Anda bien" };
}

/**
 * El punto de la compañía en la lista. Cuenta solo los canales que usaría el
 * agente: con conector, con alguna de sus capacidades y dentro del orden.
 */
export function resumenCompania({
  modo,
  conectores,
  salud,
  agente,
}: {
  modo: ModoCanales;
  conectores: { tipo: TipoConector; capacidades: readonly Capacidad[] }[];
  salud: SaludGuardada[];
  agente: AgenteConector | null;
}): { tono: Tono; texto: string } {
  const suyas = capacidadesDelAgente(agente);
  const utiles = conectores.filter((c) => c.capacidades.some((cap) => suyas.includes(cap))).map((c) => c.tipo);
  const enUso = canalesEnUso(modo, utiles);
  if (!enUso.length) return { tono: "gris", texto: utiles.length ? "Solo correo o carga manual" : "Sin conexión automática" };
  const estados = enUso.map((canal) => estadoCanal(salud.find((s) => s.canal === canal)));
  if (estados.every((e) => e.tono === "rojo")) return { tono: "rojo", texto: "La conexión no anda" };
  if (estados.some((e) => e.tono === "rojo" || e.tono === "ambar")) return { tono: "ambar", texto: "Revisá la conexión" };
  return { tono: "verde", texto: "Conexión automática" };
}

/** Las compañías de la pantalla, por su nombre canónico, sin repetir y en orden alfabético. */
export function listaCompanias(...fuentes: Iterable<string | null | undefined>[]): string[] {
  const nombres = fuentes.flatMap((f) => [...f]).filter((n): n is string => Boolean(n?.trim())).map(companiaCanonica);
  return [...new Set(nombres)].sort((a, b) => a.localeCompare(b, "es"));
}
