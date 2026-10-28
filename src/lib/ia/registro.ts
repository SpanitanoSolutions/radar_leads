import type { ProveedorIA } from "./index";

/**
 * Runtime-neutral registry for application agents. Provider IDs and model IDs
 * are supplied by agent configuration; no provider or model is selected here.
 */
export type ConfiguracionModeloIA = {
  proveedor: string;
  modelo: string;
};

export type FabricaProveedorIA = (configuracion: ConfiguracionModeloIA) => ProveedorIA;

export class RegistroProveedoresIA {
  private readonly fabricas = new Map<string, FabricaProveedorIA>();

  registrar(proveedor: string, fabrica: FabricaProveedorIA): void {
    this.fabricas.set(proveedor.trim().toLocaleLowerCase("es"), fabrica);
  }

  resolver(configuracion: ConfiguracionModeloIA | null | undefined): ProveedorIA | null {
    if (!configuracion?.proveedor.trim() || !configuracion.modelo.trim()) return null;
    const fabrica = this.fabricas.get(configuracion.proveedor.trim().toLocaleLowerCase("es"));
    return fabrica?.(configuracion) ?? null;
  }
}

export const registroProveedoresIA = new RegistroProveedoresIA();

/** Scheduler adapters can be supplied by deployment without coupling jobs to a hosting vendor. */
export interface DespachadorTrabajosIA {
  despachar(trabajoId: number): Promise<void>;
}

export type EstadoTrabajoIA = "pendiente_configuracion" | "pendiente" | "procesando" | "completado" | "error";
