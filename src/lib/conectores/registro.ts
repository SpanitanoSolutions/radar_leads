import { SimuladaApi, type OpcionesSimuladaApi } from "./simulada-api";
import { SimuladaPortal, type OpcionesSimuladaPortal } from "./simulada-portal";
import type { ConectorCompania } from "./tipos";

/** Devuelve los conectores de una compañía; puede devolver ninguno. */
export type FabricaConectores = (compania: string) => ConectorCompania[];

/**
 * Conectar una compañía real es registrar su fábrica acá, sin tocar los
 * agentes. Sin conectores, los agentes caen al canal manual.
 */
export class RegistroConectores {
  private readonly fabricas: FabricaConectores[] = [];

  registrar(fabrica: FabricaConectores): void {
    this.fabricas.push(fabrica);
  }

  conectoresPara(compania: string): ConectorCompania[] {
    return this.fabricas.flatMap((fabrica) => fabrica(compania));
  }
}

export type OpcionesSimulacion = {
  api?: Omit<OpcionesSimuladaApi, "compania">;
  portal?: Omit<OpcionesSimuladaPortal, "compania">;
};

/**
 * Cada compañía con una SimuladaApi y una SimuladaPortal, para el seed, los
 * tests y el E2E. Las instancias se reutilizan por compañía, así lo que se
 * cotiza o denuncia se puede consultar después (en memoria, por proceso).
 */
export function crearRegistroSimulado(opciones: OpcionesSimulacion = {}): RegistroConectores {
  const registro = new RegistroConectores();
  const porCompania = new Map<string, ConectorCompania[]>();
  registro.registrar((compania) => {
    let conectores = porCompania.get(compania);
    if (!conectores) {
      conectores = [new SimuladaApi({ ...opciones.api, compania }), new SimuladaPortal({ ...opciones.portal, compania })];
      porCompania.set(compania, conectores);
    }
    return conectores;
  });
  return registro;
}

/** Los simulados se prenden solo con CONECTORES_SIMULADOS=1 y nunca en producción. */
export function simulacionHabilitada(entorno: Record<string, string | undefined> = process.env): boolean {
  return entorno.CONECTORES_SIMULADOS === "1" && entorno.VERCEL_ENV !== "production";
}

export const registroConectores: RegistroConectores = simulacionHabilitada() ? crearRegistroSimulado() : new RegistroConectores();
