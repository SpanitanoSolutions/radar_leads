import { buscarFuente, ejecutarCaptura } from "@/fuentes";
import { cronAutorizado } from "@/lib/cron";

// Las descargas grandes (COMPR.AR) y la lectura de PDFs pueden tardar.
export const maxDuration = 300;

/** Lo llama Vercel Cron cada madrugada (ver vercel.json). */
export async function GET(request: Request, ctx: RouteContext<"/api/cron/captura/[fuente]">) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const { fuente: id } = await ctx.params;
  const fuente = buscarFuente(id);
  if (!fuente) return Response.json({ error: `No existe la fuente "${id}"` }, { status: 404 });

  const resumen = await ejecutarCaptura(fuente);
  return Response.json(resumen, { status: resumen.estado === "error" ? 500 : 200 });
}
