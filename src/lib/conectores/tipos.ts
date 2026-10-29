// Conexión de UNIQO con las compañías (docs/specs/conectores.md). Un agente
// nunca sabe si el dato vino de una API, de un portal o de un archivo: todos
// los conectores devuelven estos tipos normalizados.

export type TipoConector = "api" | "portal" | "archivo";
export type Moneda = "ARS" | "USD";

export const CAPACIDADES = [
  "cotizar",
  "consultarCotizacion",
  "obtenerCoberturas",
  "obtenerEstadoCobranza",
  "obtenerCuotas",
  "obtenerCancelaciones",
  "verificarPoliza",
  "obtenerRequisitos",
  "denunciarSiniestro",
  "subirDocumentos",
  "consultarSiniestro",
  "descargarDocumentos",
] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

/** Ya descifrada. Nunca va a logs ni a la auditoría. */
export type CredencialConector = { usuario: string; secreto: string };

export type CodigoErrorConector =
  | "credencial_vencida"
  | "portal_cambiado"
  | "timeout"
  | "no_disponible"
  | "requiere_dato"
  | "no_encontrado"
  | "sin_permiso";

export type ResultadoPrueba = { ok: true; latenciaMs: number } | { ok: false; codigo: CodigoErrorConector };

/**
 * Falla de un conector. El mensaje es para el productor y no lleva datos
 * personales; la auditoría guarda solo el código. `pregunta` acompaña a
 * `requiere_dato`: lo que pidió la compañía y no está en la solicitud.
 */
export class ErrorConector extends Error {
  constructor(readonly codigo: CodigoErrorConector, mensaje: string, readonly pregunta?: string) {
    super(mensaje);
    this.name = "ErrorConector";
  }
}

// Cotización

export type SolicitudCotizacionConector = {
  /** Referencia de UNIQO (número de solicitud), para cruzar la respuesta. */
  referencia: string;
  ramo: string;
  tipo: "nueva" | "renovacion" | "mejora";
  /** Datos del riesgo con los nombres de UNIQO; el mapeo a cada compañía es cosa del conector. */
  riesgo: Record<string, string | number | null>;
  codigoPostal: string | null;
  sumaAsegurada: number | null;
  moneda: Moneda;
  vigenciaDesde: string | null;
};

export type Cobertura = { codigo: string; nombre: string; franquicia: string | null };

export type RespuestaCotizacion =
  | { estado: "pendiente"; numero: string }
  | {
      estado: "cotizada";
      numero: string;
      primaNeta: number;
      /** Lo que paga el asegurado: prima más impuestos y recargos. */
      premio: number;
      moneda: Moneda;
      coberturas: Cobertura[];
      vigencia: { desde: string; hasta: string };
      validaHasta: string;
    }
  | { estado: "rechazada"; numero: string; motivo: string };

// Validador de pagos

export type MedioPago = "debito_tarjeta" | "debito_cbu" | "pago_facil" | "rapipago" | "transferencia" | "mercadopago" | "efectivo_productor";
export type EstadoCompaniaCuota = "pendiente" | "pagada" | "vencida" | "anulada";

/** Esquema normalizado de la sección 6 de docs/specs/validador-v2.md. Fechas AAAA-MM-DD. */
export type PagoNormalizado = {
  compania: string;
  poliza: string;
  /** Ítem o unidad de la póliza; en flotas, un vehículo por ítem. */
  item: string | null;
  endoso: string | null;
  cuotaN: number;
  cuotaTotal: number;
  cupon: string | null;
  monto: number;
  moneda: Moneda;
  vencimiento: string;
  fechaPago: string | null;
  medio: MedioPago | null;
  estadoCompania: EstadoCompaniaCuota;
};

/** Misma forma: una cuota con el estado que informa la compañía. */
export type CuotaNormalizada = PagoNormalizado;

export type Cancelacion = {
  compania: string;
  poliza: string;
  item: string | null;
  fecha: string;
  motivo: "falta_de_pago" | "pedido_del_asegurado" | "otro";
};

// Siniestros

export type EstadoPoliza = {
  numero: string;
  ramo: string;
  /** `no_vigente`: la fecha consultada cae antes o después de la vigencia. */
  estado: "vigente" | "no_vigente" | "anulada";
  vigenciaDesde: string;
  vigenciaHasta: string;
  deudaVencida: boolean;
  coberturas: string[];
};

export type Requisito = { codigo: string; nombre: string; obligatorio: boolean };

export type DenunciaSiniestro = {
  referencia: string;
  poliza: string;
  item: string | null;
  /** ISO con hora. */
  fecha: string;
  tipo: string;
  lugar: string;
  relato: string;
  terceros: { patente: string | null; compania: string | null }[];
};

export type DocumentoConector = { nombre: string; tipoMime: string; contenido: Buffer };

export type ResultadoSubida = {
  recibidos: { nombre: string; referencia: string }[];
  rechazados: { nombre: string; motivo: string }[];
};

export type EstadoSiniestro = {
  numeroSiniestro: string;
  estado: "denunciado" | "en_analisis" | "requiere_documentacion" | "en_inspeccion" | "liquidado" | "rechazado";
  actualizadoEl: string;
  /** Lo que pide el liquidador, en sus palabras. */
  requerimientos: string[];
  montoLiquidado: number | null;
  moneda: Moneda | null;
};

/**
 * Las acciones que comprometen al productor (emitir, aceptar una
 * liquidación, dar conformidad, desistir, firmar, anular) no existen en esta
 * interfaz: ningún agente puede pedirlas.
 */
export interface ConectorCompania {
  readonly compania: string;
  readonly tipo: TipoConector;
  readonly capacidades: readonly Capacidad[];
  probarConexion(credencial?: CredencialConector): Promise<ResultadoPrueba>;
  // Cotización
  cotizar?(solicitud: SolicitudCotizacionConector, coberturas: string[]): Promise<RespuestaCotizacion>;
  consultarCotizacion?(numero: string): Promise<RespuestaCotizacion>;
  obtenerCoberturas?(ramo: string): Promise<Cobertura[]>;
  // Validador de pagos
  obtenerEstadoCobranza?(desde: string, hasta: string): Promise<PagoNormalizado[]>;
  obtenerCuotas?(poliza: string): Promise<CuotaNormalizada[]>;
  obtenerCancelaciones?(desde: string, hasta: string): Promise<Cancelacion[]>;
  // Siniestros
  verificarPoliza?(numero: string, fecha: string): Promise<EstadoPoliza>;
  obtenerRequisitos?(ramo: string, tipoSiniestro: string): Promise<Requisito[]>;
  denunciarSiniestro?(denuncia: DenunciaSiniestro): Promise<{ numeroSiniestro: string }>;
  subirDocumentos?(numeroSiniestro: string, documentos: DocumentoConector[]): Promise<ResultadoSubida>;
  consultarSiniestro?(numeroSiniestro: string): Promise<EstadoSiniestro>;
  descargarDocumentos?(numeroSiniestro: string): Promise<DocumentoConector[]>;
}

type Metodos = { [C in Capacidad]-?: NonNullable<ConectorCompania[C]> };
export type ArgumentosDe<C extends Capacidad> = Parameters<Metodos[C]>;
export type ResultadoDe<C extends Capacidad> = Awaited<ReturnType<Metodos[C]>>;

/** Llama una capacidad por nombre. Falla con `no_disponible` si el conector no la tiene. */
export async function llamar<C extends Capacidad>(conector: ConectorCompania, capacidad: C, argumentos: ArgumentosDe<C>): Promise<ResultadoDe<C>> {
  const metodo = conector[capacidad] as ((...args: ArgumentosDe<C>) => Promise<ResultadoDe<C>>) | undefined;
  if (!conector.capacidades.includes(capacidad) || typeof metodo !== "function") {
    throw new ErrorConector("no_disponible", `${conector.compania} no ofrece esta operación por ${conector.tipo}.`);
  }
  return metodo.apply(conector, argumentos);
}
