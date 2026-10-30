import { SimuladaApi, type OpcionesSimuladaApi } from "./simulada-api";
import { esperar, generador, semillaDe } from "./simulacion";
import {
  CAPACIDADES,
  ErrorConector,
  type CodigoErrorConector,
  type ConectorCompania,
  type CredencialConector,
  type DenunciaSiniestro,
  type DocumentoConector,
  type SolicitudCotizacionConector,
  type TipoConector,
} from "./tipos";

type FallaPortal = Extract<CodigoErrorConector, "timeout" | "portal_cambiado" | "no_disponible" | "credencial_vencida">;

export type OpcionesSimuladaPortal = Omit<OpcionesSimuladaApi, "modo"> & {
  /** Misma semilla, mismas fallas: los tests y el E2E son reproducibles. */
  semilla?: number;
  /** Demora de cada paso: fija o un rango [mínimo, máximo]. Por defecto, entre 0,8 y 2,5 segundos. */
  demoraMs?: number | [number, number];
  /** Probabilidad de que un paso falle (por defecto 0,15). */
  probabilidadFalla?: number;
  /** Probabilidad de que cotizar pida el uso del vehículo si la solicitud no lo trae (por defecto 0,1). */
  probabilidadDatoExtra?: number;
  /** Para el E2E: falla siempre con este código, o pide siempre el dato extra. */
  forzar?: { falla?: FallaPortal; datoExtra?: boolean };
};

const FALLAS_AL_AZAR: FallaPortal[] = ["timeout", "portal_cambiado", "no_disponible"];

const MENSAJES: Record<FallaPortal, string> = {
  timeout: "El portal no respondió a tiempo.",
  portal_cambiado: "El portal cambió y el agente no encontró el formulario esperado.",
  no_disponible: "El portal está fuera de servicio.",
  credencial_vencida: "La credencial del portal venció o fue rechazada.",
};

/** Dato que el portal pide al cotizar y que el productor puede agregar a `riesgo`. */
export const DATO_EXTRA_COTIZAR = { campo: "uso", pregunta: "El portal pide el uso del vehículo: particular o comercial." } as const;

/**
 * Compañía simulada sin API: un agente con IA entra al portal. Usa los mismos
 * datos que SimuladaApi, pero cada paso tarda, a veces falla y, al cotizar, a
 * veces pide un dato que no está en la solicitud.
 */
export class SimuladaPortal implements ConectorCompania {
  readonly tipo: TipoConector = "portal";
  readonly capacidades = CAPACIDADES;
  readonly compania: string;
  private readonly datos: SimuladaApi;
  private readonly azar: () => number;
  private readonly demoraMs: number | [number, number];
  private readonly probabilidadFalla: number;
  private readonly probabilidadDatoExtra: number;
  private readonly forzar: OpcionesSimuladaPortal["forzar"];

  constructor(opciones: OpcionesSimuladaPortal) {
    this.compania = opciones.compania;
    this.datos = new SimuladaApi({ ...opciones, modo: "instantaneo" });
    this.azar = generador(opciones.semilla ?? semillaDe(`portal|${opciones.compania}`));
    this.demoraMs = opciones.demoraMs ?? [800, 2_500];
    this.probabilidadFalla = opciones.probabilidadFalla ?? 0.15;
    this.probabilidadDatoExtra = opciones.probabilidadDatoExtra ?? 0.1;
    this.forzar = opciones.forzar;
  }

  private demora() {
    if (typeof this.demoraMs === "number") return this.demoraMs;
    const [minimo, maximo] = this.demoraMs;
    return Math.round(minimo + this.azar() * (maximo - minimo));
  }

  /** Demora, después la posible falla y, al final, el trabajo real. */
  private async paso<T>(trabajo: () => Promise<T>, pedirDato?: () => boolean): Promise<T> {
    await esperar(this.demora());
    const falla = this.forzar?.falla ?? (this.azar() < this.probabilidadFalla ? FALLAS_AL_AZAR[Math.floor(this.azar() * FALLAS_AL_AZAR.length)] : null);
    if (falla) throw new ErrorConector(falla, MENSAJES[falla]);
    if (pedirDato?.()) throw new ErrorConector("requiere_dato", "El portal pidió un dato que no está en la solicitud.", DATO_EXTRA_COTIZAR.pregunta, DATO_EXTRA_COTIZAR.campo);
    return trabajo();
  }

  async probarConexion(credencial?: CredencialConector) {
    try {
      return await this.paso(() => this.datos.probarConexion(credencial));
    } catch (error) {
      if (error instanceof ErrorConector) return { ok: false as const, codigo: error.codigo };
      throw error;
    }
  }

  cotizar(solicitud: SolicitudCotizacionConector, coberturas: string[]) {
    const falta = solicitud.riesgo[DATO_EXTRA_COTIZAR.campo] == null;
    return this.paso(() => this.datos.cotizar(solicitud, coberturas),
      () => falta && (this.forzar?.datoExtra ?? this.azar() < this.probabilidadDatoExtra));
  }

  consultarCotizacion(numero: string) {
    return this.paso(() => this.datos.consultarCotizacion(numero));
  }

  obtenerCoberturas(ramo: string) {
    return this.paso(() => this.datos.obtenerCoberturas(ramo));
  }

  obtenerEstadoCobranza(desde: string, hasta: string) {
    return this.paso(() => this.datos.obtenerEstadoCobranza(desde, hasta));
  }

  obtenerCuotas(poliza: string) {
    return this.paso(() => this.datos.obtenerCuotas(poliza));
  }

  obtenerCancelaciones(desde: string, hasta: string) {
    return this.paso(() => this.datos.obtenerCancelaciones(desde, hasta));
  }

  verificarPoliza(numero: string, fecha: string) {
    return this.paso(() => this.datos.verificarPoliza(numero, fecha));
  }

  obtenerRequisitos(ramo: string, tipoSiniestro: string) {
    return this.paso(() => this.datos.obtenerRequisitos(ramo, tipoSiniestro));
  }

  denunciarSiniestro(denuncia: DenunciaSiniestro) {
    return this.paso(() => this.datos.denunciarSiniestro(denuncia));
  }

  subirDocumentos(numeroSiniestro: string, documentos: DocumentoConector[]) {
    return this.paso(() => this.datos.subirDocumentos(numeroSiniestro, documentos));
  }

  consultarSiniestro(numeroSiniestro: string) {
    return this.paso(() => this.datos.consultarSiniestro(numeroSiniestro));
  }

  descargarDocumentos(numeroSiniestro: string) {
    return this.paso(() => this.datos.descargarDocumentos(numeroSiniestro));
  }
}
