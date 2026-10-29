import { diaEnArgentina } from "@/lib/fechas";
import {
  cancelacionesDe,
  carteraDeEjemplo,
  coberturasDe,
  cotizacionSimulada,
  cuotasDe,
  estadoPolizaDe,
  generador,
  pdfSimple,
  prefijoDe,
  requisitosDe,
  semillaDe,
  type PolizaSimulada,
} from "./simulacion";
import {
  CAPACIDADES,
  ErrorConector,
  type Cancelacion,
  type Cobertura,
  type ConectorCompania,
  type CredencialConector,
  type CuotaNormalizada,
  type DenunciaSiniestro,
  type DocumentoConector,
  type EstadoPoliza,
  type EstadoSiniestro,
  type PagoNormalizado,
  type Requisito,
  type RespuestaCotizacion,
  type ResultadoPrueba,
  type ResultadoSubida,
  type SolicitudCotizacionConector,
  type TipoConector,
} from "./tipos";

export type OpcionesSimuladaApi = {
  compania: string;
  /** `dos_pasos`: cotizar devuelve un número pendiente y la cotización llega al consultarla. */
  modo?: "instantaneo" | "dos_pasos";
  /** Pólizas que conoce la compañía. Por defecto, una cartera de ejemplo. El seed y el E2E pasan las suyas. */
  cartera?: PolizaSimulada[];
  /** Día de hoy (AAAA-MM-DD) en Argentina. */
  hoy?: () => string;
};

const ETAPAS_SINIESTRO = ["denunciado", "en_analisis", "requiere_documentacion", "en_inspeccion", "liquidado"] as const;

type SiniestroSimulado = {
  denuncia: DenunciaSiniestro;
  etapa: (typeof ETAPAS_SINIESTRO)[number];
  consultas: number;
  documentos: number;
  /** Documentos que había cuando el liquidador pidió más. */
  documentosAlPedir: number;
};

const FORMATOS_ADMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const MAXIMO_BYTES = 10 * 1024 * 1024;

const REQUERIMIENTOS_LIQUIDADOR = ["Presupuesto de reparación firmado", "Fotos del bien con la patente o la dirección visible"];

/**
 * Compañía simulada con API: responde al instante (o en dos pasos para
 * cotizar) y tiene todas las capacidades. Guarda en memoria lo que se le
 * cotiza y denuncia, así cada consulta avanza el trámite.
 */
export class SimuladaApi implements ConectorCompania {
  readonly tipo: TipoConector = "api";
  readonly capacidades = CAPACIDADES;
  readonly compania: string;
  private readonly modo: "instantaneo" | "dos_pasos";
  private readonly carteraFija?: PolizaSimulada[];
  private readonly hoy: () => string;
  private readonly cotizaciones = new Map<string, RespuestaCotizacion>();
  private readonly siniestros = new Map<string, SiniestroSimulado>();
  private secuencia: number;

  constructor(opciones: OpcionesSimuladaApi) {
    this.compania = opciones.compania;
    this.modo = opciones.modo ?? "instantaneo";
    this.carteraFija = opciones.cartera;
    this.hoy = opciones.hoy ?? (() => diaEnArgentina(new Date()));
    this.secuencia = 100_000 + Math.floor(generador(semillaDe(`secuencia|${this.compania}`))() * 800_000);
  }

  private cartera() {
    return this.carteraFija ?? carteraDeEjemplo(this.compania, this.hoy());
  }

  private numero(tipo: "COT" | "SIN") {
    this.secuencia++;
    return `${prefijoDe(this.compania)}-${tipo}-${this.secuencia}`;
  }

  private items(poliza: string) {
    const items = this.cartera().filter((item) => item.numero === poliza);
    if (!items.length) throw new ErrorConector("no_encontrado", `${this.compania} no encuentra la póliza.`);
    return items;
  }

  private todasLasCuotas() {
    return this.cartera().flatMap((poliza) => cuotasDe(this.compania, poliza, this.hoy()).cuotas);
  }

  async probarConexion(credencial?: CredencialConector): Promise<ResultadoPrueba> {
    if (credencial?.secreto === "vencida") return { ok: false, codigo: "credencial_vencida" };
    return { ok: true, latenciaMs: 120 };
  }

  async cotizar(solicitud: SolicitudCotizacionConector, coberturas: string[]): Promise<RespuestaCotizacion> {
    const numero = this.numero("COT");
    const respuesta = cotizacionSimulada(this.compania, solicitud, coberturas, numero, this.hoy());
    this.cotizaciones.set(numero, respuesta);
    return this.modo === "dos_pasos" && respuesta.estado === "cotizada" ? { estado: "pendiente", numero } : respuesta;
  }

  async consultarCotizacion(numero: string): Promise<RespuestaCotizacion> {
    const cotizacion = this.cotizaciones.get(numero);
    if (!cotizacion) throw new ErrorConector("no_encontrado", `${this.compania} no encuentra esa cotización.`);
    return cotizacion;
  }

  async obtenerCoberturas(ramo: string): Promise<Cobertura[]> {
    return coberturasDe(ramo);
  }

  /** Cuotas que vencen o se pagaron en el período. */
  async obtenerEstadoCobranza(desde: string, hasta: string): Promise<PagoNormalizado[]> {
    const enPeriodo = (fecha: string | null) => fecha !== null && fecha >= desde && fecha <= hasta;
    return this.todasLasCuotas().filter((cuota) => enPeriodo(cuota.vencimiento) || enPeriodo(cuota.fechaPago));
  }

  async obtenerCuotas(poliza: string): Promise<CuotaNormalizada[]> {
    return this.items(poliza).flatMap((item) => cuotasDe(this.compania, item, this.hoy()).cuotas);
  }

  async obtenerCancelaciones(desde: string, hasta: string): Promise<Cancelacion[]> {
    return cancelacionesDe(this.compania, this.cartera(), this.hoy()).filter((cancelacion) => cancelacion.fecha >= desde && cancelacion.fecha <= hasta);
  }

  async verificarPoliza(numero: string, fecha: string): Promise<EstadoPoliza> {
    return estadoPolizaDe(this.compania, this.items(numero), fecha.slice(0, 10), this.hoy());
  }

  async obtenerRequisitos(_ramo: string, tipoSiniestro: string): Promise<Requisito[]> {
    return requisitosDe(tipoSiniestro);
  }

  async denunciarSiniestro(denuncia: DenunciaSiniestro): Promise<{ numeroSiniestro: string }> {
    this.items(denuncia.poliza);
    const numeroSiniestro = this.numero("SIN");
    this.siniestros.set(numeroSiniestro, { denuncia, etapa: "denunciado", consultas: 0, documentos: 0, documentosAlPedir: 0 });
    return { numeroSiniestro };
  }

  private siniestro(numero: string) {
    const siniestro = this.siniestros.get(numero);
    if (!siniestro) throw new ErrorConector("no_encontrado", `${this.compania} no encuentra ese siniestro.`);
    return siniestro;
  }

  async subirDocumentos(numeroSiniestro: string, documentos: DocumentoConector[]): Promise<ResultadoSubida> {
    const siniestro = this.siniestro(numeroSiniestro);
    const resultado: ResultadoSubida = { recibidos: [], rechazados: [] };
    for (const documento of documentos) {
      if (!FORMATOS_ADMITIDOS.includes(documento.tipoMime)) resultado.rechazados.push({ nombre: documento.nombre, motivo: "Formato no admitido: subilo en PDF, JPG o PNG." });
      else if (documento.contenido.length > MAXIMO_BYTES) resultado.rechazados.push({ nombre: documento.nombre, motivo: "Supera los 10 MB que acepta la compañía." });
      else {
        siniestro.documentos++;
        resultado.recibidos.push({ nombre: documento.nombre, referencia: `${numeroSiniestro}-DOC-${siniestro.documentos}` });
      }
    }
    return resultado;
  }

  /**
   * Cada consulta (salvo la primera) avanza una etapa: denunciado → en
   * análisis → el liquidador pide documentación → inspección → liquidado. Del
   * pedido de documentación sale recién cuando se suben documentos nuevos.
   */
  async consultarSiniestro(numeroSiniestro: string): Promise<EstadoSiniestro> {
    const siniestro = this.siniestro(numeroSiniestro);
    if (siniestro.consultas > 0) this.avanzar(siniestro);
    siniestro.consultas++;
    const liquidado = siniestro.etapa === "liquidado";
    return {
      numeroSiniestro,
      estado: siniestro.etapa,
      actualizadoEl: this.hoy(),
      requerimientos: siniestro.etapa === "requiere_documentacion" ? REQUERIMIENTOS_LIQUIDADOR : [],
      montoLiquidado: liquidado ? 150_000 + (semillaDe(numeroSiniestro) % 900_000) : null,
      moneda: liquidado ? "ARS" : null,
    };
  }

  private avanzar(siniestro: SiniestroSimulado) {
    if (siniestro.etapa === "requiere_documentacion" && siniestro.documentos <= siniestro.documentosAlPedir) return;
    const siguiente = ETAPAS_SINIESTRO[Math.min(ETAPAS_SINIESTRO.indexOf(siniestro.etapa) + 1, ETAPAS_SINIESTRO.length - 1)];
    if (siguiente === "requiere_documentacion") siniestro.documentosAlPedir = siniestro.documentos;
    siniestro.etapa = siguiente;
  }

  async descargarDocumentos(numeroSiniestro: string): Promise<DocumentoConector[]> {
    this.siniestro(numeroSiniestro);
    return [{
      nombre: `Constancia de denuncia ${numeroSiniestro}.pdf`,
      tipoMime: "application/pdf",
      contenido: pdfSimple(`${this.compania} - Constancia de denuncia del siniestro ${numeroSiniestro} (simulado)`),
    }];
  }
}
