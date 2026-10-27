import type { Lead } from "@/db/schema";
import {
  calcularScoreBase,
  clasificar,
  ramosLicitacion,
  ramosTransferencia,
  RUBRO_POR_SECTOR,
  RUBRO_TRANSPORTE,
} from "./clasificacion";

// Vuelve a clasificar un lead ya guardado con las reglas actuales, a partir de
// lo que quedó en la base: el texto de clasificación o, en los leads anteriores
// a esa columna, el motivo y la descripción.

export type LeadGuardado = Pick<
  Lead,
  "clave" | "empresa" | "rubro" | "motivo" | "descripcion" | "zona" | "textoClasificacion" | "sectorId" | "ramos" | "scoreBase"
>;

export type Cambios = Partial<Pick<Lead, "sectorId" | "rubro" | "motivo" | "ramos" | "scoreBase">>;

const ETIQUETAS = new Set<string>([...Object.values(RUBRO_POR_SECTOR), ...Object.values(RUBRO_TRANSPORTE)]);

/** "…, por $ 92.137.810. …" → 92137810; "en moneda extranjera" → divisa. */
export function montoDeDescripcion(descripcion: string | null): { montoPesos?: number; enDivisa?: boolean } {
  if (!descripcion) return {};
  if (/en moneda extranjera/.test(descripcion)) return { enDivisa: true };
  const m = /por \$ ([\d.]+)/.exec(descripcion);
  return m ? { montoPesos: Number(m[1].replace(/\./g, "")) } : {};
}

/** El objeto social que la captura copia al final de la descripción ("… Objeto: …"). */
function objetoDeDescripcion(descripcion: string | null): string | null {
  const i = descripcion?.indexOf(" Objeto: ") ?? -1;
  return i >= 0 ? descripcion!.slice(i + " Objeto: ".length) : null;
}

/** Rubro original de la fuente, para empresas que quedan en comercio. */
function rubroFuente(lead: LeadGuardado): string | undefined {
  if (lead.textoClasificacion) return lead.textoClasificacion.split(". ").at(-1)?.split("; ")[0];
  return ETIQUETAS.has(lead.rubro) ? undefined : lead.rubro;
}

function nuevaClasificacion(lead: LeadGuardado): Cambios | null {
  const clave = lead.clave ?? "";
  const zona = lead.zona;

  if (clave.startsWith("comprar:")) {
    const texto =
      lead.textoClasificacion ??
      `${lead.motivo.replace(/^Ganó licitación nacional:\s*/, "").replace(/…$/, "")}. ${lead.rubro}`;
    const c = clasificar(texto, { nombre: lead.empresa, rubroFuente: rubroFuente(lead) });
    return {
      sectorId: c.sector,
      rubro: c.rubro,
      ramos: ramosLicitacion(c),
      scoreBase: calcularScoreBase("licitacion", { sector: c.sector, zona, ...montoDeDescripcion(lead.descripcion) }),
    };
  }

  if (clave.startsWith("bo-pba:sociedad:")) {
    const c = clasificar(lead.textoClasificacion ?? objetoDeDescripcion(lead.descripcion) ?? lead.motivo, {
      nombre: lead.empresa,
    });
    return {
      sectorId: c.sector,
      rubro: c.rubro,
      motivo: `Sociedad nueva: ${c.rubro.toLowerCase()}`,
      ramos: c.ramos,
      scoreBase: calcularScoreBase("sociedad", { sector: c.sector, zona }),
    };
  }

  if (clave.startsWith("bo-pba:transferencia:")) {
    // El rubro guardado es el del fondo de comercio (lo que dice el edicto): se conserva.
    const c = clasificar(lead.textoClasificacion ?? lead.rubro, { nombre: lead.empresa });
    return {
      sectorId: c.sector,
      ramos: ramosTransferencia(c),
      scoreBase: calcularScoreBase("transferencia", { sector: c.sector, zona }),
    };
  }

  return null; // ejemplos y leads cargados a mano
}

/** Solo lo que cambia respecto de lo guardado; null si no cambia nada. */
export function reclasificar(lead: LeadGuardado): Cambios | null {
  const nuevo = nuevaClasificacion(lead);
  if (!nuevo) return null;
  const cambios: Cambios = {};
  for (const [campo, valor] of Object.entries(nuevo) as [keyof Cambios, Cambios[keyof Cambios]][]) {
    const actual = lead[campo];
    const igual = Array.isArray(valor) ? JSON.stringify(valor) === JSON.stringify(actual) : valor === actual;
    if (!igual) Object.assign(cambios, { [campo]: valor });
  }
  return Object.keys(cambios).length ? cambios : null;
}
