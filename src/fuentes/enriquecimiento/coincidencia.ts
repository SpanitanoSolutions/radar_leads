import { normalizar } from "../clasificacion";
import { buscarLugar, normalizarLugar } from "../localidades";

// ¿El lugar que devolvió Google es la empresa del lead? Solo se acepta si se
// parece al nombre y está en la misma localidad (o partido). Ante la duda,
// no se guarda nada.

export type EstadoContacto = "verificado" | "posible";

export type CandidatoLugar = {
  id: string;
  nombre: string;
  direccion: string;
  /** Localidad y partido según Google (addressComponents). */
  localidades: string[];
  cerrado: boolean;
};

const SUFIJOS =
  /\b(s\.?a\.?s|s\.?r\.?l|s\.?a\.?u|s\.?c\.?s|s\.?a|s\.?h|sociedad anonima|sociedad de responsabilidad limitada|sociedad por acciones simplificada|y cia|cia|hnos|hermanos|e hijos|ltda)\b\.?/g;
const VACIAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "the", "grupo", "argentina"]);

/** Palabras que identifican a la empresa: sin tipo societario ni palabras vacías. */
export function palabrasDelNombre(nombre: string): string[] {
  return normalizar(nombre)
    .replace(SUFIJOS, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((p) => p.length >= 2 && !VACIAS.has(p));
}

/** Qué parte de las palabras de la razón social aparece en el nombre de Google (0 a 1). */
export function parecidoDeNombre(razonSocial: string, nombreGoogle: string): number {
  const nuestras = palabrasDelNombre(razonSocial);
  if (nuestras.length === 0) return 0;
  const deGoogle = new Set(palabrasDelNombre(nombreGoogle));
  const unidas = palabrasDelNombre(nombreGoogle).join("");
  const presentes = nuestras.filter((p) => deGoogle.has(p) || (p.length >= 4 && unidas.includes(p)));
  return presentes.length / nuestras.length;
}

/** ¿La dirección de Google está en la localidad (o el partido) del lead? */
export function mismaLocalidad(localidadLead: string, candidato: Pick<CandidatoLugar, "direccion" | "localidades">): boolean {
  const textoGoogle = [candidato.direccion, ...candidato.localidades].join(", ");
  const nuestra = normalizarLugar(localidadLead);
  if (nuestra && normalizarLugar(textoGoogle).includes(nuestra)) return true;
  // "Mar del Plata" y "General Pueyrredón", "Batán" y "Mar del Plata": mismo lugar del nomenclador.
  const lugarLead = buscarLugar(localidadLead);
  const lugarGoogle = buscarLugar(textoGoogle);
  return lugarLead !== null && lugarGoogle !== null && lugarLead.nombre === lugarGoogle.nombre;
}

const UMBRAL_VERIFICADO = 0.8;
const UMBRAL_POSIBLE = 0.5;

/**
 * El mejor candidato que coincide con la empresa, o null. "verificado" pide
 * casi todo el nombre y la misma localidad; "posible", la mitad del nombre y
 * la misma localidad. Sin localidad conocida, nunca pasa de "posible".
 */
export function elegirCandidato(
  lead: { empresa: string; localidad: string },
  candidatos: CandidatoLugar[],
): { id: string; estado: EstadoContacto } | null {
  const localidadConocida = lead.localidad !== "Provincia de Buenos Aires";
  let mejor: { id: string; estado: EstadoContacto; parecido: number } | null = null;
  for (const c of candidatos) {
    if (c.cerrado) continue;
    const parecido = parecidoDeNombre(lead.empresa, c.nombre);
    if (parecido < UMBRAL_POSIBLE) continue;
    const ubicado = localidadConocida
      ? mismaLocalidad(lead.localidad, c)
      : /buenos aires/.test(normalizar(c.direccion)) && !/ciudad autonoma|caba\b/.test(normalizar(c.direccion));
    if (!ubicado) continue;
    const estado: EstadoContacto = localidadConocida && parecido >= UMBRAL_VERIFICADO ? "verificado" : "posible";
    if (!mejor || parecido > mejor.parecido) mejor = { id: c.id, estado, parecido };
  }
  return mejor ? { id: mejor.id, estado: mejor.estado } : null;
}
