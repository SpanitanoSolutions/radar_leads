import { conClave, cuerpoJson, errorApi } from "@/agentes/cobranza/api";
import { procesarEntrante } from "@/agentes/cobranza/entrantes";

export const maxDuration = 60;

/**
 * Un WhatsApp del asegurado: { de, texto }. El agente lo procesa con el flujo
 * "Respuesta entrante" y contesta por el mismo canal si hace falta.
 */
export async function POST(request: Request) {
  return conClave(request, async () => {
    const cuerpo = await cuerpoJson(request);
    if (cuerpo instanceof Response) return cuerpo;
    const { de, texto } = (cuerpo ?? {}) as { de?: unknown; texto?: unknown };
    if (typeof de !== "string" || !de.trim()) return errorApi(400, "dato_invalido", "Falta de: el número de quien escribe.");
    if (typeof texto !== "string" || !texto.trim()) return errorApi(400, "dato_invalido", "Falta texto: lo que escribió.");
    const r = await procesarEntrante({ canal: "whatsapp", de: de.trim().slice(0, 200), texto: texto.slice(0, 10_000) });
    return Response.json(r, { status: r.estado === "procesado" ? 200 : 404 });
  });
}
