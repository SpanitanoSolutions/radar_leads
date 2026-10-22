import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { diaEnArgentina } from "@/lib/fechas";
import { claveEmpresa } from "@/telefonos/telefono";
import { registrarCaptura, versionAnterior } from "../guardar";
import { elegirCandidato, type EstadoContacto } from "./coincidencia";
import { buscarCandidatos } from "./places";

// Después de cada captura: busca en Google Maps a las empresas nuevas y guarda
// el place ID con el grado de coincidencia. Un límite diario de búsquedas
// (PLACES_LIMITE_DIARIO) controla el costo.

const { leads } = schema;
export const FUENTE_CONTACTOS = "contactos-google";
const LIMITE_POR_DEFECTO = 50;

export type ResumenContactos = {
  estado: "ok" | "sin-configurar" | "limite" | "error";
  buscadas: number;
  encontradas: number;
  detalle: string;
};

/**
 * Búsquedas hechas hoy, según el registro de la última ejecución
 * ("2026-10-22:12" = 12 búsquedas el 22/10).
 */
export function busquedasDeHoy(version: string | null, hoy: string): number {
  const [dia, cantidad] = (version ?? "").split(":");
  return dia === hoy ? Number(cantidad) || 0 : 0;
}

export async function enriquecerContactos({ ahora = new Date() }: { ahora?: Date } = {}): Promise<ResumenContactos> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const detalle = "Falta GOOGLE_PLACES_API_KEY: no se buscaron contactos en Google Maps.";
    await registrarCaptura(FUENTE_CONTACTOS, { nuevos: 0, error: detalle });
    return { estado: "sin-configurar", buscadas: 0, encontradas: 0, detalle };
  }

  const limiteDiario = Number(process.env.PLACES_LIMITE_DIARIO) || LIMITE_POR_DEFECTO;
  const dia = diaEnArgentina(ahora);
  const hechasHoy = busquedasDeHoy(await versionAnterior(FUENTE_CONTACTOS), dia);
  let disponibles = limiteDiario - hechasHoy;
  if (disponibles <= 0) {
    const detalle = `Ya se hicieron ${hechasHoy} búsquedas hoy (límite ${limiteDiario}).`;
    return { estado: "limite", buscadas: 0, encontradas: 0, detalle };
  }

  const pendientes = await db
    .select({ id: leads.id, empresa: leads.empresa, cuit: leads.cuit, localidad: leads.localidad })
    .from(leads)
    .where(and(isNull(leads.contactoBuscadoEl), eq(leads.esEjemplo, false)))
    .orderBy(desc(leads.scoreBase), desc(leads.detectadoEl));

  // Una búsqueda por empresa; si ya se buscó por otro lead, se copia el resultado.
  const previos = await db
    .select({
      empresa: leads.empresa,
      cuit: leads.cuit,
      localidad: leads.localidad,
      placeId: leads.placeId,
      contactoEstado: leads.contactoEstado,
    })
    .from(leads)
    .where(isNotNull(leads.contactoBuscadoEl));
  const conocidos = new Map(previos.map((p) => [claveEmpresa(p), p]));
  const grupos = new Map<string, { empresa: string; localidad: string; ids: number[] }>();
  for (const l of pendientes) {
    const clave = claveEmpresa(l);
    const g = grupos.get(clave);
    if (g) g.ids.push(l.id);
    else grupos.set(clave, { empresa: l.empresa, localidad: l.localidad, ids: [l.id] });
  }

  let buscadas = 0;
  let encontradas = 0;
  try {
    for (const [clave, grupo] of grupos) {
      const previo = conocidos.get(clave);
      let resultado: { id: string | null; estado: EstadoContacto | "sin-resultado" };
      if (previo) {
        resultado = { id: previo.placeId, estado: (previo.contactoEstado as EstadoContacto) ?? "sin-resultado" };
      } else {
        if (disponibles <= 0) break;
        disponibles--;
        buscadas++;
        const elegido = elegirCandidato(grupo, await buscarCandidatos(grupo.empresa, grupo.localidad, { apiKey }));
        resultado = elegido ?? { id: null, estado: "sin-resultado" };
        if (elegido) encontradas++;
      }
      await db
        .update(leads)
        .set({ placeId: resultado.id, contactoEstado: resultado.estado, contactoBuscadoEl: ahora })
        .where(inArray(leads.id, grupo.ids));
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await registrarCaptura(FUENTE_CONTACTOS, { version: `${dia}:${hechasHoy + buscadas}`, nuevos: encontradas, error: detalle });
    return { estado: "error", buscadas, encontradas, detalle };
  }

  const detalle = `${encontradas} de ${buscadas} empresas encontradas en Google Maps.`;
  await registrarCaptura(FUENTE_CONTACTOS, { version: `${dia}:${hechasHoy + buscadas}`, nuevos: encontradas });
  return { estado: "ok", buscadas, encontradas, detalle };
}
