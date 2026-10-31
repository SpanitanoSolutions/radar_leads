import { casoParaApi, conClave } from "@/agentes/cobranza/api";
import { leerConfigCobranza, sincronizarCasos } from "@/agentes/cobranza/casos";
import { diaLocal, listarCasos } from "@/agentes/cobranza/datos";
import { leerPaginacion } from "@/lib/cobranza/api";

/** Todo lo que evalúa el agente, excluidos y sin datos incluidos, con por qué hoy le escribe o no. */
export async function GET(request: Request) {
  return conClave(request, async () => {
    const { pagina, porPagina } = leerPaginacion(new URL(request.url).searchParams);
    const config = await leerConfigCobranza();
    const hoy = diaLocal(config)(new Date());
    await sincronizarCasos(hoy, config);
    const casos = await listarCasos(new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`));
    return Response.json({
      datos: casos.slice((pagina - 1) * porPagina, pagina * porPagina).map((k) => casoParaApi(k, config, hoy)),
      pagina,
      porPagina,
      total: casos.length,
    });
  });
}
