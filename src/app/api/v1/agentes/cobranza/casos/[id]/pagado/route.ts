import { conClave, errorApi, idDeRuta } from "@/agentes/cobranza/api";
import { obtenerCaso } from "@/agentes/cobranza/datos";
import { confirmarCobro } from "@/agentes/cobros";

/** Marca el recibo como pagado: las cuotas del cobro quedan pagadas y el caso se cierra. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return conClave(request, async () => {
    const id = idDeRuta((await params).id);
    const caso = id ? await obtenerCaso(id) : null;
    if (!caso) return errorApi(404, "no_existe", "No existe ese caso.");
    if (caso.estado === "pagado") return errorApi(409, "ya_pagado", "El caso ya está pagado.");
    await confirmarCobro(caso.cuotaId, { medio: "Marcado como pagado por la API", origen: "manual" });
    return Response.json({ id: caso.id, estado: "pagado" });
  });
}
