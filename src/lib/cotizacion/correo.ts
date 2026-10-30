export const ASUNTO_POR_DEFECTO = "SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]";
export const CUERPO_POR_DEFECTO = "Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}.";

export type DatosBorradorSolicitud = {
  /** De `cotizacion_config`; si faltan, se usan los textos por defecto. */
  plantillaAsunto?: string | null;
  plantillaCuerpo?: string | null;
  instruccionesCuerpo?: string | null;
  aseguradora: { nombre: string; asunto?: string | null; instrucciones?: string | null; codigoProductor?: string | null };
  solicitud: { ramo: string; cliente: string; datosRiesgo?: Record<string, string | number | boolean | null> };
  /** Nombre del productor y de la organización, de los ajustes de la cuenta. */
  cuenta: { productor: string | null; organizacion: string | null };
};

/**
 * Arma el asunto y el cuerpo del borrador que se le pide a cada compañía. El cuerpo es la
 * plantilla, después las instrucciones fijas de la configuración y al final las de la
 * aseguradora. Si falta el nombre del productor se usa el de la organización, y al revés.
 */
export function armarBorradorSolicitud(datos: DatosBorradorSolicitud): { asunto: string; cuerpo: string } {
  const { aseguradora, solicitud } = datos;
  const productor = datos.cuenta.productor?.trim() || datos.cuenta.organizacion?.trim() || "";
  const organizacion = datos.cuenta.organizacion?.trim() || datos.cuenta.productor?.trim() || "";

  const asunto = (aseguradora.asunto?.trim() || datos.plantillaAsunto?.trim() || ASUNTO_POR_DEFECTO)
    .replaceAll("[RAMO]", solicitud.ramo).replaceAll("[CLIENTE]", solicitud.cliente)
    .replaceAll("[ASEGURADORA]", aseguradora.nombre).replaceAll("[CLAVE]", aseguradora.codigoProductor?.trim() ?? "")
    // Sin clave de productor, el asunto no termina en un guion suelto.
    .replace(/(\s*–\s*)+$/, "").trim();

  const valores: Record<string, string> = {
    productor,
    organizacion,
    aseguradora: aseguradora.nombre,
    cliente: solicitud.cliente,
    cuit: String(solicitud.datosRiesgo?.cuitCuil ?? ""),
    ramo: solicitud.ramo,
    moneda: "ARS",
    forma_de_pago: String(solicitud.datosRiesgo?.formaDePago ?? "a convenir"),
  };
  let cuerpo = [datos.plantillaCuerpo?.trim() || CUERPO_POR_DEFECTO, datos.instruccionesCuerpo?.trim(), aseguradora.instrucciones?.trim()]
    .filter(Boolean).join("\n\n");
  for (const [clave, valor] of Object.entries(valores)) cuerpo = cuerpo.replaceAll(`{${clave}}`, valor);
  return { asunto, cuerpo };
}

// ---------- El correo aprobado, por la salida común ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A quién va el correo: el primer contacto de la compañía con una dirección válida. */
export function destinatarioCotizacion(contactos: { email?: string | null }[]): string | null {
  return contactos.map((contacto) => contacto.email?.trim() ?? "").find((email) => EMAIL.test(email)) ?? null;
}

/** Por qué no salió un correo aprobado, en palabras del productor, con lo que tiene que hacer. */
export function motivoSinEnviar(
  error: string,
  destinatario: string | null,
  faltaDestinatario = "falta el correo de la compañía (cargalo en la Configuración de Cotización)",
): string {
  const sinGmail = /^Gmail (no está conectado|necesita autorización)/.test(error);
  const faltas = [
    sinGmail ? "tu correo no está conectado (conectalo en Configuración → Conexiones)" : null,
    destinatario ? null : faltaDestinatario,
  ].filter(Boolean);
  if (faltas.length) return `No salió: ${faltas.join(" y ")}. Después tocá “Enviar ahora”.`;
  return "No salió: el correo no se pudo enviar. Probá “Enviar ahora” en un rato.";
}

/**
 * Cómo queda el envío cuando el correo sale. Un seguimiento suma uno y, al
 * llegar al máximo, pasa a requerir atención y no se programan más.
 */
export function estadoTrasEnvio(envio: { estado: string; cantidadSeguimientos: number }, maximoSeguimientos: number): {
  estado: "enviado" | "en_seguimiento" | "requiere_atencion";
  cantidadSeguimientos: number;
  programarSeguimiento: boolean;
} {
  if (envio.estado !== "en_seguimiento") return { estado: "enviado", cantidadSeguimientos: envio.cantidadSeguimientos, programarSeguimiento: true };
  const cantidadSeguimientos = envio.cantidadSeguimientos + 1;
  const agotados = cantidadSeguimientos >= maximoSeguimientos;
  return { estado: agotados ? "requiere_atencion" : "en_seguimiento", cantidadSeguimientos, programarSeguimiento: !agotados };
}
