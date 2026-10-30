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

/**
 * Lo que hace siempre una compañía simulada, para que el E2E y las pruebas no
 * dependan del azar (CONECTORES_SIMULADOS_FORZAR).
 */
export type ForzadoSimulado = {
  /** El portal falla siempre: está fuera de servicio. */
  falla?: boolean;
  /** El portal pide el uso del vehículo al cotizar, mientras la solicitud no lo traiga. */
  dato?: boolean;
  /** El portal nunca falla ni pide datos por azar. */
  ok?: boolean;
  /** La conexión directa cotiza en dos pasos: da un número y la cotización llega al consultarla. */
  dosPasos?: boolean;
};

const VALORES_FORZADOS: Record<string, keyof ForzadoSimulado> = { falla: "falla", dato: "dato", ok: "ok", dos_pasos: "dosPasos" };

/** El nombre de la compañía sin mayúsculas, acentos ni espacios de más. */
export function claveCompania(compania: string): string {
  return compania.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** "Federación Patronal=falla;Rivadavia=dato,dos_pasos" → lo forzado por compañía. Lo que no se entiende se ignora. */
export function leerForzados(texto: string | undefined): Map<string, ForzadoSimulado> {
  const forzados = new Map<string, ForzadoSimulado>();
  for (const parte of (texto ?? "").split(";")) {
    const [nombre, valores = ""] = parte.split("=");
    const compania = claveCompania(nombre ?? "");
    const forzado: ForzadoSimulado = {};
    for (const valor of valores.split(",")) {
      const clave = VALORES_FORZADOS[valor.trim().toLowerCase()];
      if (clave) forzado[clave] = true;
    }
    if (compania && Object.keys(forzado).length) forzados.set(compania, { ...forzados.get(compania), ...forzado });
  }
  return forzados;
}

function opcionesDelPortal(forzado: ForzadoSimulado | undefined): Partial<OpcionesSimuladaPortal> {
  if (forzado?.falla) return { forzar: { falla: "no_disponible" } };
  if (forzado?.dato) return { probabilidadFalla: 0, forzar: { datoExtra: true } };
  if (forzado?.ok) return { probabilidadFalla: 0, probabilidadDatoExtra: 0 };
  return {};
}

export type OpcionesSimulacion = {
  api?: Omit<OpcionesSimuladaApi, "compania">;
  portal?: Omit<OpcionesSimuladaPortal, "compania">;
  /** Por compañía (con claveCompania()): lo que hace siempre. */
  forzar?: Map<string, ForzadoSimulado>;
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
      const forzado = opciones.forzar?.get(claveCompania(compania));
      conectores = [
        new SimuladaApi({ ...opciones.api, compania, ...(forzado?.dosPasos ? { modo: "dos_pasos" as const } : {}) }),
        new SimuladaPortal({ ...opciones.portal, compania, ...opcionesDelPortal(forzado) }),
      ];
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

export const registroConectores: RegistroConectores = simulacionHabilitada()
  ? crearRegistroSimulado({ forzar: leerForzados(process.env.CONECTORES_SIMULADOS_FORZAR) })
  : new RegistroConectores();
