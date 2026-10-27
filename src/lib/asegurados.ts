import type { Asegurado, Poliza } from "@/db/schema";
import { normalizar } from "@/fuentes/clasificacion";
import { diasEntre } from "./fechas";
import { completarPlantilla, nombreDePila } from "./plantillas";
import { ramoCanonico } from "./ramos";

// La lista de asegurados: un resumen por asegurado (ramos, compañías, próximo
// vencimiento, prima), sus alertas, las vistas rápidas y los filtros de la URL.

export type AseguradoConPolizas = Asegurado & { polizas: Poliza[] };

export function esVigente(p: Pick<Poliza, "vigenciaHasta" | "bajaEl">, hoy: string): boolean {
  return !p.bajaEl && (!p.vigenciaHasta || p.vigenciaHasta >= hoy);
}

/** Teléfono y email para avisarle: los generales o, en empresas, los del contacto de administración. */
export function contactoDe(a: Pick<Asegurado, "telefono" | "email" | "contactoTelefono" | "contactoEmail">) {
  return { telefono: a.telefono || a.contactoTelefono || null, email: a.email || a.contactoEmail || null };
}

export type FilaAsegurado = {
  id: number;
  nombre: string;
  tipo: Asegurado["tipo"];
  documento: string | null;
  localidad: string | null;
  ramos: string[];
  companias: string[];
  /** Próximo vencimiento de una póliza vigente. */
  vence: string | null;
  dias: number | null;
  prima: number;
  telefono: boolean;
  email: boolean;
  numeros: string[];
  esEjemplo: boolean;
};

export function resumirAsegurado(a: AseguradoConPolizas, hoy: string): FilaAsegurado {
  const vigentes = a.polizas.filter((p) => esVigente(p, hoy));
  const ramos: string[] = [];
  const companias: string[] = [];
  for (const p of vigentes) {
    const ramo = ramoCanonico(p.ramo);
    if (!ramos.includes(ramo)) ramos.push(ramo);
    if (p.compania && !companias.includes(p.compania)) companias.push(p.compania);
  }
  const fechas = vigentes.map((p) => p.vigenciaHasta).filter((f): f is string => Boolean(f)).sort();
  const vence = fechas[0] ?? null;
  const contacto = contactoDe(a);
  return {
    id: a.id,
    nombre: a.nombre,
    tipo: a.tipo,
    documento: a.documento,
    localidad: a.localidad,
    ramos,
    companias,
    vence,
    dias: vence ? diasEntre(hoy, vence) : null,
    prima: vigentes.reduce((s, p) => s + (p.prima ?? 0), 0),
    telefono: Boolean(contacto.telefono),
    email: Boolean(contacto.email),
    numeros: vigentes.map((p) => p.numero).filter((n): n is string => Boolean(n)),
    esEjemplo: a.esEjemplo,
  };
}

export type Alerta = { texto: string; tono: "rojo" | "ambar" | "azul" | "gris"; icono: "aviso" | "mas" | "telefono" };

export function alertasDe(f: FilaAsegurado): Alerta[] {
  const alertas: Alerta[] = [];
  if (f.dias !== null && f.dias <= 30) {
    alertas.push({ texto: `Vence en ${f.dias} d`, tono: f.dias <= 7 ? "rojo" : "ambar", icono: "aviso" });
  }
  if (f.ramos.length === 1) alertas.push({ texto: "1 solo ramo", tono: "azul", icono: "mas" });
  if (!f.telefono || !f.email) {
    alertas.push({ texto: !f.telefono ? "Sin teléfono" : "Sin email", tono: "gris", icono: "telefono" });
  }
  return alertas;
}

/** Rojo hasta 7 días, ámbar hasta 30, gris después. */
export function tonoDias(dias: number): "rojo" | "ambar" | "gris" {
  return dias <= 7 ? "rojo" : dias <= 30 ? "ambar" : "gris";
}

export type Vista = {
  id: "vencen" | "unramo" | "incompletos" | "empresas";
  titulo: string;
  detalle: string;
  tono: "ambar" | "azul" | "neutro";
  incluye: (f: FilaAsegurado) => boolean;
};

export const VISTAS: Vista[] = [
  { id: "vencen", titulo: "Vencen en 30 días", detalle: "Renovaciones a preparar", tono: "ambar", incluye: (f) => f.dias !== null && f.dias <= 30 },
  { id: "unramo", titulo: "Con un solo ramo", detalle: "Oportunidad de venta cruzada", tono: "azul", incluye: (f) => f.ramos.length === 1 },
  { id: "incompletos", titulo: "Contacto incompleto", detalle: "Sin teléfono o sin email", tono: "neutro", incluye: (f) => !f.telefono || !f.email },
  { id: "empresas", titulo: "Empresas", detalle: "Personas jurídicas", tono: "neutro", incluye: (f) => f.tipo === "empresa" },
];

export type FiltrosAsegurados = {
  vista: Vista["id"] | "";
  q: string;
  ramo: string;
  cia: string;
  venc: "" | "7" | "30" | "90";
  loc: string;
  tipo: "" | "persona" | "empresa";
  pagina: number;
};

type Params = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

export function leerFiltrosAsegurados(params: Params): FiltrosAsegurados {
  const vista = uno(params.vista);
  const venc = uno(params.venc);
  const tipo = uno(params.tipo);
  const pagina = Number(uno(params.pagina));
  return {
    vista: VISTAS.some((v) => v.id === vista) ? (vista as Vista["id"]) : "",
    q: uno(params.q),
    ramo: uno(params.ramo),
    cia: uno(params.cia),
    venc: venc === "7" || venc === "30" || venc === "90" ? venc : "",
    loc: uno(params.loc),
    tipo: tipo === "persona" || tipo === "empresa" ? tipo : "",
    pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
  };
}

/** URL de la lista con los filtros (y, si se pide, el panel de un asegurado abierto). */
export function urlAsegurados(f: FiltrosAsegurados, cambios: Partial<FiltrosAsegurados> & { ver?: number } = {}): string {
  const { ver, ...resto } = cambios;
  const t = { ...f, ...resto };
  // Cambiar un filtro vuelve a la primera página.
  if (Object.keys(resto).some((k) => k !== "pagina")) t.pagina = resto.pagina ?? 1;
  const p = new URLSearchParams();
  if (t.vista) p.set("vista", t.vista);
  if (t.q) p.set("q", t.q);
  if (t.ramo) p.set("ramo", t.ramo);
  if (t.cia) p.set("cia", t.cia);
  if (t.venc) p.set("venc", t.venc);
  if (t.loc) p.set("loc", t.loc);
  if (t.tipo) p.set("tipo", t.tipo);
  if (t.pagina > 1) p.set("pagina", String(t.pagina));
  if (ver) p.set("ver", String(ver));
  const qs = p.toString();
  return qs ? `/asegurados?${qs}` : "/asegurados";
}

export function hayFiltros(f: FiltrosAsegurados): boolean {
  return Boolean(f.vista || f.q || f.ramo || f.cia || f.venc || f.loc || f.tipo);
}

/** Busca por nombre (sin importar tildes), documento o número de póliza. */
export function coincideBusqueda(f: FilaAsegurado, q: string): boolean {
  if (!q) return true;
  const buscado = normalizar(q);
  if (normalizar(f.nombre).includes(buscado)) return true;
  const digitos = q.replace(/\D/g, "");
  if (digitos.length >= 4 && (f.documento ?? "").replace(/\D/g, "").includes(digitos)) return true;
  const compacto = buscado.replace(/[\s.]/g, "");
  return compacto.length >= 3 && f.numeros.some((n) => normalizar(n).replace(/[\s.]/g, "").includes(compacto));
}

/** Filtra y ordena por próximo vencimiento (los que no tienen fecha, al final). */
export function filtrarAsegurados(filas: FilaAsegurado[], f: FiltrosAsegurados): FilaAsegurado[] {
  const vista = VISTAS.find((v) => v.id === f.vista);
  return filas
    .filter(
      (r) =>
        (!vista || vista.incluye(r)) &&
        (!f.ramo || r.ramos.includes(f.ramo)) &&
        (!f.cia || r.companias.includes(f.cia)) &&
        (!f.venc || (r.dias !== null && r.dias <= Number(f.venc))) &&
        (!f.loc || r.localidad === f.loc) &&
        (!f.tipo || r.tipo === f.tipo) &&
        coincideBusqueda(r, f.q),
    )
    .sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity) || a.nombre.localeCompare(b.nombre, "es"));
}

export const POR_PAGINA = 25;

export function paginar<T>(filas: T[], pagina: number): { filas: T[]; paginas: number; pagina: number } {
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  return { filas: filas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA), paginas, pagina: actual };
}

// ---------- Panel y ficha ----------

export type GrupoVencimiento = { fecha: string; dias: number; polizas: Poliza[]; total: number };

/** Pólizas vigentes agrupadas por fecha de vencimiento, las más cercanas primero. */
export function gruposDeVencimiento(polizas: Poliza[], hoy: string, cuantos = 3): GrupoVencimiento[] {
  const porFecha = new Map<string, Poliza[]>();
  for (const p of polizas) {
    if (!p.vigenciaHasta || !esVigente(p, hoy)) continue;
    porFecha.set(p.vigenciaHasta, [...(porFecha.get(p.vigenciaHasta) ?? []), p]);
  }
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, cuantos)
    .map(([fecha, lista]) => ({
      fecha,
      dias: diasEntre(hoy, fecha),
      polizas: lista,
      total: lista.reduce((s, p) => s + (p.prima ?? 0), 0),
    }));
}

/** "Transportes Del Atlántico SRL" → "TD"; "Gómez, Lucía" → "GL". */
export function iniciales(nombre: string): string {
  const palabras = nombre.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  return ((palabras[0]?.[0] ?? "") + (palabras[1]?.[0] ?? "")).toUpperCase();
}

/** CUIT para empresas; CUIL si una persona tiene 11 dígitos; DNI si no. */
export function tipoDocumento(a: Pick<Asegurado, "tipo" | "documento">): string {
  if (a.tipo === "empresa") return "CUIT";
  return (a.documento ?? "").replace(/\D/g, "").length === 11 ? "CUIL" : "DNI";
}

export function subtituloAsegurado(a: Pick<Asegurado, "tipo" | "documento" | "localidad" | "clienteDesde">): string {
  return [
    a.tipo === "empresa" ? "Empresa" : "Persona",
    a.documento && `${tipoDocumento(a)} ${a.documento}`,
    a.localidad,
    a.clienteDesde && `cliente desde ${a.clienteDesde}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Enlace para llamar desde el celular: "223 495-1180" → "tel:+542234951180". */
export function enlaceLlamada(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "").replace(/^0/, "");
  return `tel:${digitos.startsWith("54") ? "+" : "+54"}${digitos}`;
}

/** "Hola Lucía", "Hola Marcela" (contacto de administración) o "Hola" a secas. */
export function saludoPara(a: Pick<Asegurado, "tipo" | "nombre" | "contactoNombre">): string {
  if (a.tipo === "persona") return `Hola ${nombreDePila(a.nombre, false)}`;
  const contacto = a.contactoNombre?.replace(/\(.*\)/, "").replace(/^(dra?|ing|lic|sr|sra)\.?\s+/i, "").trim();
  return contacto ? `Hola ${contacto.split(/\s+/)[0]}` : "Hola";
}

const PLANTILLA_AVISO =
  "{saludo}, ¿cómo estás? Te escribo porque el {vence} vence tu seguro de {ramo} con {compañía}. ¿Querés que lo renovemos así o preferís que te cotice otras opciones? Saludos, {productor}";

/** Borrador del aviso de vencimiento. La firma ({productor}) se completa al enviarlo. */
export function textoAvisoVencimiento(
  a: Pick<Asegurado, "tipo" | "nombre" | "contactoNombre">,
  polizas: Pick<Poliza, "ramo" | "compania" | "vigenciaHasta">[],
): string {
  const ramos = [...new Set(polizas.map((p) => p.ramo.toLowerCase()))];
  const companias = [...new Set(polizas.map((p) => p.compania).filter(Boolean))];
  const vence = polizas.map((p) => p.vigenciaHasta).filter(Boolean).sort()[0] ?? "";
  return completarPlantilla(PLANTILLA_AVISO, {
    saludo: saludoPara(a),
    vence: vence ? `${vence.slice(8, 10)}/${vence.slice(5, 7)}` : "",
    ramo: unirConY(ramos),
    compañía: unirConY(companias as string[]),
  });
}

export function unirConY(lista: string[]): string {
  if (lista.length <= 1) return lista[0] ?? "";
  return `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`;
}
