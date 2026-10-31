import { diasEntre, sumarDias } from "@/lib/fechas";
import { companiaCanonica } from "@/lib/importacion";
import { ramoCanonico } from "@/lib/ramos";
import { enZona } from "@/lib/validador/programacion";
import { CONTACTABLES } from "./estados";
import type { CanalCobranza, ConfiguracionCobranza, EstadoCaso, FiltrosCobranza } from "./tipos";

// Reglas duras del Agente de Cobranza. Se aplican en código antes de cada
// herramienta (y antes de llamar a la IA): el prompt las repite, pero no
// depende de que la IA las cumpla.

export type MotivoOmision = "estado" | "no_contactar" | "borrador" | "promesa" | "max_intentos" | "espera" | "temprano" | "sin_canal";

export const TEXTO_OMISION: Record<MotivoOmision, string> = {
  estado: "su estado no permite contactarlo",
  no_contactar: "está marcado para no contactar",
  borrador: "tiene un mensaje esperando tu aprobación",
  promesa: "tiene una promesa de pago vigente",
  max_intentos: "llegó al máximo de intentos",
  espera: "se lo contactó hace pocos días",
  temprano: "todavía falta para el primer contacto",
  sin_canal: "no tiene un canal habilitado con sus datos",
};

export type CasoParaReglas = {
  estado: EstadoCaso;
  intentos: number;
  ultimoContactoEl: Date | null;
  promesaEl: string | null;
  diasParaVencer: number;
  noContactar: boolean;
  borradorPendiente: boolean;
};

/** El día local (AAAA-MM-DD) de un instante, en la zona de la configuración. */
export const diaEnZona = (fecha: Date, zona: string) => enZona(fecha, zona).dia;

/** Null si hoy se le puede escribir; si no, por qué no. */
export function motivoParaNoContactar(caso: CasoParaReglas, config: ConfiguracionCobranza, hoy: string): MotivoOmision | null {
  if (!CONTACTABLES.includes(caso.estado)) return "estado";
  if (caso.noContactar) return "no_contactar";
  if (caso.borradorPendiente) return "borrador";
  if (caso.estado === "promesa" && caso.promesaEl && hoy <= sumarDias(caso.promesaEl, config.diasGraciaPromesa)) return "promesa";
  if (caso.intentos >= config.maxIntentos) return "max_intentos";
  if (caso.ultimoContactoEl && diasEntre(diaEnZona(caso.ultimoContactoEl, config.zonaHoraria), hoy) < config.diasEntreIntentos) return "espera";
  if (caso.diasParaVencer > config.diasPrimerContacto) return "temprano";
  return null;
}

/** La promesa ya pasó, con los días de gracia incluidos: el agente vuelve a escribir. */
export function promesaVencida(caso: Pick<CasoParaReglas, "estado" | "promesaEl">, config: ConfiguracionCobranza, hoy: string): boolean {
  return caso.estado === "promesa" && Boolean(caso.promesaEl) && hoy > sumarDias(caso.promesaEl!, config.diasGraciaPromesa);
}

/** Llegó al máximo de intentos sin respuesta y el último ya tuvo su tiempo: se escala al productor. */
export function debeEscalarPorIntentos(caso: Pick<CasoParaReglas, "estado" | "intentos" | "ultimoContactoEl">, config: ConfiguracionCobranza, hoy: string): boolean {
  if (caso.estado !== "sin_respuesta" || caso.intentos < config.maxIntentos) return false;
  return !caso.ultimoContactoEl || diasEntre(diaEnZona(caso.ultimoContactoEl, config.zonaHoraria), hoy) >= config.diasEntreIntentos;
}

/** ISO: 1 = lunes … 7 = domingo. */
export function diaIso(dia: string): number {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Los días y la ventana horaria valen solo en modo real: en modo prueba los
 * mensajes van a los destinos de prueba y se puede probar a cualquier hora.
 */
export function motivoDelMomento(config: ConfiguracionCobranza, ahora: Date): "dia" | "horario" | null {
  if (config.modoPrueba) return null;
  const local = enZona(ahora, config.zonaHoraria);
  if (!config.diasPermitidos.includes(diaIso(local.dia))) return "dia";
  if (local.hora < config.ventanaDesde || local.hora >= config.ventanaHasta) return "horario";
  return null;
}

export const TEXTO_MOMENTO = {
  dia: "Hoy no es un día permitido para contactar (Configuración → Horario).",
  horario: "Está fuera de la ventana de contacto (Configuración → Horario).",
};

// ---------- Contacto, canales y destinos ----------

export type AseguradoParaContacto = {
  tipo: "persona" | "empresa";
  telefono: string | null;
  email: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
};

/** En empresas se escribe primero al contacto de administración; en personas, al titular. */
export function contactoParaCobranza(a: AseguradoParaContacto): { telefono: string | null; email: string | null } {
  const limpio = (v: string | null) => v?.trim() || null;
  return a.tipo === "empresa"
    ? { telefono: limpio(a.contactoTelefono) ?? limpio(a.telefono), email: limpio(a.contactoEmail) ?? limpio(a.email) }
    : { telefono: limpio(a.telefono) ?? limpio(a.contactoTelefono), email: limpio(a.email) ?? limpio(a.contactoEmail) };
}

const datoDelCanal = (canal: CanalCobranza, c: { telefono: string | null; email: string | null }) => (canal === "email" ? c.email : c.telefono);

/**
 * Los canales por los que se le puede escribir: habilitados en la
 * configuración y con el dato del asegurado (también en modo prueba, para que
 * la prueba muestre lo mismo que pasaría de verdad).
 */
export function canalesDisponibles(contacto: { telefono: string | null; email: string | null }, config: ConfiguracionCobranza): CanalCobranza[] {
  return (["whatsapp", "email", "telefono"] as const).filter((c) => config.canales[c].habilitado && Boolean(datoDelCanal(c, contacto)));
}

/** WhatsApp primero (prioridad de la spec); a las empresas, el correo. */
export function canalPreferido(tipo: "persona" | "empresa", disponibles: CanalCobranza[]): CanalCobranza | null {
  const orden: CanalCobranza[] = tipo === "empresa" ? ["email", "whatsapp", "telefono"] : ["whatsapp", "email", "telefono"];
  return orden.find((c) => disponibles.includes(c)) ?? null;
}

/**
 * A dónde va de verdad: el dato del asegurado o, en modo prueba, el destino
 * de prueba. En modo prueba sin destino cargado, `para` es null y el envío se
 * simula.
 */
export function destinoDe(canal: CanalCobranza, contacto: { telefono: string | null; email: string | null }, config: ConfiguracionCobranza): { para: string | null; prueba: boolean } {
  if (!config.modoPrueba) return { para: datoDelCanal(canal, contacto), prueba: false };
  const p = config.prueba;
  const para = canal === "email" ? p.email : canal === "whatsapp" ? p.whatsapp || p.telefono : p.telefono;
  return { para: para.trim() || null, prueba: true };
}

// ---------- Sincronización con la cartera ----------

export type CobroParaSincronizar = {
  compania: string | null;
  ramos: string[];
  monto: number;
  pagado: boolean;
  /** Todas sus cuotas las anuló la compañía. */
  cancelado: boolean;
  /** Todas sus pólizas se dieron de baja (al reemplazar la cartera). */
  polizaDeBaja: boolean;
  tieneContacto: boolean;
  noContactar: "manual" | "baja" | null;
};

export type CasoParaSincronizar = { estado: EstadoCaso; motivo: string | null; incluirIgual: boolean; intentos: number };

/** Por qué los filtros dejan afuera este cobro; null si entra. */
export function motivoExclusion(cobro: Pick<CobroParaSincronizar, "compania" | "ramos" | "monto" | "noContactar">, filtros: FiltrosCobranza): string | null {
  if (cobro.noContactar === "baja") return "Pidió no recibir más mensajes.";
  if (filtros.excluirMarcados && cobro.noContactar === "manual") return "Lo marcaste para no contactar.";
  if (filtros.companias.length) {
    const incluidas = new Set(filtros.companias.map(companiaCanonica));
    if (!cobro.compania || !incluidas.has(companiaCanonica(cobro.compania))) return `La compañía ${cobro.compania ?? "(sin compañía)"} no está entre las incluidas.`;
  }
  if (filtros.ramos.length) {
    const incluidos = new Set(filtros.ramos.map(ramoCanonico));
    const afuera = cobro.ramos.filter((r) => !incluidos.has(ramoCanonico(r)));
    if (afuera.length === cobro.ramos.length) return `El ramo ${afuera.join(", ")} no está entre los incluidos.`;
  }
  if (filtros.montoMinimo !== null && cobro.monto < filtros.montoMinimo) return "El monto es menor al mínimo configurado.";
  return null;
}

/** Estados que la sincronización puede mover (los demás los decidió el agente o el productor). */
const AUTOMATICOS: EstadoCaso[] = ["pendiente", "sin_respuesta", "excluido", "sin_datos"];

/**
 * El estado que le corresponde a un caso según la cartera y los filtros, o
 * null si queda como está. Un caso nuevo (`caso` null) siempre devuelve uno.
 */
export function estadoSincronizado(cobro: CobroParaSincronizar, caso: CasoParaSincronizar | null, filtros: FiltrosCobranza): { estado: EstadoCaso; motivo: string | null } | null {
  const actual = caso ?? { estado: "pendiente" as EstadoCaso, motivo: null, incluirIgual: false, intentos: 0 };
  const cambio = (estado: EstadoCaso, motivo: string | null) => (caso && caso.estado === estado && caso.motivo === motivo ? null : { estado, motivo });
  const enGestion = actual.intentos > 0 ? "sin_respuesta" : "pendiente";

  if (cobro.pagado) return actual.estado === "pagado" ? (caso ? null : { estado: "pagado", motivo: null }) : { estado: "pagado", motivo: null };
  if (actual.estado === "pagado") return { estado: enGestion, motivo: "El recibo volvió a figurar impago en la cartera." };
  if (!AUTOMATICOS.includes(actual.estado)) return caso ? null : { estado: actual.estado, motivo: actual.motivo };
  if (cobro.cancelado) return cambio("excluido", "La compañía anuló el recibo.");
  if (cobro.polizaDeBaja) return cambio("excluido", "La póliza está dada de baja en la cartera.");
  const exclusion = motivoExclusion(cobro, filtros);
  if (exclusion && (cobro.noContactar === "baja" || !actual.incluirIgual)) return cambio("excluido", exclusion);
  if (!cobro.tieneContacto) return cambio("sin_datos", null);
  if (actual.estado === "excluido" || actual.estado === "sin_datos") return { estado: enGestion, motivo: null };
  return caso ? null : { estado: "pendiente", motivo: null };
}
