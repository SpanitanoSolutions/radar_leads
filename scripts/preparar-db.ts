/**
 * Corre antes de cada build (ver "build" en package.json):
 *  1. aplica las migraciones pendientes;
 *  2. si la base está vacía, carga sectores, ajustes y leads de ejemplo.
 *
 * Nunca pisa datos existentes. Sin DATABASE_URL avisa y sigue, para que el
 * build local funcione sin base.
 *
 * En los deploys de preview de Vercel no hace nada: DATABASE_URL de Preview es
 * la misma base que la de producción, y migrarla desde una rama sin mergear
 * cambiaría producción antes de tiempo. PREPARAR_DB_EN_PREVIEW=1 lo habilita
 * (por ejemplo, si Preview pasa a tener su propia base).
 */
import "dotenv/config";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema";

async function main() {
  if (process.env.VERCEL_ENV === "preview" && process.env.PREPARAR_DB_EN_PREVIEW !== "1") {
    console.warn("⚠ Deploy de preview: no migro la base (es la misma que la de producción).");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("⚠ DATABASE_URL no está definida: salteo migraciones y datos iniciales.");
    return;
  }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(sql, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("✓ Migraciones aplicadas");

    const [{ total }] = await db.select({ total: count() }).from(schema.sectores);
    if (total === 0) {
      const { sembrar } = await import("./datos-iniciales");
      await sembrar();
    } else {
      console.log("✓ La base ya tiene datos: no cargo ejemplos");
    }
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ No pude preparar la base de datos:", err);
    process.exit(1);
  });
