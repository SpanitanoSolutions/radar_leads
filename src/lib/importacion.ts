import type { DatoCompania } from "@/db/schema";
import { celdasCsv } from "@/fuentes/csv";
import { normalizar } from "@/fuentes/clasificacion";
import { diasEntre, fechaCorta } from "./fechas";
import type { FormatoCartera } from "./formatos-cartera";
import { pesosConCentavos } from "./formato";
import { RAMOS_CARTERA, ramoCanonico } from "./ramos";
import { leerXlsx } from "./xlsx";

// Importación de planillas (cartera y liquidaciones): leer CSV o XLSX,
// sugerir a qué dato corresponde cada columna, entender montos y fechas en
// formato argentino y explicar cada problema en castellano.

export type Tabla = {
  archivo: string;
  encabezados: string[];
  filas: string[][];
  separador: string | null;
  /** Número de fila del archivo donde empiezan los datos (el encabezado está justo arriba). */
  filaInicial: number;
};

export const TAMANO_MAXIMO_ARCHIVO = 4 * 1024 * 1024;

/** El separador más usado en la línea (fuera de comillas): ";", "," o tabulador. */
export function detectarSeparador(linea: string): string {
  const sinComillas = linea.replace(/"[^"]*"/g, "");
  const cuenta = (c: string) => sinComillas.split(c).length - 1;
  return [";", ",", "\t"].sort((a, b) => cuenta(b) - cuenta(a))[0];
}

const vacia = (fila: string[]) => !fila.some((c) => c.trim());

/**
 * Algunas compañías exportan con filas vacías o un título arriba de los
 * encabezados: el encabezado es la primera fila que tiene al menos la mitad de
 * las celdas llenas de la más completa, entre las 20 que siguen a la primera
 * fila con datos.
 */
function ubicarEncabezado(filas: string[][]): number {
  const primera = Math.max(0, filas.findIndex((f) => !vacia(f)));
  const llenas = filas.slice(primera, primera + 20).map((f) => f.filter((c) => c.trim()).length);
  const minimo = Math.max(2, Math.max(0, ...llenas) / 2);
  return primera + Math.max(0, llenas.findIndex((n) => n >= minimo));
}

/**
 * `filas` tiene que traer las vacías en su lugar: la fila i es la i + 1 del
 * archivo, y así los avisos dicen el número que se ve en Excel. Las vacías
 * del final se sacan (no corren ningún número).
 */
function armarTabla(archivo: string, filas: string[][], separador: string | null): Tabla {
  const inicio = ubicarEncabezado(filas);
  let fin = filas.length;
  while (fin > inicio + 1 && vacia(filas[fin - 1])) fin--;
  return { archivo, encabezados: filas[inicio] ?? [], filas: filas.slice(inicio + 1, fin), separador, filaInicial: inicio + 2 };
}

export async function leerTablaCsv(texto: string, archivo = "archivo.csv"): Promise<Tabla> {
  // La primera línea con algún separador: puede haber un título arriba.
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/, 20);
  const separador = detectarSeparador(lineas.find((l) => /[;,\t]/.test(l.replace(/"[^"]*"/g, ""))) ?? "");
  // Las filas vacías se conservan para que los mensajes digan el número de fila real.
  const filas: string[][] = [];
  for await (const celdas of celdasCsv([texto], separador, { conservarVacias: true })) filas.push(celdas.map((c) => c.trim()));
  return armarTabla(archivo, filas, separador);
}

/** Texto de un CSV: UTF-8 o, si no lo es (Excel en Windows), Windows-1252. */
export function decodificarTexto(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

export async function leerArchivoTabla(archivo: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Tabla> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (/\.xlsx$/i.test(archivo.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return armarTabla(archivo.name, await leerXlsx(bytes), null);
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
  /** Se puede elegir en varias columnas a la vez. */
  repetible?: boolean;
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
    if (!campo.repetible) usados.add(campo.id);
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

/**
 * Un monto en pesos que llegó sin la coma decimal: "18061979.00" era
 * $ 180.619,79, y "734524.00" era $ 73.452,40 (con la coma también se perdió
 * el cero final de los centavos). Por eso no alcanza con dividir por 100: se
 * elige la escala que más se parece a `referencia`, otro monto del mismo tipo
 * (la factura siguiente de la póliza). Sin referencia, los dos últimos números
 * son los centavos, que es lo más común. Si el monto ya trae centavos, se toma
 * como viene. `corregido`: hubo que adivinar dónde iba la coma.
 */
export function leerMontoSinComa(texto: string, referencia: number | null = null): { monto: number; corregido: boolean } | null {
  const crudo = leerMonto(texto);
  if (crudo === null || crudo <= 0) return null;
  if (!Number.isInteger(crudo)) return { monto: crudo, corregido: false };
  const escalas = [crudo / 100, crudo / 10, crudo];
  const distancia = (monto: number) => Math.abs(Math.log(monto / referencia!));
  const monto = referencia && referencia > 0 ? escalas.reduce((a, b) => (distancia(b) < distancia(a) ? b : a)) : escalas[0];
  return { monto: Math.round(monto * 100) / 100, corregido: true };
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

/**
 * DNI (7 u 8 números) o CUIT/CUIL (11), con o sin guiones ni puntos. Acepta la
 * letra y los ceros con que algunas compañías los completan ("D0000031000444",
 * "J30-70000000-8"). Vacío: null.
 */
export function leerDocumento(texto: string): Documento | { error: string } | null {
  const t = texto.trim();
  if (!t) return null;
  const digitos = t.replace(/\D/g, "").replace(/^0+/, "");
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

export const COMPANIAS: string[] = COMPANIAS_CONOCIDAS.map(([, nombre]) => nombre);

/** "MAPFRE ARGENTINA" → "Mapfre". Si no la conoce, la deja con mayúscula inicial. */
export function companiaCanonica(texto: string): string {
  const n = normalizar(texto);
  const conocida = COMPANIAS_CONOCIDAS.find(([p]) => p.test(n))?.[1];
  if (conocida) return conocida;
  const t = texto.trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase()) : t;
}

/** La compañía conocida que se nombra en un texto: "Cartera vigente Mapfre 2026.csv" → "Mapfre". */
export function companiaMencionada(texto: string): string | null {
  const n = normalizar(texto).replace(/[^a-z0-9]+/g, " ");
  return COMPANIAS_CONOCIDAS.find(([p]) => p.test(n))?.[1] ?? null;
}

// ---------- Cartera ----------

export type CampoCartera =
  | "nombre"
  | "documento"
  | "ramo"
  | "vigenciaHasta"
  | "compania"
  | "numero"
  | "certificado"
  | "bien"
  | "prima"
  | "premio"
  | "sumaAsegurada"
  | "producto"
  | "telefono"
  | "email"
  | "vigenciaDesde"
  | "cobertura"
  | "localidad"
  | "domicilio"
  | "codigoPostal"
  | "fechaNacimiento"
  | "tipo"
  | "contacto"
  | "cuotas"
  | "formaPago"
  | "otro";

// Se importa lo que el productor necesita ver en el día a día de sus pólizas y
// asegurados. Lo que no tiene un dato propio en UNIQO se guarda igual como
// "otro dato" de la póliza y se muestra en la ficha. Solo se deja afuera lo
// vacío, lo repetido o lo que viene roto, y nunca se estima un valor.
// El orden importa: un encabezado se asigna al primer dato que coincide.
export const CAMPOS_CARTERA: CampoImportable<CampoCartera>[] = [
  { id: "contacto", nombre: "Contacto (empresas)", sinonimos: /^(contacto|nombre (del )?contacto|responsable|persona de contacto)/ },
  {
    id: "nombre",
    nombre: "Nombre / razón social",
    obligatorio: true,
    sinonimos: /^(asegurado|cliente|razon social|nombre|apellido|tomador|titular|denominacion)/,
  },
  {
    id: "documento",
    nombre: "DNI / CUIT",
    obligatorio: true,
    sinonimos: /^(cuit|cuil|dni|documento|doc|(n|nro|numero) (de )?(doc|cuit|cuil|dni))/,
  },
  { id: "vigenciaDesde", nombre: "Inicio de vigencia", sinonimos: /(inicio|desde|emision)/ },
  { id: "vigenciaHasta", nombre: "Fin de vigencia", obligatorio: true, sinonimos: /(fin|hasta|vencimiento|venc|vto|vigencia|\bvig\b)/ },
  // "producto" sí, "productor" no.
  { id: "ramo", nombre: "Ramo", obligatorio: true, sinonimos: /^(ramos?\b|seccion|riesgo$|producto\b|rama\b|tipo de seguro)/ },
  // Obligatoria para conciliar liquidaciones y para "Reemplazar"; puede elegirse para todo el archivo.
  { id: "compania", nombre: "Compañía", obligatorio: true, sinonimos: /^(compania|cia|aseguradora|empresa aseguradora)/ },
  { id: "numero", nombre: "N° de póliza", sinonimos: /(poliza|^nro$|^numero$)/ },
  { id: "certificado", nombre: "N° de certificado", sinonimos: /^(certificado|nro certificado|cert)\b/ },
  { id: "bien", nombre: "Bien asegurado", sinonimos: /^(bien|patente|dominio|vehiculo|objeto|riesgo asegurado|descripcion|detalle|ubicacion del riesgo)/ },
  { id: "producto", nombre: "Producto o plan de la compañía", sinonimos: /^producto\b/ },
  { id: "prima", nombre: "Prima anual", sinonimos: /^(prima|importe|costo)/ },
  { id: "premio", nombre: "Premio anual (con impuestos)", sinonimos: /^premio/ },
  { id: "sumaAsegurada", nombre: "Suma asegurada", sinonimos: /^(suma asegurada|suma aseg|capital asegurado)/ },
  { id: "cuotas", nombre: "Cantidad de cuotas", sinonimos: /^(cuotas|cant(idad)? (de )?cuotas)/ },
  { id: "formaPago", nombre: "Forma de pago", sinonimos: /^(forma de (pago|cobro)|medio de (pago|cobro)|pago|cobro)/ },
  { id: "cobertura", nombre: "Cobertura", sinonimos: /^(cobertura|plan)/ },
  { id: "telefono", nombre: "Teléfono", sinonimos: /^(tel|telefono|celular|movil|whatsapp)/ },
  { id: "email", nombre: "Email", sinonimos: /^(mail|e ?mail|correo)/ },
  { id: "localidad", nombre: "Localidad", sinonimos: /^(localidad|ciudad|partido)/ },
  { id: "domicilio", nombre: "Domicilio", sinonimos: /^(domicilio|direccion|calle)/ },
  { id: "codigoPostal", nombre: "Código postal", sinonimos: /^(cod(igo)? postal|cp$|c p$)/ },
  { id: "fechaNacimiento", nombre: "Fecha de nacimiento", sinonimos: /^(fecha (de )?nacimiento|fec(ha)? nac|f nac|nacimiento)/ },
  { id: "tipo", nombre: "Persona o empresa", sinonimos: /^(tipo( de)? (persona|cliente|asegurado)|tipo$|persona)/ },
  // Lo que no tiene un dato propio: se muestra en la póliza tal como viene.
  { id: "otro", nombre: "Otro dato (se muestra en la póliza)", repetible: true, sinonimos: /(?!)/ },
];

export type FilaCartera = {
  fila: number;
  /** Cómo se reconoce al asegurado: los números del documento o, si no tiene, el nombre. */
  clave: string;
  tipo: "persona" | "empresa";
  nombre: string;
  /** Si viene mal, tal como vino. */
  documento: string | null;
  documentoDigitos: string | null;
  ramo: string;
  vigenciaHasta: string | null;
  /** Si la fecha de fin es la del período facturado y no el vencimiento (ver `finDelPeriodo` del formato). */
  finDelPeriodo: string | null;
  vigenciaDesde: string | null;
  compania: string | null;
  numero: string | null;
  bien: string | null;
  cobertura: string | null;
  producto: string | null;
  prima: number | null;
  premio: number | null;
  sumaAsegurada: number | null;
  cuotas: number | null;
  formaPago: string | null;
  /** Lo demás que trae la compañía sobre la póliza. */
  datosCompania: DatoCompania[];
  telefono: string | null;
  email: string | null;
  localidad: string | null;
  domicilio: string | null;
  codigoPostal: string | null;
  fechaNacimiento: string | null;
  contacto: string | null;
  /** Datos que se completaron con un relleno o vinieron mal: al reimportar no pisan lo que ya está cargado. */
  provisorios: DatoProvisorio[];
};

export type DatoProvisorio = "nombre" | "documento" | "tipo" | "ramo";

/**
 * Los "otros datos" de una póliza al reimportar: lo nuevo actualiza el dato
 * con el mismo nombre y lo que el archivo no trae queda como estaba. Nunca se
 * pierde un dato de una importación anterior.
 */
export function combinarDatosCompania(anteriores: DatoCompania[] | null, nuevos: DatoCompania[]): DatoCompania[] | null {
  const combinados = (anteriores ?? []).map((d) => nuevos.find((n) => n.etiqueta === d.etiqueta) ?? d);
  for (const n of nuevos) if (!combinados.some((d) => d.etiqueta === n.etiqueta)) combinados.push(n);
  return combinados.length ? combinados : null;
}

/**
 * Ninguna póliza del archivo se deja afuera. "error": falta un dato
 * obligatorio o viene mal; la póliza se importa igual y queda para corregir.
 * "advertencia": un dato opcional no se pudo leer y se guarda tal como vino.
 * "omitida": la fila no es una póliza (totales, notas al pie).
 */
export type Problema = { fila: number; mensaje: string; tipo: "error" | "advertencia" | "omitida" };

export type ValidacionCartera = {
  filas: FilaCartera[];
  problemas: Problema[];
  /** Ramos que no se reconocieron, para elegir a cuál corresponden. */
  ramosDesconocidos: string[];
  faltanObligatorios: string[];
  /** Filas con datos (sin contar las vacías). Cuadra: filas.length = totalFilas - unidas - noSonPolizas. */
  totalFilas: number;
  /** Filas que se sumaron a otra póliza: sus certificados, o la misma póliza repetida. */
  unidas: number;
  /** Filas que no son pólizas (totales, notas al pie). */
  noSonPolizas: number;
};

const RAMOS_VALIDOS = new Set<string>(RAMOS_CARTERA.map((r) => r.id));

/** Cómo se reconoce a un asegurado entre importaciones: por su documento o, si no tiene, por su nombre. */
export function claveDeAsegurado(documentoDigitos: string | null, nombre: string): string {
  return documentoDigitos || `nombre:${normalizar(nombre).replace(/\s+/g, " ").trim()}`;
}

/** Cómo se reconoce una póliza entre importaciones: por compañía y número, sin espacios ni mayúsculas. */
export function claveDePoliza(compania: string, numero: string): string {
  return `${compania}#${numero.replace(/\s/g, "").toLowerCase()}`;
}

function tipoDe(texto: string, documento: Documento | null): "persona" | "empresa" {
  const n = normalizar(texto);
  if (/^(empresa|juridica|j|pj|sociedad)/.test(n)) return "empresa";
  if (/^(persona|fisica|f|pf|particular)/.test(n)) return "persona";
  return documento?.tipo === "cuit" && /^3[034]/.test(documento.digitos) ? "empresa" : "persona";
}

function conMayuscula(texto: string): string {
  return texto[0].toUpperCase() + texto.slice(1);
}

/** Sin ninguno de estos datos, la fila no es una póliza: totales o notas al pie. */
const DATOS_DE_POLIZA: CampoCartera[] = ["nombre", "documento", "ramo", "vigenciaHasta"];

/** Los datos obligatorios sin columna. La compañía puede venir elegida para todo el archivo. */
export function faltanEnCartera(mapeo: (CampoCartera | "")[], companiaArchivo: string | null = null): string[] {
  return obligatoriosSinColumna(
    mapeo,
    CAMPOS_CARTERA.filter((c) => !(c.id === "compania" && companiaArchivo?.trim())),
  );
}

/** 8 a 13 números y sin una cifra repetida 7 veces ("000000000", "022344444444"). */
function telefonoValido(texto: string): boolean {
  const digitos = texto.replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 13 && !/(\d)\1{6}/.test(digitos);
}

/**
 * Las columnas sin relacionar que traen datos se guardan como "otro dato": mejor
 * de más que perder algo que el productor necesita. `omitir`: las que se dejan
 * afuera a propósito.
 */
export function conOtrosDatos(
  tabla: Tabla,
  mapeo: (CampoCartera | "")[],
  omitir: (columna: number) => boolean = () => false,
): (CampoCartera | "")[] {
  return mapeo.map((campo, col) =>
    campo || omitir(col) || !tabla.encabezados[col]?.trim() || !tabla.filas.some((f) => f[col]?.trim()) ? campo : "otro",
  );
}

/** "CANT. SINIESTROS" → "Cant. siniestros". */
function etiquetaDe(encabezado: string): string {
  const t = encabezado.trim();
  return t === t.toUpperCase() ? t[0] + t.slice(1).toLowerCase() : t;
}

/** Con qué monto comparar uno que llegó sin la coma: el de la misma póliza o, si no tiene, el típico de su grupo. */
type ReferenciaMonto = { monto: number; propia: boolean };

/** Un "otro dato" de la póliza, con el nombre y el formato que le da el formato de la compañía. Vacío: null. */
function datoCompania(
  encabezado: string,
  celda: string,
  formato: FormatoCartera | null,
  referencia: ReferenciaMonto | null = null,
): DatoCompania | null {
  const valor = celda.trim();
  if (!valor) return null;
  const conocido = formato?.otros[normalizarEncabezado(encabezado)];
  const etiqueta = conocido?.etiqueta ?? etiquetaDe(encabezado);
  if (conocido?.sinCero && /^0+([.,]0+)?$/.test(valor)) return null;
  if (conocido?.tipo !== "monto") return { etiqueta, valor };
  if (conocido.sinComaDecimal) {
    const leido = leerMontoSinComa(valor, referencia?.monto ?? null);
    if (!leido) return null;
    // Sin otra factura de la misma póliza para comparar, el lugar de la coma es una suposición.
    const aConfirmar = leido.corregido && !referencia?.propia;
    return { etiqueta, valor: pesosConCentavos(leido.monto) + (aConfirmar ? " (a confirmar)" : "") };
  }
  // Un monto en cero es que la compañía no lo informa.
  const monto = leerMonto(valor);
  return monto ? { etiqueta, valor: pesosConCentavos(monto) } : null;
}

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/**
 * Para las columnas que llegan sin la coma decimal, de dónde sale la
 * referencia de cada fila: el monto que el formato dice comparar o, si la
 * póliza no lo tiene, la mediana de ese monto entre las de su grupo (la misma
 * sección) en el archivo.
 */
function referenciasSinComa(tabla: Tabla, formato: FormatoCartera | null): (celdas: string[], col: number) => ReferenciaMonto | null {
  const columna = (encabezado: string) => tabla.encabezados.findIndex((e) => normalizarEncabezado(e) === encabezado);
  const porColumna = new Map<number, { comparar: number; agrupar: number; medianas: Map<string, number> }>();
  tabla.encabezados.forEach((encabezado, col) => {
    const sinComa = formato?.otros[normalizarEncabezado(encabezado)]?.sinComaDecimal;
    if (!sinComa) return;
    const comparar = columna(sinComa.comparar);
    const agrupar = sinComa.agrupar ? columna(sinComa.agrupar) : -1;
    const grupos = new Map<string, number[]>();
    for (const celdas of tabla.filas) {
      const monto = comparar >= 0 ? leerMonto(celdas[comparar] ?? "") : null;
      if (!monto || monto <= 0) continue;
      const grupo = agrupar >= 0 ? (celdas[agrupar] ?? "").trim() : "";
      grupos.set(grupo, [...(grupos.get(grupo) ?? []), monto]);
    }
    porColumna.set(col, { comparar, agrupar, medianas: new Map([...grupos].map(([g, v]) => [g, mediana(v)])) });
  });
  return (celdas, col) => {
    const config = porColumna.get(col);
    if (!config) return null;
    const propio = config.comparar >= 0 ? leerMonto(celdas[config.comparar] ?? "") : null;
    if (propio && propio > 0) return { monto: propio, propia: true };
    const tipico = config.medianas.get(config.agrupar >= 0 ? (celdas[config.agrupar] ?? "").trim() : "");
    return tipico ? { monto: tipico, propia: false } : null;
  };
}

function sumar(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

/** Los certificados de una misma póliza (flotas, AP colectivos) quedan como una sola: se suman los importes. */
function sumarCertificado(poliza: FilaCartera, certificado: FilaCartera): FilaCartera {
  return {
    ...certificado,
    ...Object.fromEntries(Object.entries(poliza).filter(([, v]) => v !== null)),
    prima: sumar(poliza.prima, certificado.prima),
    premio: sumar(poliza.premio, certificado.premio),
    sumaAsegurada: sumar(poliza.sumaAsegurada, certificado.sumaAsegurada),
    vigenciaDesde: [poliza.vigenciaDesde, certificado.vigenciaDesde].filter((d) => d !== null).sort()[0] ?? null,
    vigenciaHasta: [poliza.vigenciaHasta, certificado.vigenciaHasta].filter((d) => d !== null).sort().at(-1) ?? null,
    finDelPeriodo: [poliza.finDelPeriodo, certificado.finDelPeriodo].filter((d) => d !== null).sort().at(-1) ?? null,
    datosCompania: [
      ...poliza.datosCompania,
      ...certificado.datosCompania.filter((d) => !poliza.datosCompania.some((p) => p.etiqueta === d.etiqueta)),
    ],
  };
}

const FACTURAS_POR_ANIO: Record<string, number> = { mensual: 12, bimestral: 6, trimestral: 4, cuatrimestral: 3, semestral: 2, anual: 1 };

/** Cuántas facturas hace la compañía al año según cómo factura ("MENSUAL" → 12). Si no se sabe, null. */
export function facturasPorAnio(texto: string): number | null {
  return FACTURAS_POR_ANIO[normalizarEncabezado(texto)] ?? null;
}

/** 4 → "trimestral". */
function nombreFacturacion(facturas: number): string {
  return Object.entries(FACTURAS_POR_ANIO).find(([, n]) => n === facturas)?.[0] ?? `${facturas} por año`;
}

/** `premioSinVerificar`: el premio llegó sin la coma y no hubo con qué compararlo. */
type PrimaCalculada = { prima: number; detalle: DatoCompania; premioSinVerificar: boolean };

/**
 * La prima anual de las compañías que solo informan el premio de cada
 * factura: ese premio por las facturas que hacen al año. Se toma el de la
 * última factura o, si la póliza todavía no tiene, el de la anterior. Si la
 * compañía no dice cómo factura, se supone según la sección y queda "a
 * confirmar".
 */
function calculadoraDePrima(
  tabla: Tabla,
  formato: FormatoCartera | null,
  referenciaDe: (celdas: string[], col: number) => ReferenciaMonto | null,
): (celdas: string[]) => PrimaCalculada | null {
  const regla = formato?.primaAnual;
  if (!formato || !regla) return () => null;
  const columna = (encabezado: string | undefined) =>
    encabezado ? tabla.encabezados.findIndex((e) => normalizarEncabezado(e) === encabezado) : -1;
  const colPremio = columna(regla.premio);
  const colAnterior = columna(regla.premioAnterior);
  const colFacturacion = columna(regla.facturacion);
  const colGrupo = columna(regla.siNoInforma?.agrupar);
  const anteriorSinComa = Boolean(regla.premioAnterior && formato.otros[regla.premioAnterior]?.sinComaDecimal);

  return (celdas) => {
    const facturacion = colFacturacion >= 0 ? (celdas[colFacturacion] ?? "").trim() : "";
    let facturas = facturasPorAnio(facturacion);
    // Solo se supone cuando la columna viene vacía, no cuando dice algo que no se entiende.
    const supuesta = !facturacion && colGrupo >= 0 && Boolean(regla.siNoInforma);
    if (supuesta) facturas = regla.siNoInforma!.facturas[normalizarEncabezado(celdas[colGrupo] ?? "")] ?? null;
    if (!facturas) return null;
    let base: { monto: number; factura: string; aConfirmar: boolean } | null = null;
    const ultimo = colPremio >= 0 ? leerMonto(celdas[colPremio] ?? "") : null;
    if (ultimo && ultimo > 0) {
      base = { monto: ultimo, factura: "la última factura", aConfirmar: false };
    } else if (colAnterior >= 0 && anteriorSinComa) {
      const referencia = referenciaDe(celdas, colAnterior);
      const leido = leerMontoSinComa(celdas[colAnterior] ?? "", referencia?.monto ?? null);
      if (leido) base = { monto: leido.monto, factura: "la factura anterior", aConfirmar: leido.corregido && !referencia?.propia };
    } else if (colAnterior >= 0) {
      const anterior = leerMonto(celdas[colAnterior] ?? "");
      if (anterior && anterior > 0) base = { monto: anterior, factura: "la factura anterior", aConfirmar: false };
    }
    if (!base) return null;
    const como = [`premio de ${base.factura}, con impuestos`, ...(supuesta ? [`facturación ${nombreFacturacion(facturas)} supuesta`] : [])];
    return {
      prima: Math.round(base.monto * facturas * 100) / 100,
      detalle: {
        etiqueta: "Cómo se calculó la prima anual",
        valor: `${pesosConCentavos(base.monto)} × ${facturas} (${como.join("; ")})${base.aConfirmar || supuesta ? " (a confirmar)" : ""}`,
      },
      premioSinVerificar: base.aConfirmar,
    };
  };
}

export type OpcionesCartera = {
  /** Ramo que eligió el productor para los que no se reconocen. */
  ramos?: Record<string, string>;
  /** La compañía de todas las filas cuando el archivo no la trae en una columna. */
  compania?: string | null;
  /** El formato de la compañía, si se reconoció. */
  formato?: FormatoCartera | null;
};

/** Los importes de cada certificado (o fila) que se unió en una póliza, para que no se pierdan. */
function detalleDeEntrada(id: string, p: FilaCartera): string {
  const importes = [
    p.prima !== null && `prima ${pesosConCentavos(p.prima)}`,
    p.premio !== null && `premio ${pesosConCentavos(p.premio)}`,
    p.sumaAsegurada !== null && `suma ${pesosConCentavos(p.sumaAsegurada)}`,
  ].filter(Boolean);
  return `${id.startsWith("fila ") ? id : `N° ${id}`}${importes.length ? `: ${importes.join(", ")}` : ""}`;
}

const ORDEN_PROBLEMAS: Record<Problema["tipo"], number> = { error: 0, advertencia: 1, omitida: 2 };

/**
 * Valida cada fila según las columnas elegidas. Ninguna póliza se deja
 * afuera: si un dato falta o viene mal, la póliza se importa igual y el
 * problema queda anotado para corregirlo; lo que no se pudo leer se guarda
 * tal como vino.
 */
export function validarCartera(tabla: Tabla, mapeo: (CampoCartera | "")[], opciones: OpcionesCartera = {}): ValidacionCartera {
  const { ramos: ramosElegidos = {}, compania: companiaArchivo = null, formato = null } = opciones;
  const hoy = new Date().toISOString().slice(0, 10);
  const faltanObligatorios = faltanEnCartera(mapeo, companiaArchivo);
  const problemas: Problema[] = [];
  const desconocidos = new Set<string>();
  /** Por póliza, sus entradas: los certificados ("" si el archivo no los trae) o las filas repetidas. */
  const polizas = new Map<string, Map<string, { poliza: FilaCartera; celdas: string[] }>>();
  let totalFilas = 0;
  let unidas = 0;
  let noSonPolizas = 0;
  if (faltanObligatorios.length) {
    return { filas: [], problemas, ramosDesconocidos: [], faltanObligatorios, totalFilas: tabla.filas.filter((f) => !vacia(f)).length, unidas, noSonPolizas };
  }
  const referenciaDe = referenciasSinComa(tabla, formato);
  const calcularPrima = calculadoraDePrima(tabla, formato, referenciaDe);
  const colFacturacion = formato?.finDelPeriodo
    ? tabla.encabezados.findIndex((e) => normalizarEncabezado(e) === formato.finDelPeriodo!.facturacion)
    : -1;

  tabla.filas.forEach((celdas, i) => {
    if (!celdas.some((c) => c.trim())) return;
    totalFilas++;
    const fila = i + tabla.filaInicial;
    const valor = (campo: CampoCartera) => {
      const col = mapeo.indexOf(campo);
      return col >= 0 ? (celdas[col] ?? "").trim() : "";
    };
    if (DATOS_DE_POLIZA.every((campo) => !valor(campo))) {
      noSonPolizas++;
      problemas.push({ fila, mensaje: "No tiene asegurado, documento, ramo ni vencimiento: parece una fila de totales o una nota.", tipo: "omitida" });
      return;
    }
    const error = (mensaje: string) => problemas.push({ fila, mensaje, tipo: "error" });
    const advertencia = (mensaje: string) => problemas.push({ fila, mensaje, tipo: "advertencia" });
    /** Lo que no se pudo leer se guarda en la póliza tal como vino. */
    const comoVino: DatoCompania[] = [];
    const provisorios: DatoProvisorio[] = [];
    const guardar = (dato: string, texto: string) => comoVino.push({ etiqueta: `${dato} (como vino)`, valor: texto });

    const docTexto = valor("documento");
    const doc = leerDocumento(docTexto);
    let documento: string | null = null;
    let documentoDigitos: string | null = null;
    if (!doc) {
      error("Falta el DNI o CUIT: se importa sin documento.");
    } else if ("error" in doc) {
      error(`${conMayuscula(doc.error)}: se importa tal como vino; corregilo en la ficha.`);
      documento = docTexto;
      documentoDigitos = docTexto.replace(/\D/g, "").replace(/^0+/, "") || null;
      provisorios.push("documento");
    } else {
      if (doc.tipo === "cuit" && !cuitValido(doc.digitos)) advertencia(`Revisá el CUIT "${doc.texto}": el dígito verificador no coincide.`);
      documento = doc.texto;
      documentoDigitos = doc.digitos;
    }

    let nombre = valor("nombre");
    if (!nombre) {
      nombre = documento ? `Sin nombre (${documento})` : `Sin nombre (fila ${fila})`;
      error(`Falta el nombre o la razón social: se importa como "${nombre}".`);
      provisorios.push("nombre");
    }
    // Sin una columna que lo diga ni un CUIT válido, persona o empresa es una suposición.
    if (!valor("tipo") && (!doc || "error" in doc)) provisorios.push("tipo");

    const ramoOriginal = valor("ramo");
    let ramo = "Sin ramo";
    if (!ramoOriginal) {
      error('Falta el ramo: se importa como "Sin ramo".');
      provisorios.push("ramo");
    } else {
      ramo = ramosElegidos[ramoOriginal] || ramoCanonico(ramoOriginal);
      if (!RAMOS_VALIDOS.has(ramo)) {
        desconocidos.add(ramoOriginal);
        ramo = ramoOriginal;
        error(`Ramo "${ramoOriginal}" sin reconocer: se importa así. Elegí abajo a cuál corresponde.`);
        provisorios.push("ramo");
      }
    }

    const hastaTexto = valor("vigenciaHasta");
    const hasta = leerFecha(hastaTexto);
    let vigenciaHasta: string | null = null;
    if (!hasta) error("Falta el fin de vigencia: se importa sin fecha.");
    else if ("error" in hasta) {
      error(`${conMayuscula(hasta.error)}: se importa sin fecha de fin.`);
      guardar("Fin de vigencia", hastaTexto);
    } else vigenciaHasta = hasta.iso;
    // En algunas compañías es el fin del período facturado (el mes, en las mensuales): la póliza
    // sigue vigente mientras venga en la cartera. Solo en las anuales es el vencimiento.
    let finDelPeriodo: string | null = null;
    if (vigenciaHasta && colFacturacion >= 0 && facturasPorAnio(celdas[colFacturacion] ?? "") !== 1) {
      finDelPeriodo = vigenciaHasta;
      vigenciaHasta = null;
    }
    const desdeTexto = valor("vigenciaDesde");
    const desde = leerFecha(desdeTexto);
    if (desde && "error" in desde) {
      advertencia(`No se entiende el inicio de vigencia: ${desde.error}. Se guarda como vino.`);
      guardar("Inicio de vigencia", desdeTexto);
    }

    const companiaTexto = valor("compania") || companiaArchivo?.trim() || "";
    if (!companiaTexto) error("Falta la compañía: se importa sin compañía.");

    // "0,00" es que la compañía no lo informa.
    const importe = (campo: CampoCartera, dato: string) => {
      const texto = valor(campo);
      const monto = texto ? leerMonto(texto) : null;
      if (texto && (monto === null || monto < 0)) {
        advertencia(`No se entiende ${dato.toLowerCase()} "${texto}": se guarda como vino.`);
        guardar(dato, texto);
      }
      return monto !== null && monto > 0 ? monto : null;
    };
    const prima = importe("prima", "La prima");
    const premio = importe("premio", "El premio");
    // Hay compañías que en algunos ramos informan el ajuste del endoso y no la suma total.
    let suma: number | null = null;
    const ajuste = formato?.sumaNoEsTotalEn?.includes(ramo) ? leerMonto(valor("sumaAsegurada")) : null;
    if (formato?.sumaNoEsTotalEn?.includes(ramo)) {
      if (ajuste) comoVino.push({ etiqueta: "Ajuste de suma de la última factura", valor: pesosConCentavos(ajuste) });
    } else suma = importe("sumaAsegurada", "La suma asegurada");

    const nacimientoTexto = valor("fechaNacimiento");
    const nacimiento = leerFecha(nacimientoTexto);
    const fechaNacimiento = nacimiento && "iso" in nacimiento && nacimiento.iso >= "1900" && nacimiento.iso < hoy ? nacimiento.iso : null;
    if (nacimientoTexto && !fechaNacimiento) {
      advertencia(`No se entiende la fecha de nacimiento "${nacimientoTexto}": se guarda como vino.`);
      guardar("Fecha de nacimiento", nacimientoTexto);
    }

    let email: string | null = valor("email") || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      advertencia(`El email "${email}" no parece válido: se guarda como vino, en los datos de la póliza.`);
      guardar("Email", email);
      email = null;
    }
    let telefono: string | null = valor("telefono") || null;
    if (telefono && !telefonoValido(telefono)) {
      advertencia(`El teléfono "${telefono}" no parece válido: se guarda como vino, en los datos de la póliza.`);
      guardar("Teléfono", telefono);
      telefono = null;
    }
    const cuotasTexto = valor("cuotas");
    const cuotasNumero = Number(cuotasTexto);
    const cuotas = Number.isInteger(cuotasNumero) && cuotasNumero >= 1 && cuotasNumero <= 24 ? cuotasNumero : null;
    if (cuotasTexto && cuotas === null) guardar("Cuotas", cuotasTexto);

    // Si la compañía no informa la prima anual, se calcula con el premio de cada factura.
    const calculada = prima === null ? calcularPrima(celdas) : null;
    if (calculada?.premioSinVerificar) {
      advertencia(
        `La prima anual se calculó con un premio que ${formato?.compania ?? "la compañía"} manda sin la coma decimal y no se pudo comparar con otra factura: revisala.`,
      );
    }
    const numero = valor("numero") || null;
    const compania = companiaTexto ? companiaCanonica(companiaTexto) : null;
    const poliza: FilaCartera = {
      fila,
      clave: claveDeAsegurado(documentoDigitos, nombre),
      tipo: tipoDe(valor("tipo"), doc && !("error" in doc) ? doc : null),
      nombre,
      documento,
      documentoDigitos,
      ramo,
      vigenciaHasta,
      finDelPeriodo,
      vigenciaDesde: desde && "iso" in desde ? desde.iso : null,
      compania,
      numero,
      bien: valor("bien") || null,
      cobertura: valor("cobertura") || null,
      producto: valor("producto") || null,
      prima: prima ?? calculada?.prima ?? null,
      premio,
      sumaAsegurada: suma,
      cuotas,
      formaPago: valor("formaPago") || null,
      datosCompania: [
        ...(finDelPeriodo ? [{ etiqueta: "Fin del período facturado", valor: fechaCorta(finDelPeriodo) }] : []),
        ...mapeo.flatMap((campo, col) => {
          if (campo !== "otro") return [];
          const dato = datoCompania(tabla.encabezados[col] ?? "", celdas[col] ?? "", formato, referenciaDe(celdas, col));
          return dato ? [dato] : [];
        }),
        ...(calculada ? [calculada.detalle] : []),
        ...comoVino,
      ],
      telefono,
      email,
      localidad: valor("localidad") || null,
      domicilio: valor("domicilio") || null,
      codigoPostal: valor("codigoPostal") || null,
      fechaNacimiento,
      contacto: valor("contacto") || null,
      provisorios,
    };

    // La misma póliza en otra fila: un certificado más o la póliza repetida. Nada se pisa.
    const clavePoliza = `${poliza.clave}|${numero ?? `${ramo}|${compania ?? ""}`}`;
    const entradas = polizas.get(clavePoliza) ?? new Map<string, { poliza: FilaCartera; celdas: string[] }>();
    let entrada = valor("certificado");
    const anterior = entradas.get(entrada);
    if (anterior && anterior.celdas.join("\u0000") === celdas.join("\u0000")) {
      unidas++;
      advertencia(`Repite exactamente la fila ${anterior.poliza.fila}: se toma una sola vez.`);
      return;
    }
    if (anterior) {
      entrada = `fila ${fila}`;
      advertencia(`La póliza${numero ? ` ${numero}` : ""} ya está en la fila ${anterior.poliza.fila} con otros datos: se unieron en una sola; revisá los importes.`);
    }
    if (entradas.size) unidas++;
    entradas.set(entrada, { poliza, celdas });
    polizas.set(clavePoliza, entradas);
  });

  const filas = [...polizas.values()].map((entradas) => {
    const lista = [...entradas.entries()];
    const poliza = lista.map(([, e]) => e.poliza).reduce(sumarCertificado);
    if (lista.length < 2) return poliza;
    // Si no son certificados, son la misma póliza en varias filas.
    const sonCertificados = lista.every(([id]) => id && !id.startsWith("fila "));
    const ids = lista.map(([id, e]) => (id || `fila ${e.poliza.fila}`));
    return {
      ...poliza,
      datosCompania: [
        ...poliza.datosCompania,
        { etiqueta: sonCertificados ? "Certificados" : "Filas unidas", valor: String(lista.length) },
        { etiqueta: sonCertificados ? "Detalle por certificado" : "Detalle por fila", valor: lista.map(([, e], j) => detalleDeEntrada(ids[j], e.poliza)).join(" · ") },
      ],
    };
  });
  problemas.sort((a, b) => a.fila - b.fila || ORDEN_PROBLEMAS[a.tipo] - ORDEN_PROBLEMAS[b.tipo]);
  return { filas, problemas, ramosDesconocidos: [...desconocidos], faltanObligatorios, totalFilas, unidas, noSonPolizas };
}

export type ResumenCartera = {
  asegurados: number;
  nuevos: number;
  actualizados: number;
  polizas: number;
  vencen30: number;
  filasConErrores: number;
};

/**
 * Lo que va a pasar al importar, para el paso 3. Cuenta como el guardado: un
 * asegurado ya está si se lo reconoce (`existentes`, según `claveDeAsegurado`)
 * o si alguna de sus pólizas ya está cargada (`polizasCargadas`, según
 * `claveDePoliza`), por ejemplo porque se le corrigió el documento en la ficha.
 */
export function resumirCartera(
  v: ValidacionCartera,
  existentes: Set<string>,
  hoy: string,
  polizasCargadas: Set<string> = new Set(),
): ResumenCartera {
  const asegurados = new Set(v.filas.map((f) => f.clave));
  const yaEstan = new Set(
    v.filas
      .filter((f) => existentes.has(f.clave) || (f.compania && f.numero && polizasCargadas.has(claveDePoliza(f.compania, f.numero))))
      .map((f) => f.clave),
  );
  const nuevos = asegurados.size - yaEstan.size;
  const vencenPronto = new Set(
    v.filas.filter((f) => f.vigenciaHasta && f.vigenciaHasta >= hoy && diasEntre(hoy, f.vigenciaHasta) <= 30).map((f) => f.clave),
  );
  return {
    asegurados: asegurados.size,
    nuevos,
    actualizados: asegurados.size - nuevos,
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
    ...[...porFila.entries()].map(([fila, mensajes]) => [...(tabla.filas[fila - tabla.filaInicial] ?? []), mensajes.join(" ")]),
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
    "Premio anual",
    "Suma asegurada",
    "Cuotas",
    "Forma de pago",
    "Teléfono",
    "Email",
    "Localidad",
    "Domicilio",
    "Código postal",
    "Fecha de nacimiento",
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
    "1.210.000,00",
    "14.500.000,00",
    "12",
    "Transferencia",
    "223 512-4471",
    "",
    "Mar del Plata",
    "",
    "7600",
    "14/03/1985",
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
    "1.830.000,00",
    "85.000.000,00",
    "6",
    "Rapipago",
    "223 464-2290",
    "laespiga@ejemplo.com.ar",
    "Batán",
    "Batán",
    "7601",
    "",
    "Raúl Benítez (dueño)",
  ],
];
