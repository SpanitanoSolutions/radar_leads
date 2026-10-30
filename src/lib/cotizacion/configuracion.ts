import { destinatarioCotizacion } from "@/lib/cotizacion/correo";
import { companiaCanonica } from "@/lib/importacion";
import { ramoCanonico } from "@/lib/ramos";

// El checklist del inicio de Cotización ("Terminá de configurar tu agente de
// cotización") y los paquetes de cada aseguradora. Sin base: lo que mira cada
// paso llega armado desde src/lib/datos-agentes.ts.

/** La voz con la que viene el agente (cotizacion_config). */
export const VOZ_POR_DEFECTO = { persona: "Verónica", nombreAgente: "Verónica", personalidad: "Profesional, cortés y meticulosa." };

export type PasoConfiguracion = {
  id: "vendes" | "aseguradora" | "portales" | "voz";
  texto: string;
  detalle: string;
  href: string;
  listo: boolean;
};

export type DatosChecklist = {
  aseguradoras: { id: number; nombre: string; activa: boolean; contactos: { email?: string | null }[] }[];
  paquetes: { aseguradoraId: number }[];
  credenciales: { compania: string; estado: string }[];
  /** `elegida`: el productor guardó la voz y el tono al menos una vez. */
  voz: { elegida: boolean; persona: string; nombreAgente: string; personalidad: string } | null;
};

/**
 * Los 4 pasos de la spec, cada uno con su sección:
 * - lo que vendés: al menos un paquete de cobertura de una aseguradora activa;
 * - una aseguradora activa con un contacto de correo válido;
 * - los accesos de portal: una clave activa de una compañía con la que cotizás;
 * - la voz: guardada alguna vez, o distinta de la que viene.
 */
export function pasosConfiguracionCotizacion(datos: DatosChecklist): PasoConfiguracion[] {
  const activas = datos.aseguradoras.filter((aseguradora) => aseguradora.activa);
  const idsActivas = new Set(activas.map((aseguradora) => aseguradora.id));
  const nombresActivas = new Set(activas.map((aseguradora) => companiaCanonica(aseguradora.nombre)));
  const voz = datos.voz;
  const vozPropia = Boolean(voz && (voz.elegida
    || voz.persona !== VOZ_POR_DEFECTO.persona
    || voz.nombreAgente !== VOZ_POR_DEFECTO.nombreAgente
    || voz.personalidad !== VOZ_POR_DEFECTO.personalidad));
  return [
    {
      id: "vendes",
      texto: "Agregá lo que vendés",
      detalle: "Las coberturas que ofrecés con cada compañía y ramo.",
      href: "/agentes/cotizacion/configuracion#paquetes",
      listo: datos.paquetes.some((paquete) => idsActivas.has(paquete.aseguradoraId)),
    },
    {
      id: "aseguradora",
      texto: "Agregá una aseguradora con contacto",
      detalle: "A quién le pide la cotización el agente.",
      href: "/agentes/cotizacion/configuracion#aseguradoras",
      listo: activas.some((aseguradora) => destinatarioCotizacion(aseguradora.contactos) !== null),
    },
    {
      id: "portales",
      texto: "Conectá los accesos de portal",
      detalle: "El usuario y la clave de cada compañía, para cotizar sin correo.",
      href: "/configuracion/companias?agente=cotizacion",
      listo: datos.credenciales.some((credencial) => credencial.estado === "activa" && nombresActivas.has(companiaCanonica(credencial.compania))),
    },
    {
      id: "voz",
      texto: "Elegí cómo suena tu agente",
      detalle: "El nombre con el que firma y cómo escribe.",
      href: "/agentes/cotizacion/configuracion#voz",
      listo: vozPropia,
    },
  ];
}

type Paquete = { id: number; aseguradoraId: number; ramo: string };

/** Los ramos (con su nombre canónico) para los que cada aseguradora tiene paquete. */
export function ramosConPaquete(paquetes: Paquete[]): Map<number, string[]> {
  const porAseguradora = new Map<number, string[]>();
  for (const paquete of paquetes) {
    const ramos = porAseguradora.get(paquete.aseguradoraId) ?? [];
    const ramo = ramoCanonico(paquete.ramo);
    if (!ramos.includes(ramo)) porAseguradora.set(paquete.aseguradoraId, [...ramos, ramo]);
  }
  return porAseguradora;
}

/**
 * El paquete que lleva el envío a una compañía: el de su ramo ("Automotor" y
 * "Auto" son el mismo). Con varios, el primero que se cargó. Sin paquete, null.
 */
export function paqueteParaEnvio(aseguradoraId: number | null | undefined, ramo: string, paquetes: Paquete[]): number | null {
  if (aseguradoraId == null) return null;
  const buscado = ramoCanonico(ramo);
  return paquetes
    .filter((paquete) => paquete.aseguradoraId === aseguradoraId && ramoCanonico(paquete.ramo) === buscado)
    .sort((a, b) => a.id - b.id)[0]?.id ?? null;
}
