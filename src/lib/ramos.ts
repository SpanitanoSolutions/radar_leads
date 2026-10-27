import { normalizar } from "@/fuentes/clasificacion";

// Nombres canónicos de los ramos de la cartera. Las planillas los escriben de
// mil maneras ("Automotor", "Acc. personales", "Resp. civil"): se llevan a estos
// para filtrar y para las reglas de oportunidades.

export const RAMOS_CARTERA = [
  { id: "Auto", nombre: "Auto" },
  { id: "Moto", nombre: "Moto" },
  { id: "Flota", nombre: "Flota" },
  { id: "Hogar", nombre: "Hogar" },
  { id: "Vida", nombre: "Vida" },
  { id: "AP", nombre: "Accidentes personales" },
  { id: "ART", nombre: "ART" },
  { id: "Integral de comercio", nombre: "Integral de comercio" },
  { id: "Integral", nombre: "Integral" },
  { id: "RC", nombre: "Responsabilidad civil" },
  { id: "RC profesional", nombre: "RC profesional" },
  { id: "Caución", nombre: "Caución" },
  { id: "Carga", nombre: "Carga" },
  { id: "Todo riesgo construcción", nombre: "Todo riesgo construcción" },
  { id: "Embarcaciones", nombre: "Embarcaciones" },
] as const;

// Sobre el texto sin tildes y en minúsculas. El orden importa: lo más específico primero.
const SINONIMOS: [RegExp, string][] = [
  [/(rc|resp(onsabilidad)?\.? ?civil) ?profesional|mala ?praxis/, "RC profesional"],
  [/integral (de )?comercio|comercio integral|integral comercial/, "Integral de comercio"],
  [/todo riesgo (de )?construccion|\btrc\b/, "Todo riesgo construcción"],
  [/accidentes? personales?|acc\.? ?pers|^ap$/, "AP"],
  [/riesgos? del trabajo|^art$/, "ART"],
  [/flota/, "Flota"],
  [/^motos?$|motovehiculo|ciclomotor/, "Moto"],
  [/^autos?$|automotor|automovil|vehiculo/, "Auto"],
  [/hogar|combinado familiar|vivienda|incendio (de )?vivienda/, "Hogar"],
  [/^vida|sepelio/, "Vida"],
  [/caucion/, "Caución"],
  [/carga|mercaderia|transporte de mercaderias/, "Carga"],
  [/embarcacion|casco|buque/, "Embarcaciones"],
  [/^integral|consorcio/, "Integral"],
  [/^rc$|resp(onsabilidad)?\.? ?civil/, "RC"],
];

/** "Automotor" → "Auto", "Acc. personales" → "AP". Si no lo reconoce, lo deja como vino. */
export function ramoCanonico(texto: string): string {
  const limpio = texto.trim();
  const n = normalizar(limpio).replace(/\s+/g, " ");
  return SINONIMOS.find(([patron]) => patron.test(n))?.[1] ?? limpio;
}

export function nombreRamo(id: string): string {
  return RAMOS_CARTERA.find((r) => r.id === id)?.nombre ?? id;
}
