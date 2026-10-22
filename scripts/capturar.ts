/**
 * Corre la captura de leads reales a mano (lo mismo que hace el cron cada madrugada).
 *
 *   npm run captura                     # todas las fuentes
 *   npm run captura -- boletin-oficial  # una sola
 */
import "dotenv/config";
import { buscarFuente, ejecutarCaptura, FUENTES_DE_CAPTURA } from "../src/fuentes";

async function main() {
  const id = process.argv[2];
  const fuentes = id ? [buscarFuente(id)] : FUENTES_DE_CAPTURA;
  if (fuentes.some((f) => !f)) {
    console.error(`No existe la fuente "${id}". Opciones: ${FUENTES_DE_CAPTURA.map((f) => f.id).join(", ")}`);
    process.exit(1);
  }
  let huboError = false;
  for (const fuente of fuentes) {
    console.log(`→ ${fuente!.nombre}…`);
    const r = await ejecutarCaptura(fuente!);
    huboError ||= r.estado === "error";
    console.log(`  ${r.estado}: ${r.nuevos} leads nuevos. ${r.detalle}`);
    if (r.ejemplosBorrados) console.log(`  Se borraron ${r.ejemplosBorrados} leads de ejemplo.`);
  }
  process.exit(huboError ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
