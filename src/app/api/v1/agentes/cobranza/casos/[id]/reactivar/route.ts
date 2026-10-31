import { conClave, errorApi, idDeRuta } from "@/agentes/cobranza/api";
import { reactivarCaso } from "@/agentes/cobranza/casos";

/** Vuelve a la gestión un caso escalado, rechazado, excluido o en espera, desde el primer intento. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return conClave(request, async () => {
    const id = idDeRuta((await params).id);
    if (!id) return errorApi(404, "no_existe", "No existe ese caso.");
    const r = await reactivarCaso(id);
    if (r === "baja") return errorApi(409, "pidio_baja", "El asegurado pidió no recibir más mensajes: no se reactiva.");
    if (r === "no_reactivable") return errorApi(409, "no_reactivable", "El caso no existe, ya está en gestión o está pagado.");
    return Response.json({ id, estado: "pendiente" });
  });
}
