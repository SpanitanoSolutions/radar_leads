import { extractText, getDocumentProxy } from "unpdf";
import { esperar, pedir } from "../descargas";
import type { Fuente, LeadCapturado } from "../tipos";
import { leadsDeBoletin, leerEdiciones, URL_BOLETIN } from "./parser";

/** En la primera ejecución alcanza con la última semana hábil. */
const EDICIONES_MAXIMAS = 5;

async function textoDePdf(url: string): Promise<string> {
  const datos = new Uint8Array(await (await pedir(url, { timeoutMs: 90_000 })).arrayBuffer());
  const pdf = await getDocumentProxy(datos);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.join("\n");
}

export const boletinOficial: Fuente = {
  id: "boletin-oficial",
  nombre: "Boletín Oficial de la Provincia",

  async capturar(versionAnterior) {
    const html = await (await pedir(`${URL_BOLETIN}/ediciones-anteriores`)).text();
    const ultima = Number(versionAnterior ?? 0);
    const pendientes = leerEdiciones(html)
      .filter((e) => e.numero > ultima)
      .slice(0, EDICIONES_MAXIMAS)
      .reverse(); // de la más vieja a la más nueva
    if (pendientes.length === 0) return null;

    // Las transferencias se publican cinco días seguidos: queda la primera aparición.
    const porClave = new Map<string, LeadCapturado>();
    for (const [i, edicion] of pendientes.entries()) {
      if (i > 0) await esperar(2_000); // un PDF por vez, sin apurar al servidor
      for (const lead of leadsDeBoletin(await textoDePdf(edicion.urlOficial), edicion)) {
        if (!porClave.has(lead.clave)) porClave.set(lead.clave, lead);
      }
    }
    const leads = [...porClave.values()];

    const procesadas = pendientes.map((e) => `N° ${e.numero} (${e.fecha})`).join(", ");
    return {
      leads,
      version: String(pendientes.at(-1)!.numero),
      detalle: `Ediciones ${procesadas}: ${leads.length} sociedades nuevas y transferencias.`,
    };
  },
};
