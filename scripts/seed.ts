/**
 * Carga sectores, ajustes iniciales y leads de ejemplo.
 * Se puede correr varias veces: no pisa la configuración que ya guardó el
 * productor y reemplaza solo los leads marcados como ejemplo.
 *
 *   npm run db:seed              # respeta la configuración guardada
 *   npm run db:seed -- --reset   # además vuelve sectores y zonas a los valores iniciales
 */
import "dotenv/config";
import { sembrar } from "./datos-iniciales";

sembrar({ reset: process.argv.includes("--reset") })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
