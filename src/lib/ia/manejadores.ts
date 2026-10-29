import "server-only";
import { after } from "next/server";
import { procesarTrabajos, type Manejadores } from "./cola";
import type { DespachadorTrabajosIA } from "./registro";

/**
 * Manejadores de la cola ia_trabajos, por `agente:operacion` (ver
 * claveManejador). Cada agente agrega acá los suyos; una operación sin
 * manejador no se toma de la cola.
 */
export const MANEJADORES: Manejadores = {};

/**
 * Procesa la cola después de responder la request, así una acción que encola
 * trabajos vuelve enseguida. Se llama desde Server Actions o Route Handlers;
 * el cron /api/cron/ia-trabajos levanta lo que haya quedado.
 */
export const despachadorTrabajos: DespachadorTrabajosIA = {
  async despachar() {
    after(async () => {
      try {
        await procesarTrabajos(MANEJADORES);
      } catch {
        console.error("No se pudo procesar la cola de trabajos de IA; la retoma el cron.");
      }
    });
  },
};
