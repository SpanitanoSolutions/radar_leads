/**
 * Corre antes de cada build (ver "build" en package.json):
 *  1. aplica las migraciones pendientes;
 *  2. si la base está vacía, carga sectores, ajustes y leads de ejemplo.
 *
 * Nunca pisa datos existentes. Sin DATABASE_URL avisa y sigue, para que el
 * build local funcione sin base.
 */
import "dotenv/config";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema";

async function main() {
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
