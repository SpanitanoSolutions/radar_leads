import { leerConfigCobranza } from "@/agentes/cobranza/casos";
import { ultimaCorridaCron } from "@/agentes/cobranza/corridas";
import { correrCobranza, iniciarCorrida } from "@/agentes/cobranza/motor";
import { agenteConfigurado } from "@/lib/datos-agentes";
import { cronAutorizado } from "@/lib/cron";
import { proximaPasada, tocaCorrer } from "@/lib/cobranza/programacion";

export const maxDuration = 300;

/**
 * Agente de Cobranza (ver vercel.json: pasa una vez por día a las 10:00 de
 * Argentina). Corre si el agente está activo, el día está permitido, ya es la
 * hora configurada y todavía no corrió hoy por el cron.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!(await agenteConfigurado("cobranza"))) {
    return Response.json({ desactivado: true, mensaje: "El agente de cobranza está desactivado." });
  }
  const ahora = new Date();
  const [config, ultima] = await Promise.all([leerConfigCobranza(), ultimaCorridaCron()]);
  if (!tocaCorrer(config, ultima, ahora)) {
    return Response.json({ corre: false, proxima: proximaPasada(config, ultima, ahora)?.toISOString() ?? null });
  }
  const { id, nueva } = await iniciarCorrida({ origen: "cron" });
  if (!nueva) return Response.json({ corridaId: id, estado: "en_curso" });
  return Response.json({ corridaId: id, estado: await correrCobranza(id, { origen: "cron" }, ahora) });
}
