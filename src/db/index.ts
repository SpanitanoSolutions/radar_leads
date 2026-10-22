import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

// Reutiliza la conexión entre recargas en desarrollo.
const globalForDb = globalThis as unknown as { db?: Db };

function crearDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  const sql = postgres(url, { max: 5, prepare: false });
  return drizzle(sql, { schema });
}

function obtenerDb(): Db {
  globalForDb.db ??= crearDb();
  return globalForDb.db;
}

/**
 * Se conecta recién en la primera consulta, así el build no necesita la base
 * y un error de configuración aparece con un mensaje claro.
 */
export const db = new Proxy({} as Db, {
  get(_destino, propiedad) {
    const real = obtenerDb();
    const valor = Reflect.get(real, propiedad, real);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});

export { schema };
