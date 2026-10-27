import { cronAutorizado } from "@/lib/cron";
import { enviarResumenDeHoy } from "@/resumen";

/** Lo llama Vercel Cron cada mañana a las 8 (hora argentina), ver vercel.json. */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await enviarResumenDeHoy();
  return Response.json(resultado, { status: resultado.errores.length ? 500 : 200 });
}
