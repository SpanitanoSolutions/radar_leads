/**
 * Carga la demo del Agente de Cobranza: unos 100 recibos ficticios con su
 * línea de tiempo, marcados como ejemplo. Se puede correr varias veces: borra
 * la demo anterior y vuelve a cargarla.
 *
 *   npm run db:seed:cobranza
 */
import "dotenv/config";
import { cargarDemoCobranza } from "../src/db/demo-cobranza";
import { diaEnArgentina } from "../src/lib/fechas";

cargarDemoCobranza(diaEnArgentina(new Date()))
  .then(({ casos }) => {
    console.log(`Listo: ${casos} recibos de ejemplo para el Agente de Cobranza.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
