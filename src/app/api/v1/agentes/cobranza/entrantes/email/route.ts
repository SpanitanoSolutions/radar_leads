import { conClave, cuerpoJson, errorApi } from "@/agentes/cobranza/api";
import { procesarEntrante } from "@/agentes/cobranza/entrantes";

export const maxDuration = 60;

/**
 * Un correo del asegurado: { de, asunto?, texto }. Si el asunto trae la
 * referencia "C-<id>", va directo a ese caso. Contesta por correo si hace falta.
 */
export async function POST(request: Request) {
  return conClave(request, async () => {
    const cuerpo = await cuerpoJson(request);
    if (cuerpo instanceof Response) return cuerpo;
    const { de, texto, asunto } = (cuerpo ?? {}) as { de?: unknown; texto?: unknown; asunto?: unknown };
    if (typeof de !== "string" || !de.trim()) return errorApi(400, "dato_invalido", "Falta de: el correo de quien escribe.");
    if (typeof texto !== "string" || !texto.trim()) return errorApi(400, "dato_invalido", "Falta texto: lo que escribió.");
    const r = await procesarEntrante({ canal: "email", de: de.trim().slice(0, 200), texto: texto.slice(0, 10_000), asunto: typeof asunto === "string" ? asunto.slice(0, 300) : null });
    return Response.json(r, { status: r.estado === "procesado" ? 200 : 404 });
  });
}
