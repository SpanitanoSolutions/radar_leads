/**
 * Borra los leads de ejemplo. Úsalo cuando empiecen a entrar leads reales.
 *
 *   npm run db:limpiar-ejemplos
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

async function main() {
  const borrados = await db
    .delete(schema.leads)
    .where(eq(schema.leads.esEjemplo, true))
    .returning({ id: schema.leads.id });
  console.log(`Borrados ${borrados.length} leads de ejemplo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
