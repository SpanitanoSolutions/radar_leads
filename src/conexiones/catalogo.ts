// Qué herramientas se pueden conectar y cuáles hacen falta para que los agentes
// trabajen. El estado de cada una se guarda en la tabla conexiones; si no hay
// fila, está sin conectar.

import type { Conexion } from "@/db/schema";

export type TipoConexion = "whatsapp" | "email" | "portal" | "mercadopago" | "banco" | "google_calendar";

export type ConexionCatalogo = {
  clave: string;
  tipo: TipoConexion;
  nombre: string;
  sigla: string;
  grupo: "mensajeria" | "companias" | "pagos" | "calendario";
  compania?: string;
  /** Sin esta conexión los agentes no pueden hacer su trabajo: avisa en Configuración. */
  requerida: boolean;
  /** Qué agentes o secciones la usan. */
  usan: string[];
  /** Qué hace, cuando todavía no está conectada. */
  detalle: string;
};

/**
 * Aseguradoras líderes por participación de mercado total (SSN, 1T 2026).
 * La SSN contabiliza por separado las entidades ART; se conservan esas marcas
 * porque pueden tener un acceso de productor distinto al de seguros generales.
 */
export const ASEGURADORAS_LIDERES = [
  { compania: "Federación Patronal", puesto: 1, participacion: "9,7%" },
  { compania: "Sancor", puesto: 2, participacion: "7,3%" },
  { compania: "Prevención ART", puesto: 3, participacion: "5,6%" },
  { compania: "La Caja", puesto: 4, participacion: "5,1%" },
  { compania: "Provincia ART", puesto: 5, participacion: "4,4%" },
  { compania: "San Cristóbal", puesto: 6, participacion: "4,2%" },
  { compania: "La Segunda", puesto: 7, participacion: "3,7%" },
  { compania: "Mercantil Andina", puesto: 8, participacion: "3,6%" },
  { compania: "Zurich", puesto: 9, participacion: "3,4%" },
  { compania: "Seguros Rivadavia", puesto: 10, participacion: "3,2%" },
  { compania: "Nación Seguros", puesto: 11, participacion: "3,1%" },
  { compania: "Experta ART", puesto: 12, participacion: "2,7%" },
  { compania: "Provincia Seguros", puesto: 13, participacion: "2,7%" },
  { compania: "Allianz", puesto: 14, participacion: "2,5%" },
  { compania: "Asociart ART", puesto: 15, participacion: "2,4%" },
  { compania: "La Segunda ART", puesto: 16, participacion: "2,1%" },
  { compania: "La Meridional", puesto: 17, participacion: "1,8%" },
  { compania: "Life Seguros", puesto: 18, participacion: "1,8%" },
  { compania: "Swiss Medical ART", puesto: 19, participacion: "1,7%" },
  { compania: "Sudamericana Seguros Galicia", puesto: 20, participacion: "1,6%" },
] as const;

// Se suman las líderes a las opciones que ya ofrecía el sistema.
export const COMPANIAS_CON_PORTAL = [
  ...ASEGURADORAS_LIDERES.map(({ compania }) => compania),
  "Mapfre",
  "Fianzas y Crédito",
];
export const COMPANIAS_POR_EMAIL: string[] = [];

export const CONEXIONES: ConexionCatalogo[] = [
  {
    clave: "whatsapp",
    tipo: "whatsapp",
    nombre: "WhatsApp Business",
    sigla: "WA",
    grupo: "mensajeria",
    requerida: true,
    usan: ["Cotización", "Siniestros", "Cobranza", "Vencimientos"],
    detalle: "Tu número para avisos, cotizaciones y siniestros.",
  },
  {
    clave: "email",
    tipo: "email",
    nombre: "Correo electrónico",
    sigla: "@",
    grupo: "mensajeria",
    requerida: false,
    usan: ["Cotización", "Conciliador"],
    detalle: "Para pedir cotizaciones y leer las liquidaciones que te mandan las compañías.",
  },
  ...COMPANIAS_CON_PORTAL.map(
    (compania): ConexionCatalogo => ({
      clave: `portal:${compania}`,
      tipo: "portal",
      nombre: compania,
      sigla: siglaDe(compania),
      grupo: "companias",
      compania,
      requerida: false,
      usan: compania === "Mapfre" || compania === "Sancor" ? ["Cotización", "Siniestros"] : ["Cotización"],
      detalle: (() => {
        const ranking = ASEGURADORAS_LIDERES.find((item) => item.compania === compania);
        return ranking
          ? `Ranking de mercado SSN 1T 2026: #${ranking.puesto} · ${ranking.participacion}. Portal de productores para cotizar y descargar pólizas.`
          : "Portal de productores: para cotizar y descargar pólizas.";
      })(),
    }),
  ),
  ...COMPANIAS_POR_EMAIL.map(
    (compania): ConexionCatalogo => ({
      clave: `portal:${compania}`,
      tipo: "portal",
      nombre: compania,
      sigla: siglaDe(compania),
      grupo: "companias",
      compania,
      requerida: false,
      usan: ["Cotización"],
      detalle: "Sin portal: el agente pide la cotización por email.",
    }),
  ),
  {
    clave: "mercadopago",
    tipo: "mercadopago",
    nombre: "Mercado Pago",
    sigla: "MP",
    grupo: "pagos",
    requerida: false,
    usan: ["Cobranza", "Validador de pagos"],
    detalle: "Links de pago y confirmación automática de cobros.",
  },
  {
    clave: "banco",
    tipo: "banco",
    nombre: "Cuenta bancaria",
    sigla: "$",
    grupo: "pagos",
    requerida: false,
    usan: ["Conciliador", "Validador de pagos"],
    detalle: "Subí extractos en CSV o conectá tu banco para conciliar pagos y comisiones.",
  },
  {
    clave: "google_calendar",
    tipo: "google_calendar",
    nombre: "Google Calendar",
    sigla: "CA",
    grupo: "calendario",
    requerida: false,
    usan: ["Vencimientos", "Leads"],
    detalle: "Agrega vencimientos y recordatorios a tu calendario.",
  },
];

/** Compañías realmente configuradas para cotizar en esta cuenta. */
export function companiasCotizables(conexiones: Pick<Conexion, "compania" | "estado" | "datos">[]): string[] {
  const filas = new Map(conexiones.filter((fila) => fila.compania).map((fila) => [fila.compania!, fila]));
  return CONEXIONES.filter((conexion) => conexion.tipo === "portal")
    .filter((conexion) => {
      const fila = filas.get(conexion.compania!);
      if (!fila) return false;
      if (fila.estado === "conectado") {
        return fila.datos.integracionReal === true && typeof fila.datos.usuario === "string" && Boolean(fila.datos.usuario.trim());
      }
      if (fila.estado === "por_email" && COMPANIAS_POR_EMAIL.includes(fila.compania!)) {
        const email = fila.datos.email;
        return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      }
      return false;
    })
    .map((conexion) => conexion.compania!);
}

/** "Federación Patronal" → "FP", "Mapfre" → "MA". */
export function siglaDe(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => p.length > 1 && !/^(y|de|del)$/i.test(p));
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
}

/** Conexiones requeridas que todavía no están conectadas. */
export function conexionesPendientes(conectadas: string[]): ConexionCatalogo[] {
  const hechas = new Set(conectadas);
  return CONEXIONES.filter((c) => c.requerida && !hechas.has(c.clave));
}

export type VistaConexion = {
  estado: "conectado" | "pendiente" | "en_proceso" | "por_email" | "sin_conectar";
  estadoTexto: string;
  detalle: string;
  boton: string;
  primario: boolean;
};

type Fila = { estado: string; datos: Record<string, unknown> } | null | undefined;

/** Cómo se muestra cada conexión en Configuración según lo guardado. */
export function vistaConexion(c: ConexionCatalogo, fila: Fila): VistaConexion {
  const d = (k: string) => (fila?.datos[k] ? String(fila.datos[k]) : "");
  if (c.tipo === "portal") {
    return {
      estado: "sin_conectar",
      estadoTexto: "Integración pendiente",
      detalle: `${c.detalle} La conexión real requiere una API oficial y autorización de ${c.nombre}.`,
      boton: "Integración pendiente",
      primario: false,
    };
  }
  if (c.tipo === "banco") {
    return {
      estado: "sin_conectar",
      estadoTexto: "Proveedor pendiente",
      detalle: "La conexión automática requiere contratar y configurar un proveedor bancario compatible.",
      boton: "Proveedor pendiente",
      primario: false,
    };
  }
  if (fila?.estado === "conectado") {
    const detalle =
      c.tipo === "whatsapp"
        ? `${d("numero") || "Número"} · verificado`
        : c.tipo === "email"
          ? [d("direccion"), d("proveedor")].filter(Boolean).join(" · ")
          : c.tipo === "portal"
            ? `Portal de productores · usuario ${d("usuario") || "cargado"}`
            : c.tipo === "mercadopago"
              ? `Cuenta vinculada${d("cuenta") ? ` · ${d("cuenta")}` : ""}`
              : c.tipo === "banco"
                ? [d("banco"), d("alias") && `alias ${d("alias")}`].filter(Boolean).join(" · ")
                : `Calendario ${d("calendario") || "principal"}`;
    return { estado: "conectado", estadoTexto: "Conectado", detalle: detalle || c.detalle, boton: "Administrar", primario: false };
  }
  if (fila?.estado === "por_email" && COMPANIAS_POR_EMAIL.includes(c.compania ?? "")) {
    const contacto = d("email");
    return {
      estado: "por_email",
      estadoTexto: "Por email",
      detalle: contacto
        ? `Sin portal: el agente le pide la cotización a ${contacto}.`
        : "Sin portal: el agente pide la cotización por email. Falta el contacto.",
      boton: contacto ? "Administrar" : "Agregar contacto",
      primario: !contacto,
    };
  }
  if (fila?.estado === "por_email" && c.tipo === "portal") {
    return {
      estado: "en_proceso",
      estadoTexto: "A medio conectar",
      detalle: "Esta compañía se configura con su portal de productor, no por email.",
      boton: "Continuar",
      primario: true,
    };
  }
  if (fila?.estado === "en_proceso") {
    return { estado: "en_proceso", estadoTexto: "A medio conectar", detalle: c.detalle, boton: "Continuar", primario: true };
  }
  if (COMPANIAS_POR_EMAIL.includes(c.compania ?? "")) {
    return {
      estado: "por_email",
      estadoTexto: "Por email",
      detalle: "Sin portal: el agente pide la cotización por email. Falta el contacto.",
      boton: "Agregar contacto",
      primario: true,
    };
  }
  return {
    estado: c.requerida ? "pendiente" : "sin_conectar",
    estadoTexto: "Sin conectar",
    detalle: c.detalle,
    boton: c.tipo === "banco" ? "Configurar" : "Conectar",
    primario: c.requerida,
  };
}

export const GRUPOS_CONEXIONES: { id: ConexionCatalogo["grupo"]; titulo: string; detalle: string }[] = [
  { id: "mensajeria", titulo: "Mensajería", detalle: "Por donde tus agentes hablan con los asegurados." },
  { id: "companias", titulo: "Compañías de seguros", detalle: "Accesos a los portales para cotizar y descargar pólizas." },
  { id: "pagos", titulo: "Pagos y bancos", detalle: "Para cobrar, validar comprobantes y conciliar." },
  { id: "calendario", titulo: "Calendario", detalle: "Recordatorios de vencimientos y reuniones." },
];
