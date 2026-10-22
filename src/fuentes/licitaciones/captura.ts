import { filasCsv } from "../csv";
import { pedir, textoEnPedazos, versionDeArchivo } from "../descargas";
import type { Fuente, LeadCapturado } from "../tipos";
import {
  adjudicacionALead,
  agruparPorProceso,
  inicioVentana,
  leerAdjudicacion,
  leerConvocatoria,
  proveedorBonaerense,
  URL_ADJUDICACIONES,
  URL_CONVOCATORIAS,
  URL_SIPRO,
  type Adjudicacion,
  type Convocatoria,
  type Proveedor,
} from "./comprar";

// Los archivos pesan 12, 88 y 55 MB y se publican cada algunos meses: se
// descargan solo cuando cambia el de adjudicaciones, y se recorren en streaming.
const DESCARGA_LARGA = 240_000;

async function* filasDe(url: string) {
  yield* filasCsv(textoEnPedazos(await pedir(url, { timeoutMs: DESCARGA_LARGA })));
}

export const licitaciones: Fuente = {
  id: "licitaciones",
  nombre: "Licitaciones adjudicadas (COMPR.AR)",

  async capturar(versionAnterior) {
    const version = await versionDeArchivo(URL_ADJUDICACIONES);
    if (version && version === versionAnterior) return null;

    // 1. Empresas con domicilio en la provincia, según el padrón de proveedores.
    const proveedores = new Map<string, Proveedor>();
    for await (const fila of filasDe(URL_SIPRO)) {
      const p = proveedorBonaerense(fila);
      if (p) proveedores.set(p.cuit, p);
    }

    // 2. Sus adjudicaciones recientes.
    const desde = inicioVentana(new Date());
    const recientes: Adjudicacion[] = [];
    let ultimaFecha = "";
    for await (const fila of filasDe(URL_ADJUDICACIONES)) {
      const adj = leerAdjudicacion(fila);
      if (!adj) continue;
      if (adj.fecha > ultimaFecha) ultimaFecha = adj.fecha;
      if (adj.fecha >= desde && proveedores.has(adj.cuit)) recientes.push(adj);
    }
    const adjudicaciones = agruparPorProceso(recientes);

    // 3. Qué se licitó, para el motivo y para saber si es transporte u obra.
    const procesos = new Set(adjudicaciones.map((a) => a.proceso));
    const convocatorias = new Map<string, Convocatoria>();
    for await (const fila of filasDe(URL_CONVOCATORIAS)) {
      const c = leerConvocatoria(fila);
      if (c && procesos.has(c[0])) convocatorias.set(c[0], c[1]);
    }

    const leads: LeadCapturado[] = [];
    for (const adj of adjudicaciones) {
      const lead = adjudicacionALead(adj, proveedores.get(adj.cuit)!, convocatorias.get(adj.proceso));
      if (lead) leads.push(lead);
    }

    return {
      leads,
      version,
      detalle:
        `${adjudicaciones.length} adjudicaciones a empresas bonaerenses desde ${desde}, ` +
        `${leads.length} superan el monto mínimo. Última adjudicación publicada: ${ultimaFecha || "—"}.`,
    };
  },
};
