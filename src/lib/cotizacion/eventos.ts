// Los eventos de Cotización (cotizacion_eventos) en palabras del productor:
// para la actividad del detalle y la bitácora del agente.

const NOMBRES: Record<string, string> = {
  solicitud_creada: "Solicitud creada",
  solicitud_completada: "Solicitud completada",
  solicitud_actualizada: "Solicitud actualizada",
  borrador_creado: "Borrador preparado",
  borrador_aprobado: "Correo aprobado",
  borrador_omitido: "Correo omitido",
  correo_enviado: "Correo enviado",
  correo_sin_enviar: "Correo sin enviar",
  seguimiento_borrador: "Seguimiento preparado",
  seguimientos_agotados: "Seguimientos agotados",
  cotizacion_autorizada: "Aprobada para cotizar",
  cotizacion_pedida: "Cotización pedida",
  cotizacion_consultada: "Cotización consultada",
  consultas_agotadas: "Consultas agotadas",
  cotizacion_sin_confirmar: "Respuesta para confirmar",
  cotizacion_confirmada: "Respuesta confirmada",
  cotizacion_cargada: "Respuesta cargada",
  cotizacion_no_aplicada: "Respuesta no aplicada",
  cotizacion_rechazada: "Cotización rechazada",
  dato_pedido: "La compañía pide un dato",
  dato_respondido: "Dato respondido",
  paso_a_correo: "Pasó a correo",
  solo_correo: "Solo por correo",
  archivo_adjunto: "Archivo adjunto",
  archivo_cargado: "Archivo adjunto",
  propuesta_generada: "Propuesta generada",
  propuesta_aprobada: "Propuesta aprobada",
  resumen_ejecutivo_aprobado: "Resumen aprobado",
  resumen_ejecutivo_enviado: "Resumen enviado",
  resumen_ejecutivo_sin_enviar: "Resumen sin enviar",
  ia_chat: "Consulta a la IA",
  ia_correo: "Correo mejorado con IA",
  ia_extraccion: "PDF leído con IA",
};

/** "correo_enviado" → "Correo enviado". Uno desconocido, con espacios y mayúscula inicial. */
export function nombreEvento(tipo: string): string {
  const conocido = NOMBRES[tipo];
  if (conocido) return conocido;
  const texto = tipo.replaceAll("_", " ").trim();
  return texto.charAt(0).toLocaleUpperCase("es-AR") + texto.slice(1);
}
