import "server-only";
import { claveManejador, type Manejadores } from "@/lib/ia/cola";
import { manejarExtraerComprobante } from "./comprobantes";
import { manejarExtraerListado, manejarMapearListado } from "./fuentes";
import { OPERACIONES_IA } from "./ia";

/** Los trabajos de IA del Validador en la cola ia_trabajos (ver src/lib/ia/manejadores.ts). */
export const MANEJADORES_VALIDADOR: Manejadores = {
  [claveManejador("validador", OPERACIONES_IA.extraerListado)]: ({ trabajo }) => manejarExtraerListado(trabajo.entidadId),
  [claveManejador("validador", OPERACIONES_IA.mapear)]: ({ trabajo }) => manejarMapearListado(trabajo.entidadId),
  [claveManejador("validador", OPERACIONES_IA.extraerComprobante)]: ({ trabajo }) =>
    manejarExtraerComprobante(trabajo.entidadId, { orgId: trabajo.orgId, producerId: trabajo.producerId }),
};
