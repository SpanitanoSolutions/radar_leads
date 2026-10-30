import "server-only";
import { claveManejador, type Manejadores } from "@/lib/ia/cola";
import { OPERACIONES_IA_COTIZACION } from "@/lib/cotizacion/ia";
import { OPERACIONES_COTIZACION } from "@/lib/cotizacion/orquestador";
import { manejarExtraerRespuesta } from "./ia";
import { manejarConsultarCotizacion, manejarCotizarEnvio } from "./orquestador";

/** Los trabajos de Cotización en la cola ia_trabajos (ver src/lib/ia/manejadores.ts). */
export const MANEJADORES_COTIZACION: Manejadores = {
  [claveManejador("cotizacion", OPERACIONES_IA_COTIZACION.extraerRespuesta)]: ({ trabajo }) => manejarExtraerRespuesta(trabajo.entidadId),
  [claveManejador("cotizacion", OPERACIONES_COTIZACION.cotizarEnvio)]: ({ trabajo }) => manejarCotizarEnvio(trabajo),
  [claveManejador("cotizacion", OPERACIONES_COTIZACION.consultarCotizacion)]: ({ trabajo }) => manejarConsultarCotizacion(trabajo),
};
