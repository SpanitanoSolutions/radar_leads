import { casoParaApi, conClave, errorApi } from "@/agentes/cobranza/api";
import { leerConfigCobranza, sincronizarCasos } from "@/agentes/cobranza/casos";
import { diaLocal, listarCasos } from "@/agentes/cobranza/datos";
import { normalizar } from "@/fuentes/clasificacion";
import { leerPaginacion } from "@/lib/cobranza/api";
import { pestanaDe, PESTANAS } from "@/lib/cobranza/estados";
import { ESTADOS_CASO } from "@/lib/cobranza/tipos";

/**
 * Los casos, como en el tablero. Filtros: pestana (activos, sin_datos o
 * excluidos), estado, compania y q (asegurado, póliza o recibo); paginados
 * con pagina y porPagina.
 */
export async function GET(request: Request) {
  return conClave(request, async () => {
    const p = new URL(request.url).searchParams;
    const pestana = p.get("pestana") ?? "activos";
    if (!PESTANAS.some((x) => x.id === pestana && x.id !== "aprobar")) return errorApi(400, "dato_invalido", "pestana tiene que ser activos, sin_datos o excluidos.");
    const estado = p.get("estado");
    if (estado && !ESTADOS_CASO.includes(estado as never)) return errorApi(400, "dato_invalido", `estado tiene que ser uno de: ${ESTADOS_CASO.join(", ")}.`);
    const compania = p.get("compania");
    const q = normalizar(p.get("q") ?? "");
    const { pagina, porPagina } = leerPaginacion(p);

    const config = await leerConfigCobranza();
    const dia = diaLocal(config);
    const hoy = dia(new Date());
    await sincronizarCasos(hoy, config);
    const casos = (await listarCasos(new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`)))
      .filter((k) => pestanaDe(k, hoy.slice(0, 7), dia) === pestana)
      .filter((k) => !estado || k.estado === estado)
      .filter((k) => !compania || k.compania === compania)
      .filter((k) => !q || [k.asegurado.nombre, k.polizaNumero, k.recibo].some((v) => v && normalizar(v).includes(q)));
    return Response.json({
      datos: casos.slice((pagina - 1) * porPagina, pagina * porPagina).map((k) => casoParaApi(k, config, hoy)),
      pagina,
      porPagina,
      total: casos.length,
    });
  });
}
