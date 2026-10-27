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
  "mensaje-omitido": { texto: "Omitido: no se envía nada.", tono: "info" },
  "mensaje-error": { texto: "No se pudo enviar el mensaje. Probá de nuevo en un rato.", tono: "error" },
};

export function textoAviso(codigo: string | undefined): { texto: string; tono: "ok" | "info" | "error" } | null {
  if (!codigo) return null;
  const solicitud = /^solicitud-(\d+)$/.exec(codigo);
  if (solicitud) {
    return {
      texto: `Creaste la solicitud ${solicitud[1]}. El agente de cotización ya les pidió precio a las compañías.`,
      tono: "ok",
    };
  }
  const enviados = /^enviados-(\d+)$/.exec(codigo);
  if (enviados) return { texto: `${enviados[1] === "1" ? "1 mensaje enviado" : `${enviados[1]} mensajes enviados`}.`, tono: "ok" };
  return AVISOS[codigo] ?? null;
}
