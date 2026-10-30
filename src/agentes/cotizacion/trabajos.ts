import "server-only";
import { claveManejador, type Manejadores } from "@/lib/ia/cola";
import { OPERACIONES_IA_COTIZACION } from "@/lib/cotizacion/ia";
import { manejarExtraerRespuesta } from "./ia";

/** Los trabajos de IA de Cotización en la cola ia_trabajos (ver src/lib/ia/manejadores.ts). */
export const MANEJADORES_COTIZACION: Manejadores = {
  [claveManejador("cotizacion", OPERACIONES_IA_COTIZACION.extraerRespuesta)]: ({ trabajo }) => manejarExtraerRespuesta(trabajo.entidadId),
};
