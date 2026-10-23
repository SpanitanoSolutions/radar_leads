/**
 * Busca a mano el teléfono de las empresas que todavía no lo tienen (lo mismo
 * que hace el cron cada mañana, pero sin el límite de tiempo de Vercel).
 *
 *   npm run telefonos            # hasta 30 empresas
 *   npm run telefonos -- 3       # prueba con 3
 *   npm run telefonos -- 400     # todas las pendientes
 */
import "dotenv/config";
import { completarTelefonos } from "../src/telefonos";

const limite = Number(process.argv[2] ?? 30);

completarTelefonos({ limite, plazoMs: Number.POSITIVE_INFINITY })
  .then((r) => {
    console.log(`${r.estado}: ${r.detalle}`);
    process.exit(r.estado === "error" ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
