// Qué herramientas se pueden conectar y cuáles hacen falta para que los agentes
// trabajen. El estado de cada una se guarda en la tabla conexiones; si no hay
// fila, está sin conectar. Las compañías de seguros no están acá: tienen su
// propia pantalla, Configuración → Conexiones con las compañías
// (/configuracion/companias), con los conectores de src/lib/conectores/.

export type TipoConexion = "whatsapp" | "email" | "portal" | "mercadopago" | "banco" | "google_calendar";

export type ConexionCatalogo = {
  clave: string;
  tipo: TipoConexion;
  nombre: string;
  sigla: string;
  grupo: "mensajeria" | "companias" | "pagos" | "calendario";
  /** Sin esta conexión los agentes no pueden hacer su trabajo: avisa en Configuración. */
  requerida: boolean;
  /** Qué agentes o secciones la usan. */
  usan: string[];
  /** Qué hace, cuando todavía no está conectada. */
  detalle: string;
};

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
    usan: ["Cotización", "Siniestros", "Conciliador", "Cobranza", "Validador de pagos"],
    detalle: "Para pedir cotizaciones y mandar denuncias, reclamos y avisos desde tu casilla.",
  },
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

export type VistaConexion = {
  estado: "conectado" | "pendiente" | "en_proceso" | "sin_conectar";
  estadoTexto: string;
  detalle: string;
  boton: string;
  primario: boolean;
};

type Fila = { estado: string; datos: Record<string, unknown> } | null | undefined;

/** Cómo se muestra cada conexión en Configuración según lo guardado. */
export function vistaConexion(c: ConexionCatalogo, fila: Fila): VistaConexion {
  const d = (k: string) => (fila?.datos[k] ? String(fila.datos[k]) : "");
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
          : c.tipo === "mercadopago"
            ? `Cuenta vinculada${d("cuenta") ? ` · ${d("cuenta")}` : ""}`
            : `Calendario ${d("calendario") || "principal"}`;
    return { estado: "conectado", estadoTexto: "Conectado", detalle: detalle || c.detalle, boton: "Administrar", primario: false };
  }
  if (fila?.estado === "en_proceso") {
    // Con error: la autorización se cayó (por ejemplo, la revocaron desde la cuenta de Google).
    return d("error")
      ? { estado: "en_proceso", estadoTexto: "Hay que volver a autorizar", detalle: d("error"), boton: "Volver a autorizar", primario: true }
      : { estado: "en_proceso", estadoTexto: "A medio conectar", detalle: c.detalle, boton: "Continuar", primario: true };
  }
  return {
    estado: c.requerida ? "pendiente" : "sin_conectar",
    estadoTexto: "Sin conectar",
    detalle: c.detalle,
    boton: "Conectar",
    primario: c.requerida,
  };
}

export const GRUPOS_CONEXIONES: { id: ConexionCatalogo["grupo"]; titulo: string; detalle: string }[] = [
  { id: "mensajeria", titulo: "Mensajería", detalle: "Por donde tus agentes hablan con los asegurados." },
  { id: "companias", titulo: "Compañías de seguros", detalle: "Cómo se conectan los agentes con cada compañía para cotizar, validar pagos y seguir siniestros." },
  { id: "pagos", titulo: "Pagos y bancos", detalle: "Para cobrar, validar comprobantes y conciliar." },
  { id: "calendario", titulo: "Calendario", detalle: "Recordatorios de vencimientos y reuniones." },
];
