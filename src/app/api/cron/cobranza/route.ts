import { leerConfigCobranza, sincronizarCasos } from "@/agentes/cobranza/casos";
import { agenteConfigurado } from "@/lib/datos-agentes";
import { diaEnArgentina } from "@/lib/fechas";
import { cronAutorizado } from "@/lib/cron";

/** Lo llama Vercel Cron (ver vercel.json). Pone los casos de Cobranza al día con la cartera. */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!(await agenteConfigurado("cobranza"))) {
    return Response.json({ desactivado: true, mensaje: "El agente de cobranza está desactivado." });
  }
  const resultado = await sincronizarCasos(diaEnArgentina(new Date()), await leerConfigCobranza());
  return Response.json(resultado);
}
