// Qué herramientas se pueden conectar y cuáles hacen falta para que los agentes
// trabajen. El estado de cada una se guarda en la tabla conexiones; si no hay
// fila, está sin conectar.

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

export const COMPANIAS_CON_PORTAL = ["Mapfre", "Sancor", "Federación Patronal", "La Segunda"];
export const COMPANIAS_POR_EMAIL = ["Fianzas y Crédito"];

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
      detalle: "Portal de productores: para cotizar y descargar pólizas.",
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
