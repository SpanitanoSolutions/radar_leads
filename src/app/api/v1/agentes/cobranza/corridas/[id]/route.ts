import { conClave, errorApi, idDeRuta } from "@/agentes/cobranza/api";
import { eventosDeCorrida, obtenerCorrida } from "@/agentes/cobranza/corridas";

/** Una corrida con lo que hizo, caso por caso. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return conClave(request, async () => {
    const id = idDeRuta((await params).id);
    const corrida = id ? await obtenerCorrida(id) : null;
    if (!corrida) return errorApi(404, "no_existe", "No existe esa corrida.");
    return Response.json({ corrida, eventos: await eventosDeCorrida(corrida.id) });
  });
}
