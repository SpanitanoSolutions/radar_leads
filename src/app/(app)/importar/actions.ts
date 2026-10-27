"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guardarImportacion } from "@/db/importar-cartera";
import { requerirSesion } from "@/lib/auth";
import {
  CAMPOS_CARTERA,
  leerArchivoTabla,
  TAMANO_MAXIMO_ARCHIVO,
  validarCartera,
  type CampoCartera,
} from "@/lib/importacion";
import { RAMOS_CARTERA } from "@/lib/ramos";

export type EstadoImportacion = { error?: string };

const CAMPOS = new Set<string>(CAMPOS_CARTERA.map((c) => c.id));
const RAMOS = new Set<string>(RAMOS_CARTERA.map((r) => r.id));

function leerJson<T>(valor: FormDataEntryValue | null, porDefecto: T): T {
  try {
    return typeof valor === "string" ? (JSON.parse(valor) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

/**
 * Último paso del asistente. El navegador ya mostró la revisión, pero acá se
 * vuelve a leer y validar el archivo: lo que se guarda es lo que valida el
 * servidor.
 */
export async function importarCartera(_previo: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  await requerirSesion();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elegí el archivo de nuevo." };
  if (archivo.size > TAMANO_MAXIMO_ARCHIVO) return { error: "El archivo es muy grande (máximo 4 MB)." };

  let tabla;
  try {
    tabla = await leerArchivoTabla(archivo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pude leer el archivo." };
  }
  const mapeo = leerJson<string[]>(formData.get("mapeo"), []).map((c) => (CAMPOS.has(c) ? c : "")) as (CampoCartera | "")[];
  if (mapeo.length !== tabla.encabezados.length) return { error: "Las columnas cambiaron. Volvé a elegir el archivo." };
  const ramos = Object.fromEntries(
    Object.entries(leerJson<Record<string, string>>(formData.get("ramos"), {})).filter(([, r]) => RAMOS.has(r)),
  );

  const validacion = validarCartera(tabla, mapeo, ramos);
  if (validacion.faltanObligatorios.length) {
    return { error: `Falta relacionar: ${validacion.faltanObligatorios.join(", ")}.` };
  }
  if (!validacion.filas.length) return { error: "No quedó ninguna fila para importar. Revisá los problemas." };

  const resumen = await guardarImportacion({
    archivo: archivo.name.slice(0, 200),
    validacion,
    modo: formData.get("modo") === "reemplazar" ? "reemplazar" : "combinar",
    quitarEjemplos: formData.get("quitarEjemplos") === "1",
  });
  revalidatePath("/", "layout");
  redirect(`/asegurados?aviso=importado-${resumen.polizasNuevas + resumen.polizasActualizadas}`);
}
