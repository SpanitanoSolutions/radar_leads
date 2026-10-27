import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Conexion, EstadoConexion } from "@/db/schema";
import { CONEXIONES } from "./catalogo";

// Estado de las conexiones en la tabla conexiones. Solo datos que no son
// secretos (número, dirección, usuario): las claves de las APIs reales van en
// variables de entorno, nunca en la base.

export type DatosConexion = Record<string, string | boolean | number | null>;

export async function leerConexion(clave: string): Promise<Conexion | null> {
  const [fila] = await db.select().from(schema.conexiones).where(eq(schema.conexiones.clave, clave));
  return fila ?? null;
}

export async function leerConexiones(): Promise<Conexion[]> {
  return db.select().from(schema.conexiones);
}

export async function guardarConexion(clave: string, estado: EstadoConexion, datos: DatosConexion = {}) {
  const catalogo = CONEXIONES.find((c) => c.clave === clave);
  if (!catalogo) throw new Error(`Conexión desconocida: ${clave}`);
  const fila = {
    clave,
    tipo: catalogo.tipo,
    compania: catalogo.compania ?? null,
    estado,
    requerida: catalogo.requerida,
    datos,
    actualizadoEl: new Date(),
  };
  await db.insert(schema.conexiones).values(fila).onConflictDoUpdate({ target: schema.conexiones.clave, set: fila });
}

export async function estaConectada(clave: string): Promise<boolean> {
  return (await leerConexion(clave))?.estado === "conectado";
}
