import { celdasCsv } from "@/fuentes/csv";
import { normalizar } from "@/fuentes/clasificacion";
import { diasEntre } from "./fechas";
import { RAMOS_CARTERA, ramoCanonico } from "./ramos";
import { leerXlsx } from "./xlsx";

// Importación de planillas (cartera y liquidaciones): leer CSV o XLSX,
// sugerir a qué dato corresponde cada columna, entender montos y fechas en
// formato argentino y explicar cada problema en castellano.

export type Tabla = { archivo: string; encabezados: string[]; filas: string[][]; separador: string | null };

export const TAMANO_MAXIMO_ARCHIVO = 4 * 1024 * 1024;

/** El separador más usado en la primera línea (fuera de comillas): ";", "," o tabulador. */
export function detectarSeparador(primeraLinea: string): string {
  const sinComillas = primeraLinea.replace(/"[^"]*"/g, "");
  const cuenta = (c: string) => sinComillas.split(c).length - 1;
  return [";", ",", "\t"].sort((a, b) => cuenta(b) - cuenta(a))[0];
}

export async function leerTablaCsv(texto: string, archivo = "archivo.csv"): Promise<Tabla> {
  const separador = detectarSeparador(texto.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "");
  // Las filas vacías se conservan para que los mensajes digan el número de fila real.
  const filas: string[][] = [];
  for await (const celdas of celdasCsv([texto], separador)) filas.push(celdas.map((c) => c.trim()));
  const [encabezados = [], ...resto] = filas;
  return { archivo, encabezados, filas: resto, separador };
}

/** Texto de un CSV: UTF-8 o, si no lo es (Excel en Windows), Windows-1252. */
export function decodificarTexto(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

export async function leerArchivoTabla(archivo: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Tabla> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (/\.xlsx$/i.test(archivo.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const [encabezados = [], ...filas] = await leerXlsx(bytes);
    return { archivo: archivo.name, encabezados, filas, separador: null };
  }
  if (/\.xls$/i.test(archivo.name)) {
    throw new Error('Ese Excel es de un formato viejo (.xls). Abrilo y guardalo como "Libro de Excel (.xlsx)" o como CSV.');
  }
  return leerTablaCsv(decodificarTexto(bytes), archivo.name);
}

// ---------- Columnas ----------

export type CampoImportable<Id extends string = string> = {
  id: Id;
  nombre: string;
  obligatorio?: boolean;
  /** Sobre el encabezado normalizado ("Fin Vigencia" → "fin vigencia"). */
  sinonimos: RegExp;
};

/** Minúsculas, sin tildes ni signos: "N° de Póliza" → "n de poliza". */
export function normalizarEncabezado(encabezado: string): string {
  return normalizar(encabezado).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Para cada columna, el dato que parece ser (o "" si no lo reconoce). Cada dato se usa una sola vez. */
export function sugerirMapeo<Id extends string>(encabezados: string[], campos: CampoImportable<Id>[]): (Id | "")[] {
  const usados = new Set<Id>();
  return encabezados.map((e) => {
    const n = normalizarEncabezado(e);
    const campo = campos.find((c) => !usados.has(c.id) && c.sinonimos.test(n));
    if (!campo) return "";
    usados.add(campo.id);
    return campo.id;
  });
}

export function obligatoriosSinColumna<Id extends string>(mapeo: (Id | "")[], campos: CampoImportable<Id>[]): string[] {
  return campos.filter((c) => c.obligatorio && !mapeo.includes(c.id)).map((c) => c.nombre);
}

// ---------- Valores ----------

/**
 * Montos en formato argentino ("$ 1.234.567,89") y también "1234567.89" o
 * "1,234,567.89". Devuelve null si no es un número.
 */
export function leerMonto(texto: string): number | null {
  let t = texto.replace(/[$\s]|ars/gi, "").replace(/ /g, "");
  if (!t) return null;
  const negativo = /^-|^\(.*\)$/.test(t);
  t = t.replace(/[()-]/g, "");
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // El último separador es el decimal.
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (punto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return negativo ? -n : n;
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Número de serie de Excel (días desde el 30/12/1899) a AAAA-MM-DD. */
function fechaDeSerie(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86_400_000).toISOString().slice(0, 10);
}

export type ResultadoFecha = { iso: string } | { error: string } | null;

/** "05/11/2026", "5-11-26", "2026-11-05", "05/11/2026 00:00" o el número de Excel. Vacío: null. */
export function leerFecha(texto: string): ResultadoFecha {
  const t = texto.trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 20_000 && n < 80_000) return { iso: fechaDeSerie(n) };
  }
  let anio: number, mes: number, dia: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) {
    [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(t);
    if (!m) return { error: `no entendí la fecha "${t}"` };
    [dia, mes, anio] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(anio, mes)) return { error: `la fecha "${t}" no existe` };
  return { iso: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` };
}

/** Dígito verificador de un CUIT o CUIL. */
export function cuitValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(digitos[10]);
}

export type Documento = { digitos: string; texto: string; tipo: "dni" | "cuit" };

/** DNI (7 u 8 números) o CUIT/CUIL (11), con o sin guiones ni puntos. Vacío: null. */
export function leerDocumento(texto: string): Documento | { error: string } | null {
  const t = texto.trim();
  if (!t) return null;
  const digitos = t.replace(/\D/g, "");
  if (digitos.length === 11) {
    return { digitos, texto: `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`, tipo: "cuit" };
  }
  if (digitos.length === 7 || digitos.length === 8) {
    if (/^(20|23|24|27|30|33|34)/.test(digitos) && /[-]/.test(t)) return { error: `el CUIT "${t}" está incompleto` };
    return { digitos, texto: digitos.replace(/\B(?=(\d{3})+(?!\d))/g, "."), tipo: "dni" };
  }
  if (digitos.length > 8 && digitos.length < 11) return { error: `el CUIT "${t}" está incompleto` };
  if (/^(20|23|24|27|30|33|34)/.test(digitos) && digitos.length < 11) return { error: `el CUIT "${t}" está incompleto` };
  return { error: `"${t}" no es un DNI ni un CUIT` };
}

const COMPANIAS_CONOCIDAS: [RegExp, string][] = [
  [/mapfre/, "Mapfre"],
  [/sancor/, "Sancor"],
  [/federacion patronal|fed\.? ?patronal|^fp$/, "Federación Patronal"],
  [/la segunda|^segunda/, "La Segunda"],
  [/fianzas/, "Fianzas y Crédito"],
  [/san cristobal/, "San Cristóbal"],
  [/rivadavia/, "Rivadavia"],
  [/allianz/, "Allianz"],
  [/zurich/, "Zurich"],
  [/provincia/, "Provincia Seguros"],
  [/mercantil andina/, "Mercantil Andina"],
  [/la caja/, "La Caja"],
  [/rus\b|rio uruguay/, "Río Uruguay Seguros"],
  [/experta/, "Experta ART"],
  [/galeno/, "Galeno ART"],
  [/prevencion/, "Prevención ART"],
  [/berkley/, "Berkley"],
  [/meridional/, "Meridional"],
  [/triunfo/, "Triunfo Seguros"],
  [/orbis/, "Orbis"],
  [/holando/, "Holando Seguros"],
];

/** "MAPFRE ARGENTINA" → "Mapfre". Si no la conoce, la deja con mayúscula inicial. */
export function companiaCanonica(texto: string): string {
  const n = normalizar(texto);
  const conocida = COMPANIAS_CONOCIDAS.find(([p]) => p.test(n))?.[1];
  if (conocida) return conocida;
  const t = texto.trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase()) : t;
}

// ---------- Cartera ----------

export type CampoCartera =
  | "nombre"
  | "documento"
  | "ramo"
  | "vigenciaHasta"
  | "compania"
  | "numero"
  | "bien"
  | "prima"
  | "telefono"
  | "email"
  | "vigenciaDesde"
  | "cobertura"
  | "localidad"
  | "domicilio"
  | "tipo"
  | "contacto"
  | "cuotas"
  | "formaPago";

// El orden importa: un encabezado se asigna al primer dato que coincide.
export const CAMPOS_CARTERA: CampoImportable<CampoCartera>[] = [
  { id: "contacto", nombre: "Contacto (empresas)", sinonimos: /^(contacto|nombre (del )?contacto|responsable|persona de contacto)/ },
  { id: "nombre", nombre: "Nombre / razón social", obligatorio: true, sinonimos: /^(asegurado|cliente|razon social|nombre|apellido|tomador|titular)/ },
  { id: "documento", nombre: "DNI / CUIT", obligatorio: true, sinonimos: /^(cuit|cuil|dni|documento|doc|nro doc|n doc|numero de documento|nro de documento)/ },
  { id: "vigenciaDesde", nombre: "Inicio de vigencia", sinonimos: /(inicio|desde|emision)/ },
  { id: "vigenciaHasta", nombre: "Fin de vigencia", obligatorio: true, sinonimos: /(fin|hasta|vencimiento|venc|vto|vigencia)/ },
  { id: "ramo", nombre: "Ramo", obligatorio: true, sinonimos: /^(ramo|ramos|seccion|riesgo$|producto|rama|tipo de seguro)/ },
  { id: "compania", nombre: "Compañía", sinonimos: /^(compania|cia|aseguradora|empresa aseguradora)/ },
  { id: "numero", nombre: "N° de póliza", sinonimos: /(poliza|^nro$|^numero$)/ },
  { id: "bien", nombre: "Bien asegurado", sinonimos: /^(bien|patente|dominio|vehiculo|objeto|riesgo asegurado|descripcion|detalle|ubicacion del riesgo)/ },
  { id: "prima", nombre: "Prima anual", sinonimos: /^(prima|premio|importe|costo)/ },
  { id: "cuotas", nombre: "Cantidad de cuotas", sinonimos: /^(cuotas|cant(idad)? (de )?cuotas)/ },
  { id: "formaPago", nombre: "Forma de pago", sinonimos: /^(forma de pago|medio de pago|pago)/ },
  { id: "cobertura", nombre: "Cobertura", sinonimos: /^(cobertura|plan)/ },
  { id: "telefono", nombre: "Teléfono", sinonimos: /^(tel|telefono|celular|movil|whatsapp)/ },
  { id: "email", nombre: "Email", sinonimos: /^(mail|e ?mail|correo)/ },
  { id: "localidad", nombre: "Localidad", sinonimos: /^(localidad|ciudad|partido)/ },
  { id: "domicilio", nombre: "Domicilio", sinonimos: /^(domicilio|direccion|calle)/ },
  { id: "tipo", nombre: "Persona o empresa", sinonimos: /^(tipo( de)? (persona|cliente|asegurado)|tipo$|persona)/ },
];

export type FilaCartera = {
  fila: number;
  tipo: "persona" | "empresa";
  nombre: string;
  documento: string;
  documentoDigitos: string;
  ramo: string;
  vigenciaHasta: string;
  vigenciaDesde: string | null;
  compania: string | null;
  numero: string | null;
  bien: string | null;
  cobertura: string | null;
  prima: number | null;
  cuotas: number | null;
  formaPago: string | null;
  telefono: string | null;
  email: string | null;
  localidad: string | null;
  domicilio: string | null;
  contacto: string | null;
};

export type Problema = { fila: number; mensaje: string; tipo: "error" | "advertencia" };

export type ValidacionCartera = {
  filas: FilaCartera[];
  problemas: Problema[];
  /** Ramos que no se reconocieron, para elegir a cuál corresponden. */
  ramosDesconocidos: string[];
  faltanObligatorios: string[];
  /** Filas con datos (sin contar las vacías). */
  totalFilas: number;
};

const RAMOS_VALIDOS = new Set<string>(RAMOS_CARTERA.map((r) => r.id));

function tipoDe(texto: string, documento: Documento): "persona" | "empresa" {
  const n = normalizar(texto);
  if (/^(empresa|juridica|j|pj|sociedad)/.test(n)) return "empresa";
  if (/^(persona|fisica|f|pf|particular)/.test(n)) return "persona";
  return documento.tipo === "cuit" && /^3[034]/.test(documento.digitos) ? "empresa" : "persona";
}

/**
 * Valida cada fila según las columnas elegidas. Las filas con errores no se
 * importan; las advertencias se importan igual.
 */
export function validarCartera(
  tabla: Tabla,
  mapeo: (CampoCartera | "")[],
  ramosElegidos: Record<string, string> = {},
): ValidacionCartera {
  const faltanObligatorios = obligatoriosSinColumna(mapeo, CAMPOS_CARTERA);
  const problemas: Problema[] = [];
  const filas: FilaCartera[] = [];
  const desconocidos = new Set<string>();
  const vistas = new Map<string, number>();
  let totalFilas = 0;
  if (faltanObligatorios.length) return { filas, problemas, ramosDesconocidos: [], faltanObligatorios, totalFilas: tabla.filas.length };

  tabla.filas.forEach((celdas, i) => {
    if (!celdas.some((c) => c.trim())) return;
    totalFilas++;
    const fila = i + 2; // la 1 es el encabezado
    const valor = (campo: CampoCartera) => {
      const col = mapeo.indexOf(campo);
      return col >= 0 ? (celdas[col] ?? "").trim() : "";
    };
    const error = (mensaje: string) => problemas.push({ fila, mensaje, tipo: "error" });
    const advertencia = (mensaje: string) => problemas.push({ fila, mensaje, tipo: "advertencia" });
    const errores = problemas.length;

    const nombre = valor("nombre");
    if (!nombre) error("Falta el nombre o la razón social.");

    const doc = leerDocumento(valor("documento"));
    if (!doc) error("Falta el DNI o CUIT.");
    else if ("error" in doc) error(`${doc.error[0].toUpperCase()}${doc.error.slice(1)}.`);
    else if (doc.tipo === "cuit" && !cuitValido(doc.digitos)) advertencia(`Revisá el CUIT "${doc.texto}": el dígito verificador no coincide.`);

    const ramoOriginal = valor("ramo");
    let ramo = "";
    if (!ramoOriginal) error("Falta el ramo.");
    else {
      ramo = ramosElegidos[ramoOriginal] || ramoCanonico(ramoOriginal);
      if (!RAMOS_VALIDOS.has(ramo)) {
        desconocidos.add(ramoOriginal);
        error(`Ramo "${ramoOriginal}" sin reconocer.`);
      }
    }

    const hasta = leerFecha(valor("vigenciaHasta"));
    if (!hasta) error("Falta el fin de vigencia.");
    else if ("error" in hasta) error(`${hasta.error[0].toUpperCase()}${hasta.error.slice(1)}.`);
    const desde = leerFecha(valor("vigenciaDesde"));
    if (desde && "error" in desde) advertencia(`No se toma el inicio de vigencia: ${desde.error}.`);

    const primaTexto = valor("prima");
    const prima = primaTexto ? leerMonto(primaTexto) : null;
    if (primaTexto && prima === null) advertencia(`No entendí la prima "${primaTexto}": queda sin cargar.`);

    let email: string | null = valor("email") || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      advertencia(`El email "${email}" no parece válido: queda sin cargar.`);
      email = null;
    }
    const cuotasNumero = Number(valor("cuotas"));

    if (problemas.length > errores && problemas.slice(errores).some((p) => p.tipo === "error")) return;
    const d = doc as Documento;
    const numero = valor("numero") || null;
    const compania = valor("compania") ? companiaCanonica(valor("compania")) : null;
    const clave = `${d.digitos}|${numero ?? `${ramo}|${compania ?? ""}`}`;
    if (vistas.has(clave)) {
      advertencia(`Repite la póliza de la fila ${vistas.get(clave)}: se toma esta.`);
      const anterior = filas.findIndex((f) => f.fila === vistas.get(clave));
      if (anterior >= 0) filas.splice(anterior, 1);
    }
    vistas.set(clave, fila);
    filas.push({
      fila,
      tipo: tipoDe(valor("tipo"), d),
      nombre,
      documento: d.texto,
      documentoDigitos: d.digitos,
      ramo,
      vigenciaHasta: (hasta as { iso: string }).iso,
      vigenciaDesde: desde && "iso" in desde ? desde.iso : null,
      compania,
      numero,
      bien: valor("bien") || null,
      cobertura: valor("cobertura") || null,
      prima,
      cuotas: Number.isInteger(cuotasNumero) && cuotasNumero >= 1 && cuotasNumero <= 24 ? cuotasNumero : null,
      formaPago: valor("formaPago") || null,
      telefono: valor("telefono") || null,
      email,
      localidad: valor("localidad") || null,
      domicilio: valor("domicilio") || null,
      contacto: valor("contacto") || null,
    });
  });

  problemas.sort((a, b) => a.fila - b.fila || (a.tipo === b.tipo ? 0 : a.tipo === "error" ? -1 : 1));
  return { filas, problemas, ramosDesconocidos: [...desconocidos], faltanObligatorios, totalFilas };
}

export type ResumenCartera = {
  asegurados: number;
  nuevos: number;
  actualizados: number;
  polizas: number;
  vencen30: number;
  filasConErrores: number;
};

/** Lo que va a pasar al importar, para el paso 3. `existentes`: documentos (solo dígitos) ya cargados. */
export function resumirCartera(v: ValidacionCartera, existentes: Set<string>, hoy: string): ResumenCartera {
  const documentos = new Set(v.filas.map((f) => f.documentoDigitos));
  const nuevos = [...documentos].filter((d) => !existentes.has(d)).length;
  const vencenPronto = new Set(
    v.filas.filter((f) => f.vigenciaHasta >= hoy && diasEntre(hoy, f.vigenciaHasta) <= 30).map((f) => f.documentoDigitos),
  );
  return {
    asegurados: documentos.size,
    nuevos,
    actualizados: documentos.size - nuevos,
    polizas: v.filas.length,
    vencen30: vencenPronto.size,
    filasConErrores: new Set(v.problemas.filter((p) => p.tipo === "error").map((p) => p.fila)).size,
  };
}

/** Compañías que vienen en el archivo (para "marcar como no vigentes las que no estén"). */
export function companiasDelArchivo(filas: FilaCartera[]): string[] {
  return [...new Set(filas.map((f) => f.compania).filter((c): c is string => Boolean(c)))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

/** Las filas con errores, con una columna más que explica el problema (para corregir en Excel). */
export function filasParaCorregir(tabla: Tabla, problemas: Problema[]): string[][] {
  const porFila = new Map<number, string[]>();
  for (const p of problemas) if (p.tipo === "error") porFila.set(p.fila, [...(porFila.get(p.fila) ?? []), p.mensaje]);
  return [
    [...tabla.encabezados, "Problema"],
    ...[...porFila.entries()].map(([fila, mensajes]) => [...(tabla.filas[fila - 2] ?? []), mensajes.join(" ")]),
  ];
}

/** Planilla modelo para bajar desde el paso 1. */
export const PLANTILLA_CARTERA: string[][] = [
  [
    "Asegurado",
    "DNI/CUIT",
    "Ramo",
    "Compañía",
    "N° de póliza",
    "Bien asegurado",
    "Cobertura",
    "Inicio de vigencia",
    "Fin de vigencia",
    "Prima anual",
    "Cuotas",
    "Forma de pago",
    "Teléfono",
    "Email",
    "Localidad",
    "Domicilio",
    "Contacto",
  ],
  [
    "Gómez, Lucía",
    "27-31455872-4",
    "Auto",
    "Mapfre",
    "4410-3321908",
    "Peugeot 208 · AF 221 QR",
    "Terceros completo",
    "08/11/2025",
    "08/11/2026",
    "960.000,00",
    "12",
    "Transferencia",
    "223 512-4471",
    "",
    "Mar del Plata",
    "",
    "",
  ],
  [
    "Panadería La Espiga SA",
    "30-70991245-1",
    "Integral de comercio",
    "Sancor",
    "61-200455",
    "Local y cuadra de producción",
    "Incendio, robo y cristales",
    "12/12/2025",
    "12/12/2026",
    "1.450.000,00",
    "6",
    "Rapipago",
    "223 464-2290",
    "laespiga@ejemplo.com.ar",
    "Batán",
    "Batán",
    "Raúl Benítez (dueño)",
  ],
];
