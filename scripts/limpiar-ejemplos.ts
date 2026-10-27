/**
 * Borra los datos de ejemplo: leads y cartera (asegurados con sus pólizas,
 * cuotas y siniestros, mensajes, cotizaciones y liquidaciones). La captura
 * diaria ya borra sola los leads de ejemplo cuando entran los primeros reales,
 * y la cartera de ejemplo se va al importar la primera planilla real.
 *
 *   npm run db:limpiar-ejemplos
 */
import "dotenv/config";
import { borrarEjemplosDeCartera } from "../src/db/ejemplos";
import { borrarEjemplos } from "../src/fuentes/guardar";

async function main() {
  const leads = await borrarEjemplos();
  const asegurados = await borrarEjemplosDeCartera();
  console.log(`Borrados ${leads} leads y ${asegurados} asegurados de ejemplo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
