import { generarBorradores } from "@/agentes/cobranza";
import { diaEnArgentina } from "@/lib/fechas";
import { cronAutorizado } from "@/lib/cron";

/**
 * Lo llama Vercel Cron cada mañana a las 9 (hora argentina), ver vercel.json.
 * Prepara los mensajes de cobranza del día; solo envía los pasos marcados
 * como automáticos en la secuencia.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const ahora = new Date();
  const resultado = await generarBorradores(diaEnArgentina(ahora), ahora);
  return Response.json(resultado);
}
