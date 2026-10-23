import { filasCsv } from "@/fuentes/csv";
import { normalizar } from "@/fuentes/clasificacion";
import { sumarDias } from "./fechas";

// Cartera de clientes actuales: vencimientos que se acercan y clientes con un
// solo ramo (oportunidad de venta cruzada). Se analiza en memoria y no se
// guarda: la cartera tiene datos de personas (Ley 25.326).

export type Poliza = {
  cliente: string;
  cuit: string | null;
  ramos: string[];
  compania: string | null;
  vencimiento: string | null; // AAAA-MM-DD
};

// Sobre el encabezado sin acentos, espacios ni signos ("Fecha de vencimiento" → "fechadevencimiento").
const COLUMNAS: Record<keyof Poliza, RegExp> = {
  cliente: /^(cliente|nombre|razonsocial|asegurado|tomador)/,
  cuit: /^(cuit|cuil|dni|documento|nrodoc)/,
  ramos: /^(ramos?|cobertura|riesgo|seccion|producto)/,
  compania: /^(compania|aseguradora|cia)/,
  vencimiento: /^(vencimiento|vto|fechadevencimiento|fechavencimiento|vigenciahasta|hasta|findevigencia)/,
};

/** "31/12/2026", "31-12-26", "2026-12-31" → "2026-12-31"; si no es fecha, null. */
export function leerFecha(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  const [dia, mes] = [Number(m[1]), Number(m[2])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Lee el CSV exportado de Excel (separado por ";" o ","), con encabezados en la primera fila. */
export async function leerCartera(texto: string): Promise<{ polizas: Poliza[]; avisos: string[] }> {
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  const separador = (primeraLinea.match(/;/g)?.length ?? 0) > (primeraLinea.match(/,/g)?.length ?? 0) ? ";" : ",";
  const polizas: Poliza[] = [];
  const avisos: string[] = [];
  let columnas: Partial<Record<keyof Poliza, string>> | null = null;
  let fila = 1;

  for await (const registro of filasCsv([texto], separador)) {
    fila++;
    if (!columnas) {
      columnas = {};
      for (const encabezado of Object.keys(registro)) {
        const n = normalizar(encabezado).replace(/[^a-z0-9]/g, "");
        for (const [campo, patron] of Object.entries(COLUMNAS) as [keyof Poliza, RegExp][]) {
          if (!columnas[campo] && patron.test(n)) columnas[campo] = encabezado;
        }
      }
      if (!columnas.cliente) {
        avisos.push('No encontré la columna del cliente (por ejemplo "Cliente" o "Asegurado").');
        return { polizas, avisos };
      }
    }
    const valor = (campo: keyof Poliza) => (columnas![campo] ? (registro[columnas![campo]!] ?? "").trim() : "");
    const cliente = valor("cliente");
    if (!cliente) continue;
    const vencimientoTexto = valor("vencimiento");
    const vencimiento = vencimientoTexto ? leerFecha(vencimientoTexto) : null;
    if (vencimientoTexto && !vencimiento) avisos.push(`Fila ${fila}: no entendí la fecha "${vencimientoTexto}".`);
    polizas.push({
      cliente,
      cuit: valor("cuit") || null,
      ramos: valor("ramos")
        .split(/[,;/+]| y /)
        .map((r) => r.trim())
        .filter(Boolean),
      compania: valor("compania") || null,
      vencimiento,
    });
  }
  return { polizas, avisos };
}

// Qué ofrecerle a quien tiene un solo ramo.
const COMPLEMENTOS: [RegExp, string[]][] = [
  [/flota|camion|transporte/, ["ART", "RC", "Carga"]],
  [/\bart\b|riesgos? del trabajo/, ["Flota", "RC", "Integral de comercio"]],
  [/auto|moto|automotor/, ["Hogar", "Accidentes personales", "Vida"]],
  [/hogar|combinado familiar|vivienda/, ["Auto", "Accidentes personales", "Vida"]],
  [/integral|comercio|consorcio/, ["ART", "RC", "Flota"]],
  [/vida|sepelio/, ["Accidentes personales", "Hogar"]],
  [/caucion/, ["RC", "ART", "Todo riesgo construcción"]],
  [/\brc\b|responsabilidad civil|mala praxis/, ["Integral", "ART"]],
];

export function sugerenciasParaRamo(ramo: string): string[] {
  const n = normalizar(ramo);
  return COMPLEMENTOS.find(([patron]) => patron.test(n))?.[1] ?? ["ART", "RC", "Accidentes personales"];
}

export type AnalisisCartera = {
  clientes: number;
  vencimientos: (Poliza & { dias: number })[];
  unSoloRamo: { cliente: string; cuit: string | null; ramo: string; sugerencias: string[] }[];
};

/** Vencimientos de los próximos `dias` días y clientes con un solo ramo. */
export function analizarCartera(polizas: Poliza[], hoy: string, dias = 60): AnalisisCartera {
  const limite = sumarDias(hoy, dias);
  const diasHasta = (fecha: string) =>
    Math.round((Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) - Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))) / 86_400_000);

  const vencimientos = polizas
    .filter((p) => p.vencimiento && p.vencimiento >= hoy && p.vencimiento <= limite)
    .map((p) => ({ ...p, dias: diasHasta(p.vencimiento!) }))
    .sort((a, b) => a.dias - b.dias);

  // Un cliente puede tener una fila por póliza: se juntan por CUIT o, si no hay, por nombre.
  const porCliente = new Map<string, { cliente: string; cuit: string | null; ramos: Set<string> }>();
  for (const p of polizas) {
    const clave = p.cuit?.replace(/\D/g, "") || normalizar(p.cliente);
    const c = porCliente.get(clave) ?? { cliente: p.cliente, cuit: p.cuit, ramos: new Set<string>() };
    for (const r of p.ramos) c.ramos.add(r);
    porCliente.set(clave, c);
  }
  const unSoloRamo = [...porCliente.values()]
    .filter((c) => new Set([...c.ramos].map(normalizar)).size === 1)
    .map((c) => {
      const ramo = [...c.ramos][0];
      return { cliente: c.cliente, cuit: c.cuit, ramo, sugerencias: sugerenciasParaRamo(ramo) };
    })
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "es"));

  return { clientes: porCliente.size, vencimientos, unSoloRamo };
}
