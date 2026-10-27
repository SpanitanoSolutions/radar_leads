// Menú lateral: qué secciones hay, qué contador lleva cada una y cuál está
// activa. Los números salen de obtenerMarco() (una sola consulta por pedido).

export type AgenteId = "cotizacion" | "validador" | "siniestros" | "cobranza" | "conciliador";

export type ContadoresMenu = {
  asegurados: number;
  /** Asegurados con alguna póliza que vence en los próximos 30 días. */
  vencen30: number;
  leads: number;
  /** Lo que requiere atención en cada agente; null si el agente no está configurado. */
  agentes: Record<AgenteId, number | null>;
  conexionesPendientes: number;
  ultimaImportacion: { fecha: string; archivo: string | null } | null;
};

export type Tono = "neutro" | "ambar" | "rojo";

export type Icono =
  | "usuarios"
  | "calendario"
  | "subir"
  | "calculadora"
  | "tarjeta"
  | "escudo"
  | "moneda"
  | "flechas"
  | "grafico"
  | "radar"
  | "grilla"
  | "engranaje";

export type ItemMenu = {
  href: string;
  texto: string;
  icono: Icono;
  /** Otras rutas que también marcan este ítem como activo. */
  tambien?: string[];
  contador?: { valor: number; tono: Tono; descripcion: string };
  /** El agente todavía no está configurado. */
  configurar?: boolean;
};

export type GrupoMenu = { id: string; titulo: string; items: ItemMenu[] };

const AGENTES: { id: AgenteId; texto: string; icono: Icono; tono: Tono; descripcion: (n: number) => string }[] = [
  { id: "cotizacion", texto: "Cotización", icono: "calculadora", tono: "ambar", descripcion: (n) => `${n} ${n === 1 ? "solicitud requiere" : "solicitudes requieren"} tu atención` },
  { id: "validador", texto: "Validador de pagos", icono: "tarjeta", tono: "rojo", descripcion: (n) => `${n} ${n === 1 ? "comprobante" : "comprobantes"} por revisar` },
  { id: "siniestros", texto: "Siniestros", icono: "escudo", tono: "rojo", descripcion: (n) => `${n} ${n === 1 ? "siniestro requiere" : "siniestros requieren"} tu atención` },
  { id: "cobranza", texto: "Cobranza", icono: "moneda", tono: "ambar", descripcion: (n) => `${n} para aprobar` },
  { id: "conciliador", texto: "Conciliador", icono: "flechas", tono: "ambar", descripcion: (n) => `${n} ${n === 1 ? "diferencia" : "diferencias"} para reclamar` },
];

/** Contador que solo se muestra si hay algo (los de "lo que requiere tu atención"). */
function siHay(valor: number, tono: Tono, descripcion: string): ItemMenu["contador"] {
  return valor > 0 ? { valor, tono, descripcion } : undefined;
}

export function armarMenu(c: ContadoresMenu): GrupoMenu[] {
  return [
    {
      id: "inicio",
      titulo: "Inicio",
      items: [{ href: "/", texto: "Resumen general", icono: "grafico" }],
    },
    {
      id: "cartera",
      titulo: "Administración",
      items: [
        {
          href: "/asegurados",
          texto: "Asegurados",
          icono: "usuarios",
          contador: { valor: c.asegurados, tono: "neutro", descripcion: `${c.asegurados} asegurados` },
        },
        {
          href: "/vencimientos",
          texto: "Vencimientos",
          icono: "calendario",
          contador: siHay(c.vencen30, "ambar", `${c.vencen30} vencen en 30 días`),
        },
        { href: "/estadisticas", texto: "Estadísticas", icono: "grafico" },
        { href: "/importar", texto: "Importar cartera", icono: "subir" },
      ],
    },
    {
      id: "agentes",
      titulo: "Agentes",
      items: AGENTES.map((a) => {
        const valor = c.agentes[a.id];
        return {
          href: `/agentes/${a.id}`,
          texto: a.texto,
          icono: a.icono,
          ...(valor === null
            ? { configurar: true }
            : { contador: siHay(valor, a.tono, a.descripcion(valor)) }),
        };
      }),
    },
    {
      id: "captacion",
      titulo: "Captación de clientes",
      items: [
        {
          href: "/leads",
          texto: "Leads del día",
          icono: "radar",
          tambien: ["/resumen", "/resultados"],
          contador: { valor: c.leads, tono: "neutro", descripcion: `${c.leads} leads` },
        },
        { href: "/sectores", texto: "Mis sectores", icono: "grilla" },
      ],
    },
  ];
}

export function itemConfiguracion(c: ContadoresMenu): ItemMenu {
  const n = c.conexionesPendientes;
  return {
    href: "/configuracion",
    texto: "Configuración",
    icono: "engranaje",
    contador: siHay(n, "ambar", `${n} ${n === 1 ? "conexión pendiente" : "conexiones pendientes"}`),
  };
}

function coincide(ruta: string, pathname: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

export function estaActivo(item: Pick<ItemMenu, "href" | "tambien">, pathname: string): boolean {
  return [item.href, ...(item.tambien ?? [])].some((r) => coincide(r, pathname));
}

export { fechaCorta } from "./fechas";
