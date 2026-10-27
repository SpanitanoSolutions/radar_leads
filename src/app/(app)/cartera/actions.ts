"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";
import { leerCartera } from "@/lib/cartera";

export type EstadoCartera = { guardadas?: number; avisos?: string[]; error?: string };

const TAMANO_MAXIMO = 2 * 1024 * 1024;

function revalidarCartera() {
  revalidatePath("/cartera");
  revalidatePath("/resumen");
  revalidatePath("/", "layout"); // los leads marcan "Ya es cliente"
}

/** Lee el CSV de la cartera y reemplaza la que estaba guardada. */
export async function guardarCartera(_previo: EstadoCartera, formData: FormData): Promise<EstadoCartera> {
  await requerirSesion();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elegí un archivo CSV." };
  if (archivo.size > TAMANO_MAXIMO) return { error: "El archivo es muy grande (máximo 2 MB)." };
  if (!/\.(csv|txt)$/i.test(archivo.name)) {
    return { error: 'Subí la cartera como CSV. En Excel: Archivo → Guardar como → "CSV (delimitado por comas)".' };
  }
  const bytes = await archivo.arrayBuffer();
  // Excel en Windows guarda los CSV en Windows-1252: si no es UTF-8 válido, se relee así.
  let texto = new TextDecoder("utf-8").decode(bytes);
  if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bytes);

  const { polizas, avisos } = await leerCartera(texto);
  if (polizas.length === 0) return { error: avisos[0] ?? "El archivo no tiene filas con clientes.", avisos };

  await db.transaction(async (tx) => {
    await tx.delete(schema.cartera);
    for (let i = 0; i < polizas.length; i += 500) {
      await tx.insert(schema.cartera).values(polizas.slice(i, i + 500));
    }
  });
  revalidarCartera();
  return { guardadas: polizas.length, avisos: avisos.slice(0, 10) };
}

/** Borra toda la cartera guardada. */
export async function borrarCartera() {
  await requerirSesion();
  await db.delete(schema.cartera);
  revalidarCartera();
}
