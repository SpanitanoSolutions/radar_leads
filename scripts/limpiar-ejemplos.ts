/**
 * Borra los leads de ejemplo. La captura diaria ya lo hace sola cuando entran
 * los primeros leads reales; esto queda para hacerlo a mano.
 *
 *   npm run db:limpiar-ejemplos
 */
import "dotenv/config";
import { borrarEjemplos } from "../src/fuentes/guardar";

async function main() {
  const borrados = await borrarEjemplos();
  console.log(`Borrados ${borrados} leads de ejemplo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
