// Tipos de Cobranza v2 (docs/specs/cobranza-v2.md). Los usan el esquema, las
// reglas puras de src/lib/cobranza y el motor de src/agentes/cobranza.

/** Un caso es un cobro: las cuotas del mismo asegurado, compañía y vencimiento. */
export const ESTADOS_CASO = [
  "pendiente",
  "sin_respuesta",
  "respondio",
  "promesa",
  "informo_pago",
  "escalado",
  "rechazado",
  "pagado",
  "excluido",
  "sin_datos",
] as const;
export type EstadoCaso = (typeof ESTADOS_CASO)[number];

export const CANALES_COBRANZA = ["whatsapp", "email", "telefono"] as const;
export type CanalCobranza = (typeof CANALES_COBRANZA)[number];

/**
 * Tramo de seguimiento ("tier" en la spec): un rango de días para el
 * vencimiento (negativo = vencido), con los dos extremos incluidos y null
 * para "sin límite". `instrucciones` se suma al prompt del agente.
 */
export type TramoCobranza = { id: string; nombre: string; minDias: number | null; maxDias: number | null; instrucciones: string | null };

export type ConfigCanalCobranza = {
  habilitado: boolean;
  /** Cómo maneja el agente este canal; va al prompt. */
  instrucciones: string;
  /** Número o correo de salida que se muestra; el real es el de la conexión. */
  remitente: string | null;
  verificado: boolean;
};

/** Qué entra al agente. Listas vacías: todas las compañías o todos los ramos. */
export type FiltrosCobranza = { companias: string[]; ramos: string[]; montoMinimo: number | null; excluirMarcados: boolean };

export type NotificacionesCobranza = {
  alEscalar: boolean;
  alPrometer: boolean;
  resumenDiario: boolean;
  canal: "email" | "whatsapp";
  /** Vacío: el correo o el teléfono del firmante (Información). */
  destinatarios: string[];
};

export type FiltroPruebaCobranza = { tipo: "cualquiera" } | { tipo: "tramo"; tramo: string } | { tipo: "compania"; compania: string };

/** La configuración ya resuelta: cada campo con su valor o el de por defecto. */
export type ConfiguracionCobranza = {
  reglasGenerales: string;
  tramos: TramoCobranza[];
  maxIntentos: number;
  diasEntreIntentos: number;
  diasGraciaPromesa: number;
  /** Desde cuántos días antes del vencimiento se escribe por primera vez. */
  diasPrimerContacto: number;
  horaEjecucion: string;
  zonaHoraria: string;
  /** ISO: 1 = lunes … 7 = domingo. */
  diasPermitidos: number[];
  ventanaDesde: string;
  ventanaHasta: string;
  firmanteNombre: string;
  firmanteEmail: string;
  firmanteTelefono: string;
  idioma: string;
  filtros: FiltrosCobranza;
  notificaciones: NotificacionesCobranza;
  canales: Record<CanalCobranza, ConfigCanalCobranza>;
  modoPrueba: boolean;
  /** Con el modo prueba apagado, cada mensaje espera la aprobación del productor. */
  pedirAprobacion: boolean;
  prueba: { telefono: string; email: string; whatsapp: string; maxRecibos: number; filtro: FiltroPruebaCobranza };
};

export type TipoEventoCobranza =
  | "llamada_buzon"
  | "sin_respuesta"
  | "llamada_pendiente"
  | "whatsapp_enviado"
  | "whatsapp_respondido"
  | "email_enviado"
  | "email_respondido"
  | "para_aprobar"
  | "promesa"
  | "informo_pago"
  | "respondio"
  | "rechazo"
  | "baja"
  | "escalado"
  | "correo_fallido"
  | "error"
  | "pagado"
  | "reactivado"
  | "excluido"
  | "validador"
  | "nota";

export type OrigenCorridaCobranza = "cron" | "manual" | "api" | "prueba";
export type EstadoCorridaCobranza = "en_curso" | "ok" | "con_errores" | "error";

export type DetalleCorridaCobranza = {
  errores?: { casoId: number | null; mensaje: string }[];
  /** Por qué no se contactó a los que no se contactó: motivo → cantidad. */
  omitidos?: Record<string, number>;
  escalados?: number;
  /** Lo que impidió la corrida entera ("Hoy no es un día permitido"). */
  aviso?: string;
};
