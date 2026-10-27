import { cronAutorizado } from "@/lib/cron";
import { completarTelefonos } from "@/telefonos";

// Cada búsqueda con Claude tarda unos segundos; completarTelefonos corta antes de este límite.
export const maxDuration = 300;

/** Lo llama Vercel Cron después de la captura de leads (ver vercel.json). */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const resumen = await completarTelefonos();
  return Response.json(resumen, { status: resumen.estado === "error" ? 500 : 200 });
}
