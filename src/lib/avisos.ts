// Mensajes que se muestran después de una acción. Las acciones redirigen con
// ?aviso=<código> y la página lo muestra arriba, con role="status".

const AVISOS: Record<string, { texto: string; tono: "ok" | "info" | "error" }> = {
  "sin-contacto": { texto: "No tiene teléfono ni email: completá el contacto para poder avisarle.", tono: "error" },
  "documento-subido": { texto: "Documento guardado.", tono: "ok" },
  "documento-vacio": { texto: "Elegí un archivo para subir.", tono: "error" },
  "documento-grande": { texto: "El archivo es muy grande (máximo 5 MB).", tono: "error" },
  guardado: { texto: "Datos guardados.", tono: "ok" },
  "ejemplos-borrados": { texto: "Se borraron los datos de ejemplo. Importá tu cartera para empezar.", tono: "ok" },
  "mensaje-enviado": { texto: "Mensaje enviado.", tono: "ok" },
  "mensaje-omitido": { texto: "Omitido: no se envía nada. Sigue en seguimiento.", tono: "info" },
  "pago-confirmado": { texto: "Pago confirmado. La cuota pasó a Pagadas y la cobranza de ese cobro se cortó.", tono: "ok" },
  "pago-incompleto": { texto: "Completá la fecha de pago (hoy o antes) y el medio.", tono: "error" },
  "cuota-cerrada": { texto: "Esa cuota ya está pagada o cancelada: no hay nada que cobrar.", tono: "info" },
  "enviado-a-cobranza": { texto: "Te dejé el borrador en Cobranza → Para aprobar. No sale nada sin que lo apruebes.", tono: "ok" },
  "listado-procesado": { texto: "Listado leído con la plantilla de la compañía. Abajo ves qué encontró y las filas que no se pudieron leer.", tono: "ok" },
  "listado-para-confirmar": { texto: "Es un formato nuevo: confirmá qué dato tiene cada columna y queda guardado para la próxima.", tono: "info" },
  "listado-con-ia": { texto: "La IA está leyendo el listado. En unos minutos te queda la propuesta de columnas para confirmar.", tono: "info" },
  "plantilla-guardada": { texto: "Plantilla guardada: el listado se leyó y la próxima vez se lee sin preguntar.", tono: "ok" },
  "caso-aplicado": { texto: "Listo: la cuota quedó como la informó la compañía.", tono: "ok" },
  "caso-descartado": { texto: "Caso cerrado sin cambios en la cuota.", tono: "info" },
  "caso-no-aplicado": { texto: "No se aplicó: la cuota ya está pagada o cancelada, o el caso ya se revisó.", tono: "error" },
  "comprobante-con-ia": { texto: "La IA está leyendo el comprobante. Cuando termine, te propone el cobro para confirmar.", tono: "info" },
  "comprobante-para-completar": { texto: "Comprobante guardado. Cargá sus datos y te propongo el cobro.", tono: "info" },
  "comprobante-propuesto": { texto: "Datos guardados. Revisá el cobro propuesto y confirmalo.", tono: "ok" },
  "comprobante-ya-revisado": { texto: "Ese comprobante ya se revisó.", tono: "info" },
  "comprobante-descartado": { texto: "Comprobante descartado: no cambia ninguna cuota.", tono: "info" },
  "pedido-preparado": { texto: "Te dejé el pedido al asegurado en Cobranza, para que lo apruebes. La cobranza de esa cuota queda en pausa.", tono: "ok" },
  "recordatorio-preparado": { texto: "Recordatorio preparado. Aprobalo en Cobranza → Para aprobar.", tono: "ok" },
  "recibo-preparado": { texto: "Recibo preparado. Aprobalo en Cobranza → Para aprobar.", tono: "ok" },
  "comprobante-incompleto": { texto: "Completá la fecha y el monto del comprobante.", tono: "error" },
  "comprobante-cargado": { texto: "Comprobante cargado y revisado.", tono: "ok" },
  revisados: { texto: "Listo: el agente revisó los comprobantes pendientes.", tono: "ok" },
  "validacion-iniciada": { texto: "Listo: el validador está consultando las compañías y revisando los comprobantes. El resultado queda en Actividad.", tono: "ok" },
  "validacion-en-curso": { texto: "Ya hay una validación en curso: el resultado queda en Actividad.", tono: "ok" },
  "promesa-registrada": { texto: "Promesa de pago registrada. La secuencia queda en pausa hasta esa fecha.", tono: "ok" },
  "promesa-sin-fecha": { texto: "Elegí la fecha en que prometió pagar.", tono: "error" },
  "llamada-anotada": { texto: "Anotado. El agente te lo vuelve a proponer mañana.", tono: "info" },
  pospuesto: { texto: "Pospuesto para mañana.", tono: "info" },
  "secuencia-guardada": { texto: "Secuencia guardada.", tono: "ok" },
  "cotizacion-sin-companias": { texto: "No hay compañías configuradas para cotizar. Configurá los accesos antes de crear la solicitud.", tono: "error" },
  conectada: { texto: "El proveedor autorizo la conexion real.", tono: "ok" },
  integracion_configurar: { texto: "Faltan las credenciales OAuth del proveedor en el servidor. No se guardo como conectada.", tono: "error" },
  oauth_cancelado: { texto: "Cancelaste la autorizacion. La conexion sigue desconectada.", tono: "info" },
  oauth_estado_invalido: { texto: "No pudimos validar el retorno seguro del proveedor. Inicia de nuevo la autorizacion.", tono: "error" },
  oauth_fallo: { texto: "El proveedor rechazo la autorizacion o no respondio. La conexion sigue desconectada.", tono: "error" },
  desconectada: { texto: "Desconectada.", tono: "info" },
  "mensaje-error": { texto: "No se pudo enviar el mensaje. Probá de nuevo en un rato.", tono: "error" },
  "error-operacion": { texto: "No pudimos completar la operación por un problema inesperado. Revisá si el cambio quedó aplicado antes de volver a intentarlo.", tono: "error" },
};

export function textoAviso(codigo: string | undefined): { texto: string; tono: "ok" | "info" | "error" } | null {
  if (!codigo) return null;
  const solicitud = /^solicitud-(\d+)$/.exec(codigo);
  if (solicitud) {
    return {
      texto: `Creaste la solicitud ${solicitud[1]}. El agente intentó enviarla a las compañías configuradas; revisá el resultado en Cotización.`,
      tono: "ok",
    };
  }
  const importado = /^importado-(\d+)$/.exec(codigo);
  if (importado) {
    return {
      texto: `Cartera importada: ${importado[1] === "1" ? "1 póliza" : `${importado[1]} pólizas`}. Los vencimientos y las oportunidades ya están al día.`,
      tono: "ok",
    };
  }
  const enviados = /^enviados-(\d+)$/.exec(codigo);
  if (enviados) return { texto: `${enviados[1] === "1" ? "1 mensaje enviado" : `${enviados[1]} mensajes enviados`}.`, tono: "ok" };
  const lote = /^envios-lote-(\d+)-errores-(\d+)$/.exec(codigo);
  if (lote) {
    const enviadosTexto = `${lote[1]} ${lote[1] === "1" ? "mensaje enviado" : "mensajes enviados"}`;
    if (lote[2] === "0") return { texto: `${enviadosTexto}.`, tono: "ok" };
    return {
      texto: `${enviadosTexto}. Hubo ${lote[2]} ${lote[2] === "1" ? "error" : "errores"}; revisá qué mensajes siguen pendientes antes de volver a intentar.`,
      tono: "error",
    };
  }
  return AVISOS[codigo] ?? null;
}
