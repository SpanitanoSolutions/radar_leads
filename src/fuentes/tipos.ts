import type { NuevoLead } from "@/db/schema";

/** Lead listo para guardar. Siempre trae su clave, que evita cargarlo dos veces. */
export type LeadCapturado = Omit<
  NuevoLead,
  "id" | "estado" | "nota" | "recordatorio" | "esEjemplo" | "detectadoEl" | "actualizadoEl" | "clave"
> & { clave: string };

export type ResultadoCaptura = {
  leads: LeadCapturado[];
  /** Versión de los datos procesados; la próxima ejecución la recibe para saltear lo ya visto. */
  version: string | null;
  /** Resumen para el registro de la ejecución. */
  detalle: string;
};

export type Fuente = {
  id: string;
  nombre: string;
  /** Devuelve null si la fuente no publicó nada nuevo desde `versionAnterior`. */
  capturar(versionAnterior: string | null): Promise<ResultadoCaptura | null>;
};
