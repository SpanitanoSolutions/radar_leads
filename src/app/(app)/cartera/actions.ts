"use server";

import { requerirSesion } from "@/lib/auth";
import { analizarCartera, leerCartera, type AnalisisCartera } from "@/lib/cartera";
import { diaEnArgentina } from "@/lib/fechas";

export type EstadoCartera = { analisis?: AnalisisCartera; avisos?: string[]; error?: string };

const TAMANO_MAXIMO = 2 * 1024 * 1024;

/**
 * Analiza el CSV de la cartera y devuelve el resultado. No guarda nada: la
 * cartera tiene datos de personas (Ley 25.326) y solo se usa en el momento.
 */
export async function analizarArchivoCartera(_previo: EstadoCartera, formData: FormData): Promise<EstadoCartera> {
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
  return { analisis: analizarCartera(polizas, diaEnArgentina(new Date())), avisos: avisos.slice(0, 10) };
}
