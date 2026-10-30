import { normalizar } from "@/fuentes/clasificacion";

// Tipos de seguro de Cotización (cotizacion_tipos_seguro): los ramos que vende
// el productor, con su descripción y sus sub-tipos. Son los que ofrece la nueva
// solicitud. La baja desactiva y no borra: las solicitudes guardan el ramo como
// texto y siguen igual.

/** Los ramos de la spec, por si la tabla está vacía (la migración 0014 los siembra). */
export const RAMOS_POR_DEFECTO = ["Automotor", "Flotas", "Hogar", "Integral de comercio", "Incendio", "RC", "Caución", "ART", "AP", "Vida", "Salud"];

const LARGO_RAMO = 60;
const LARGO_DESCRIPCION = 300;
const LARGO_SUBTIPO = 80;
const MAXIMO_SUBTIPOS = 20;

/** "Livianos, pesados; Mixta" → ["Livianos", "pesados", "Mixta"], sin repetidos ni vacíos. */
export function leerSubTipos(texto: string): string[] {
  const vistos = new Set<string>();
  return texto.split(/[,;\n]/).map((parte) => parte.trim().replace(/\s+/g, " ").slice(0, LARGO_SUBTIPO)).filter((parte) => {
    const clave = normalizar(parte);
    if (!parte || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }).slice(0, MAXIMO_SUBTIPOS);
}

export type ErrorTipoSeguro = "ramo-vacio" | "ramo-repetido";

/**
 * Valida un tipo de seguro nuevo o editado. El ramo no se repite (sin
 * distinguir mayúsculas ni tildes) y no se renombra al editar: las
 * aseguradoras y los paquetes lo nombran por texto.
 */
export function validarTipoSeguro(
  datos: { id?: number | null; ramo: string; descripcion: string; subTipos: string },
  existentes: { id: number; ramo: string }[],
): { ok: true; tipo: { ramo: string; descripcion: string; subTipos: string[] } } | { ok: false; error: ErrorTipoSeguro } {
  const actual = datos.id != null ? existentes.find((tipo) => tipo.id === datos.id) : undefined;
  const ramo = actual ? actual.ramo : datos.ramo.trim().replace(/\s+/g, " ").slice(0, LARGO_RAMO);
  if (!ramo) return { ok: false, error: "ramo-vacio" };
  if (!actual && existentes.some((tipo) => normalizar(tipo.ramo) === normalizar(ramo))) return { ok: false, error: "ramo-repetido" };
  return { ok: true, tipo: { ramo, descripcion: datos.descripcion.trim().slice(0, LARGO_DESCRIPCION), subTipos: leerSubTipos(datos.subTipos) } };
}

/** Los ramos que ofrece la nueva solicitud: los tipos activos, o los de la spec si la tabla está vacía. */
export function ramosParaSolicitud(tipos: { ramo: string; descripcion: string; activo: boolean }[]): { ramo: string; descripcion: string }[] {
  if (!tipos.length) return RAMOS_POR_DEFECTO.map((ramo) => ({ ramo, descripcion: "" }));
  return tipos.filter((tipo) => tipo.activo).map(({ ramo, descripcion }) => ({ ramo, descripcion }));
}
