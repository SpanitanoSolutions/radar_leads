import { cronAutorizado } from "@/lib/cron";
import { procesarTrabajos } from "@/lib/ia/cola";
import { MANEJADORES } from "@/lib/ia/manejadores";

export const maxDuration = 300;

/** Red de seguridad de la cola: retoma lo que no se procesó al encolarse y los trabajos caídos. */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  return Response.json(await procesarTrabajos(MANEJADORES, { limite: 20 }));
}
