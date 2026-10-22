import { boletinOficial } from "./boletin-oficial/captura";
import {
  borrarEjemplosSiHayReales,
  guardarLeads,
  registrarCaptura,
  versionAnterior,
} from "./guardar";
import { licitaciones } from "./licitaciones/captura";
import type { Fuente } from "./tipos";

// Habilitaciones municipales y búsquedas laborales no tienen captura: el
// municipio publica las habilitaciones sin razón social ni CUIT, y los
// portales de empleo no permiten la extracción automática (ver README).
export const FUENTES_DE_CAPTURA: Fuente[] = [licitaciones, boletinOficial];

export type ResumenCaptura = {
  fuente: string;
  estado: "ok" | "sin-novedades" | "error";
  nuevos: number;
  detalle: string;
  ejemplosBorrados: number;
};

/**
 * Corre una fuente: trae lo publicado desde la última versión procesada,
 * guarda los leads que no estaban y, si ya hay leads reales, borra los de
 * ejemplo. Un error queda registrado y no frena a las otras fuentes.
 */
export async function ejecutarCaptura(fuente: Fuente): Promise<ResumenCaptura> {
  try {
    const resultado = await fuente.capturar(await versionAnterior(fuente.id));
    if (!resultado) {
      await registrarCaptura(fuente.id, { nuevos: 0 });
      return {
        fuente: fuente.id,
        estado: "sin-novedades",
        nuevos: 0,
        detalle: "La fuente no publicó nada nuevo.",
        ejemplosBorrados: await borrarEjemplosSiHayReales(),
      };
    }
    const nuevos = await guardarLeads(resultado.leads);
    await registrarCaptura(fuente.id, { version: resultado.version, nuevos });
    return {
      fuente: fuente.id,
      estado: "ok",
      nuevos,
      detalle: resultado.detalle,
      ejemplosBorrados: await borrarEjemplosSiHayReales(),
    };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error(`Captura ${fuente.id}:`, err);
    await registrarCaptura(fuente.id, { nuevos: 0, error: mensaje }).catch(() => {});
    return { fuente: fuente.id, estado: "error", nuevos: 0, detalle: mensaje, ejemplosBorrados: 0 };
  }
}

export function buscarFuente(id: string): Fuente | undefined {
  return FUENTES_DE_CAPTURA.find((f) => f.id === id);
}
