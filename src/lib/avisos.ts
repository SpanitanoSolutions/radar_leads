// Mensajes que se muestran después de una acción. Las acciones redirigen con
// ?aviso=<código> y la página lo muestra arriba, con role="status".

const AVISOS: Record<string, { texto: string; tono: "ok" | "info" | "error" }> = {
  "aviso-preparado": { texto: "Aviso de vencimiento preparado. Revisalo y aprobalo en Vencimientos.", tono: "ok" },
  "sin-contacto": { texto: "No tiene teléfono ni email: completá el contacto para poder avisarle.", tono: "error" },
  "documento-subido": { texto: "Documento guardado.", tono: "ok" },
  "documento-vacio": { texto: "Elegí un archivo para subir.", tono: "error" },
  "documento-grande": { texto: "El archivo es muy grande (máximo 5 MB).", tono: "error" },
  guardado: { texto: "Datos guardados.", tono: "ok" },
  "ejemplos-borrados": { texto: "Se borraron los datos de ejemplo. Importá tu cartera para empezar.", tono: "ok" },
  "mensaje-enviado": { texto: "Mensaje enviado.", tono: "ok" },
  "mensaje-omitido": { texto: "Omitido: no se envía nada. Sigue en seguimiento.", tono: "info" },
  "pago-confirmado": { texto: "Pago confirmado. La cuota pasó a Pagados y la cobranza de ese cobro se cortó.", tono: "ok" },
  "pedido-preparado": { texto: "Te dejé el pedido al asegurado en Cobranza, para que lo apruebes. La cobranza de esa cuota queda en pausa.", tono: "ok" },
  "recordatorio-preparado": { texto: "Recordatorio preparado. Aprobalo en Cobranza → Para aprobar.", tono: "ok" },
  "recibo-preparado": { texto: "Recibo preparado. Aprobalo en Cobranza → Para aprobar.", tono: "ok" },
  "comprobante-incompleto": { texto: "Completá la fecha y el monto del comprobante.", tono: "error" },
  "comprobante-cargado": { texto: "Comprobante cargado y revisado.", tono: "ok" },
  revisados: { texto: "Listo: el agente revisó los comprobantes pendientes.", tono: "ok" },
  "promesa-registrada": { texto: "Promesa de pago registrada. La secuencia queda en pausa hasta esa fecha.", tono: "ok" },
  "promesa-sin-fecha": { texto: "Elegí la fecha en que prometió pagar.", tono: "error" },
  "llamada-anotada": { texto: "Anotado. El agente te lo vuelve a proponer mañana.", tono: "info" },
  pospuesto: { texto: "Pospuesto para mañana.", tono: "info" },
  "secuencia-guardada": { texto: "Secuencia guardada.", tono: "ok" },
  "cotizacion-sin-companias": { texto: "No hay compañías configuradas para cotizar. Configurá los accesos antes de crear la solicitud.", tono: "error" },
  conectada: { texto: "Conexión guardada. Por ahora es simulada: no se envía nada afuera.", tono: "ok" },
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
