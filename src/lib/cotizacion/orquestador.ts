import type { IntentoEnvio } from "@/db/schema";
import type { ResultadoCanales } from "@/lib/conectores/canales";
import type { CodigoErrorConector, Moneda, RespuestaCotizacion, SolicitudCotizacionConector, TipoConector } from "@/lib/conectores/tipos";
import { fechaCorta } from "@/lib/fechas";
import { ramoCanonico } from "@/lib/ramos";

// El orquestador de Cotización (fase 6 de docs/specs/cotizacion-v2.md): por
// cada compañía prueba sus canales automáticos con ejecutarEnCompania() y, si
// ninguno sirve, queda el correo para aprobar. Acá está lo que no toca la
// base: qué se le pide a la compañía y qué se hace con lo que responde.

export const OPERACIONES_COTIZACION = { cotizarEnvio: "cotizar_envio", consultarCotizacion: "consultar_cotizacion" } as const;

/** Tipo de evento que deja la autorización de cotizar (al aprobar o con "Cotizar automáticamente"). */
export const EVENTO_AUTORIZACION = "cotizacion_autorizada";

/** Cómo se nombra cada canal en pantalla. */
export const NOMBRE_CANAL: Record<TipoConector | "correo", string> = {
  api: "conexión directa",
  portal: "portal",
  archivo: "archivo",
  correo: "correo",
};

/** Para la columna Canal: "Conexión directa", "Portal", "Correo" o "—". */
export function etiquetaCanal(canal: string | null): string {
  if (!canal || !(canal in NOMBRE_CANAL)) return "—";
  const nombre = NOMBRE_CANAL[canal as TipoConector | "correo"];
  return nombre[0].toUpperCase() + nombre.slice(1);
}

/** "La conexión directa de Sancor", "El portal de Rivadavia". */
export function canalDe(canal: TipoConector, compania: string): string {
  const articulo = canal === "api" ? "La" : "El";
  return `${articulo} ${NOMBRE_CANAL[canal]} de ${compania}`;
}

const TIPOS_CONECTOR: Record<string, SolicitudCotizacionConector["tipo"]> = { renovacion: "renovacion", mejora: "mejora" };

/** "12.000.000", "1500000,50" o 1500000 → número; si no se puede leer, null. */
export function numeroDe(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null;
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[\s$]/g, "");
  const texto = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio) ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(",", ".");
  const numero = Number(texto);
  return texto && Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** La solicitud con los nombres de UNIQO: el mapeo a cada compañía es cosa del conector. */
export function solicitudParaConector(solicitud: {
  numero: number;
  ramo: string;
  tipo: string;
  datosRiesgo: Record<string, string | number | boolean | null>;
}): SolicitudCotizacionConector {
  const riesgo = Object.fromEntries(Object.entries(solicitud.datosRiesgo).map(([campo, valor]) => [
    campo,
    typeof valor === "boolean" ? (valor ? "sí" : "no") : valor,
  ])) as Record<string, string | number | null>;
  const codigoPostal = solicitud.datosRiesgo.codigoPostal;
  const vigencia = solicitud.datosRiesgo.vigenciaDesde;
  return {
    referencia: String(solicitud.numero),
    ramo: ramoCanonico(solicitud.ramo),
    tipo: TIPOS_CONECTOR[solicitud.tipo] ?? "nueva",
    riesgo,
    codigoPostal: codigoPostal == null || codigoPostal === "" ? null : String(codigoPostal),
    sumaAsegurada: numeroDe(solicitud.datosRiesgo.sumaAsegurada),
    moneda: solicitud.datosRiesgo.moneda === "USD" ? "USD" : "ARS",
    vigenciaDesde: typeof vigencia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(vigencia) ? vigencia : null,
  };
}

/** Lo que dijo cada canal, para `cotizacion_envios.intentos`. */
export function intentosDeEnvio(r: ResultadoCanales<RespuestaCotizacion>, fecha: string): IntentoEnvio[] {
  return r.intentos.map((intento, indice): IntentoEnvio => {
    const ultimo = indice === r.intentos.length - 1;
    if (intento.resultado === "ok" && r.ok && ultimo) {
      return { canal: intento.canal, resultado: r.valor.estado, detalle: r.valor.estado === "rechazada" ? r.valor.motivo : null, fecha };
    }
    if (intento.codigoError === "requiere_dato" && !r.ok && r.motivo === "requiere_dato" && ultimo) {
      return { canal: intento.canal, resultado: "requiere_dato", codigo: "requiere_dato", campo: r.campo ?? campoDePregunta(r.pregunta), detalle: r.pregunta, fecha };
    }
    return { canal: intento.canal, resultado: "error", codigo: intento.codigoError, fecha };
  });
}

/** Un nombre para guardar la respuesta cuando el conector no dice qué campo pidió. */
export function campoDePregunta(pregunta: string): string {
  const slug = pregunta.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "");
  return `dato_${slug || "pedido"}`;
}

const MOTIVO_FALLA: Partial<Record<CodigoErrorConector, string>> = {
  timeout: "no respondió a tiempo",
  no_disponible: "no está disponible",
  portal_cambiado: "cambió y el agente no encontró el formulario",
  credencial_vencida: "rechazó tu usuario y clave",
  sin_permiso: "no tenía tu autorización para cotizar",
  no_encontrado: "no encontró el pedido",
};

/** "El portal de Federación Patronal no está disponible." Sin intentos, null. */
export function textoFallas(compania: string, r: ResultadoCanales<unknown>): string | null {
  const fallas = r.intentos.filter((intento) => intento.resultado === "error");
  if (!fallas.length) return null;
  const partes = fallas.map((intento, indice) => {
    const motivo = (intento.codigoError && MOTIVO_FALLA[intento.codigoError]) ?? "falló";
    return indice === 0 ? `${canalDe(intento.canal, compania)} ${motivo}` : `${articuloDe(intento.canal)} ${NOMBRE_CANAL[intento.canal]} ${motivo}`;
  });
  return `${partes.join(" y ")}.`;
}

const articuloDe = (canal: TipoConector) => (canal === "api" ? "la" : "el");

export type ResultadoNormalizado = {
  precio: number;
  primaNeta: number;
  impuestos: number;
  moneda: Moneda;
  franquicia: string | null;
  vigencia: string;
  condiciones: string;
  coberturas: { nombre: string; valor?: string; incluida: boolean }[];
};

/** La cotización de un conector con el mismo formato que una carga manual: la prima total es lo que paga el asegurado. */
export function normalizarCotizada(respuesta: Extract<RespuestaCotizacion, { estado: "cotizada" }>): ResultadoNormalizado {
  const redondear = (monto: number) => Math.round(monto * 100) / 100;
  return {
    precio: respuesta.premio,
    primaNeta: respuesta.primaNeta,
    impuestos: redondear(Math.max(0, respuesta.premio - respuesta.primaNeta)),
    moneda: respuesta.moneda,
    franquicia: respuesta.coberturas.find((cobertura) => cobertura.franquicia)?.franquicia ?? null,
    vigencia: `${fechaCorta(respuesta.vigencia.desde)} al ${fechaCorta(respuesta.vigencia.hasta)}`,
    condiciones: `Cotización ${respuesta.numero}, válida hasta el ${fechaCorta(respuesta.validaHasta)}.`,
    coberturas: respuesta.coberturas.map((cobertura) => ({
      nombre: cobertura.nombre,
      ...(cobertura.franquicia ? { valor: `Franquicia ${cobertura.franquicia}` } : {}),
      incluida: true,
    })),
  };
}

export type DecisionCotizacion =
  | { tipo: "cotizada"; canal: TipoConector; numero: string; resultado: ResultadoNormalizado }
  | { tipo: "pendiente"; canal: TipoConector; numero: string }
  | { tipo: "rechazada"; canal: TipoConector; numero: string; motivo: string }
  | { tipo: "requiere_dato"; canal: TipoConector; pregunta: string; campo: string }
  /** Ningún canal automático sirvió: queda el correo. `error` es null si no había ninguno. */
  | { tipo: "correo"; error: string | null };

/** Qué hacer con lo que devolvió ejecutarEnCompania() al cotizar o consultar. */
export function decidirCotizacion(compania: string, r: ResultadoCanales<RespuestaCotizacion>): DecisionCotizacion {
  if (r.ok) {
    const respuesta = r.valor;
    if (respuesta.estado === "cotizada") return { tipo: "cotizada", canal: r.canal, numero: respuesta.numero, resultado: normalizarCotizada(respuesta) };
    if (respuesta.estado === "pendiente") return { tipo: "pendiente", canal: r.canal, numero: respuesta.numero };
    return { tipo: "rechazada", canal: r.canal, numero: respuesta.numero, motivo: respuesta.motivo };
  }
  if (r.motivo === "requiere_dato") return { tipo: "requiere_dato", canal: r.canal, pregunta: r.pregunta, campo: r.campo ?? campoDePregunta(r.pregunta) };
  return { tipo: "correo", error: textoFallas(compania, r) };
}

/** El texto del evento y de la actividad para cada decisión. `proximaConsulta`: "04/11/2026". */
export function textoDecision(compania: string, decision: DecisionCotizacion, { proximaConsulta }: { proximaConsulta?: string } = {}): string {
  switch (decision.tipo) {
    case "cotizada":
      return `${compania} cotizó por ${NOMBRE_CANAL[decision.canal]}. La respuesta espera tu confirmación.`;
    case "pendiente":
      return `Se pidió la cotización a ${compania} por ${NOMBRE_CANAL[decision.canal]} (número ${decision.numero}). ${proximaConsulta ? `El agente la consulta el ${proximaConsulta}.` : "El agente la consulta según la estrategia de seguimiento."}`;
    case "rechazada":
      return `${compania} no cotiza por ${NOMBRE_CANAL[decision.canal]}: ${decision.motivo}`;
    case "requiere_dato":
      return `${canalDe(decision.canal, compania)} pide un dato que no está en la solicitud: ${decision.pregunta} Respondelo en Contactos y el agente vuelve a cotizar.`;
    case "correo":
      return decision.error
        ? `${decision.error.replace(/\.$/, "")}; se preparó el correo para aprobar.`
        : `No hay conexión automática disponible con ${compania}: queda el correo para aprobar.`;
  }
}

type EnvioParaCotizar = { estado: string; estadoBorrador: string };

/** Si "Aprobar y cotizar" lo incluye: todavía no salió por ningún canal y el productor no omitió su correo. */
export function elegibleParaCotizar(envio: EnvioParaCotizar): boolean {
  return envio.estado === "pendiente" && envio.estadoBorrador === "pendiente";
}

/** Si el trabajo de cotizar todavía tiene sentido: nadie aprobó el correo mientras tanto y no hay otro pedido en curso. */
export function puedeCotizarse(envio: EnvioParaCotizar, solicitud: { estado: string; completadoEl: Date | null }): boolean {
  return envio.estado === "pendiente" && envio.estadoBorrador !== "aprobado" && !["ganada", "perdida"].includes(solicitud.estado) && !solicitud.completadoEl;
}

/** Si una consulta más supera el máximo de seguimientos de la configuración. */
export function agotoConsultas(cantidadSeguimientos: number, maximo: number): boolean {
  return cantidadSeguimientos + 1 >= maximo;
}

/** El último dato que pidió la compañía y todavía espera respuesta. */
export function datoPedido(envio: { estado: string; intentos: IntentoEnvio[] }): { campo: string; pregunta: string } | null {
  if (envio.estado !== "requiere_atencion") return null;
  const ultimo = envio.intentos.at(-1);
  if (ultimo?.resultado !== "requiere_dato") return null;
  const pregunta = ultimo.detalle ?? "La compañía pidió un dato que falta.";
  return { campo: ultimo.campo ?? campoDePregunta(pregunta), pregunta };
}

/** La respuesta del productor a lo que pidió la compañía: texto corto, sin saltos de línea. */
export function respuestaValida(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, " ").trim().slice(0, 200);
  return limpio || null;
}

export type EstadoVisible = { texto: string; detalle: string | null };

/** Qué ve el productor en Contactos para cada compañía. */
export function estadoEnvioVisible(
  envio: { estado: string; estadoBorrador: string; canalUsado: string | null; numeroCompania: string | null; ultimoError: string | null; preguntasPendientes: string | null; intentos: IntentoEnvio[] },
  { cotizando = false, resultado }: { cotizando?: boolean; resultado?: { confirmado: boolean } } = {},
): EstadoVisible {
  const canal = envio.canalUsado && envio.canalUsado in NOMBRE_CANAL ? NOMBRE_CANAL[envio.canalUsado as TipoConector | "correo"] : null;
  if (cotizando) return { texto: "Cotizando por conexión directa o portal…", detalle: null };
  if (resultado && !resultado.confirmado) return { texto: canal ? `Cotizó por ${canal}` : "Respondió", detalle: "Falta tu confirmación en Cotizaciones." };
  if (envio.estado === "cotizado") return { texto: canal ? `Cotizado por ${canal}` : "Cotizado", detalle: null };
  if (envio.estado === "rechazado") {
    const motivo = [...envio.intentos].reverse().find((intento) => intento.resultado === "rechazada")?.detalle ?? null;
    return { texto: "Rechazada", detalle: motivo };
  }
  if (envio.estado === "requiere_atencion") return { texto: "Requiere atención", detalle: envio.preguntasPendientes ?? envio.ultimoError };
  if (envio.estado === "enviado" && canal && envio.canalUsado !== "correo") {
    return { texto: `Pedida por ${canal}`, detalle: envio.numeroCompania ? `Esperando la cotización número ${envio.numeroCompania}.` : "Esperando la cotización." };
  }
  if (envio.estado === "enviado") return { texto: "Enviado por correo", detalle: null };
  if (envio.estado === "en_seguimiento") return { texto: "En seguimiento", detalle: envio.estadoBorrador === "aprobado" ? envio.ultimoError : null };
  if (envio.estado === "error") return { texto: "Error", detalle: envio.ultimoError };
  if (envio.estadoBorrador === "aprobado") return { texto: "Correo aprobado, sin enviar", detalle: envio.ultimoError };
  return { texto: "Pendiente", detalle: envio.ultimoError };
}
