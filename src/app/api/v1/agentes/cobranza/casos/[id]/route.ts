import { casoParaApi, conClave, errorApi, idDeRuta } from "@/agentes/cobranza/api";
import { leerConfigCobranza } from "@/agentes/cobranza/casos";
import { diaLocal, eventosDelCaso, obtenerCaso } from "@/agentes/cobranza/datos";

/** Un caso con su línea de tiempo (la actividad, lo más nuevo primero). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return conClave(request, async () => {
    const id = idDeRuta((await params).id);
    const caso = id ? await obtenerCaso(id) : null;
    if (!caso) return errorApi(404, "no_existe", "No existe ese caso.");
    const config = await leerConfigCobranza();
    return Response.json({ caso: casoParaApi(caso, config, diaLocal(config)(new Date())), actividad: await eventosDelCaso(caso.id) });
  });
}
