import type { DatoCompania } from "@/db/schema";
import { celdasCsv } from "@/fuentes/csv";
import { normalizar } from "@/fuentes/clasificacion";
import { diasEntre } from "./fechas";
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

/**
 * Algunas compañías exportan con filas vacías o un título arriba de los
 * encabezados: el encabezado es la primera fila que tiene al menos la mitad de
 * las celdas llenas de la más completa.
 */
function ubicarEncabezado(filas: string[][]): number {
  const llenas = filas.slice(0, 20).map((f) => f.filter((c) => c.trim()).length);
  const minimo = Math.max(2, Math.max(0, ...llenas) / 2);
  return Math.max(0, llenas.findIndex((n) => n >= minimo));
}

function armarTabla(archivo: string, filas: string[][], separador: string | null): Tabla {
  const inicio = ubicarEncabezado(filas);
  return { archivo, encabezados: filas[inicio] ?? [], filas: filas.slice(inicio + 1), separador, filaInicial: inicio + 2 };
}

export async function leerTablaCsv(texto: string, archivo = "archivo.csv"): Promise<Tabla> {
  // La primera línea con algún separador: puede haber un título arriba.
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/, 20);
  const separador = detectarSeparador(lineas.find((l) => /[;,\t]/.test(l.replace(/"[^"]*"/g, ""))) ?? "");
  // Las filas vacías se conservan para que los mensajes digan el número de fila real.
  const filas: string[][] = [];
  for await (const celdas of celdasCsv([texto], separador)) filas.push(celdas.map((c) => c.trim()));
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

/** Un "otro dato" de la póliza, con el nombre y el formato que le da el formato de la compañía. Vacío: null. */
function datoCompania(encabezado: string, celda: string, formato: FormatoCartera | null): DatoCompania | null {
  const valor = celda.trim();
  if (!valor) return null;
  const conocido = formato?.otros[normalizarEncabezado(encabezado)];
  const etiqueta = conocido?.etiqueta ?? etiquetaDe(encabezado);
  if (conocido?.sinCero && /^0+([.,]0+)?$/.test(valor)) return null;
  if (conocido?.tipo !== "monto") return { etiqueta, valor };
  // Un monto en cero es que la compañía no lo informa.
  const monto = leerMonto(valor);
  return monto ? { etiqueta, valor: pesosConCentavos(monto) } : null;
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
    vigenciaHasta: [poliza.vigenciaHasta, certificado.vigenciaHasta].sort()[1],
    datosCompania: [
      ...poliza.datosCompania,
      ...certificado.datosCompania.filter((d) => !poliza.datosCompania.some((p) => p.etiqueta === d.etiqueta)),
    ],
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

/**
 * Valida cada fila según las columnas elegidas. Las filas con errores no se
 * importan; las advertencias se importan igual.
 */
export function validarCartera(tabla: Tabla, mapeo: (CampoCartera | "")[], opciones: OpcionesCartera = {}): ValidacionCartera {
  const { ramos: ramosElegidos = {}, compania: companiaArchivo = null, formato = null } = opciones;
  const hoy = new Date().toISOString().slice(0, 10);
  const faltanObligatorios = faltanEnCartera(mapeo, companiaArchivo);
  const problemas: Problema[] = [];
  const desconocidos = new Set<string>();
  /** Por póliza, sus certificados ("" si el archivo no los trae). */
  const polizas = new Map<string, Map<string, FilaCartera>>();
  let totalFilas = 0;
  if (faltanObligatorios.length) return { filas: [], problemas, ramosDesconocidos: [], faltanObligatorios, totalFilas: tabla.filas.length };

  tabla.filas.forEach((celdas, i) => {
    const valor = (campo: CampoCartera) => {
      const col = mapeo.indexOf(campo);
      return col >= 0 ? (celdas[col] ?? "").trim() : "";
    };
    if (DATOS_DE_POLIZA.every((campo) => !valor(campo))) return;
    totalFilas++;
    const fila = i + tabla.filaInicial;
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

    const companiaTexto = valor("compania") || companiaArchivo?.trim() || "";
    if (!companiaTexto) error("Falta la compañía.");

    // "0,00" es que la compañía no lo informa.
    const importe = (campo: CampoCartera, nombreDato: string) => {
      const texto = valor(campo);
      const monto = texto ? leerMonto(texto) : null;
      if (texto && (monto === null || monto < 0)) advertencia(`No entendí ${nombreDato} "${texto}": queda sin cargar.`);
      return monto !== null && monto > 0 ? monto : null;
    };
    const prima = importe("prima", "la prima");
    const premio = importe("premio", "el premio");
    // Hay compañías que en algunos ramos informan el ajuste del endoso y no la suma total.
    const suma = formato?.sumaNoEsTotalEn?.includes(ramo) ? null : importe("sumaAsegurada", "la suma asegurada");

    const nacimiento = leerFecha(valor("fechaNacimiento"));
    if (nacimiento && "error" in nacimiento) advertencia(`No se toma la fecha de nacimiento: ${nacimiento.error}.`);
    const fechaNacimiento = nacimiento && "iso" in nacimiento && nacimiento.iso >= "1900" && nacimiento.iso < hoy ? nacimiento.iso : null;

    let email: string | null = valor("email") || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      advertencia(`El email "${email}" no parece válido: queda sin cargar.`);
      email = null;
    }
    let telefono: string | null = valor("telefono") || null;
    if (telefono && !telefonoValido(telefono)) {
      advertencia(`El teléfono "${telefono}" no parece válido: queda sin cargar.`);
      telefono = null;
    }
    const cuotasNumero = Number(valor("cuotas"));

    if (problemas.length > errores && problemas.slice(errores).some((p) => p.tipo === "error")) return;
    const d = doc as Documento;
    const numero = valor("numero") || null;
    const compania = companiaCanonica(companiaTexto);
    const poliza: FilaCartera = {
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
      producto: valor("producto") || null,
      prima,
      premio,
      sumaAsegurada: suma,
      cuotas: Number.isInteger(cuotasNumero) && cuotasNumero >= 1 && cuotasNumero <= 24 ? cuotasNumero : null,
      formaPago: valor("formaPago") || null,
      datosCompania: mapeo.flatMap((campo, col) => {
        const dato = campo === "otro" ? datoCompania(tabla.encabezados[col] ?? "", celdas[col] ?? "", formato) : null;
        return dato ? [dato] : [];
      }),
      telefono,
      email,
      localidad: valor("localidad") || null,
      domicilio: valor("domicilio") || null,
      codigoPostal: valor("codigoPostal") || null,
      fechaNacimiento,
      contacto: valor("contacto") || null,
    };

    const clave = `${d.digitos}|${numero ?? `${ramo}|${compania ?? ""}`}`;
    const certificado = valor("certificado");
    const certificados = polizas.get(clave) ?? new Map<string, FilaCartera>();
    const repetida = certificados.get(certificado);
    if (repetida) advertencia(`Repite la póliza de la fila ${repetida.fila}: se toma esta.`);
    certificados.set(certificado, poliza);
    polizas.set(clave, certificados);
  });

  const filas = [...polizas.values()].map((certificados) => {
    const poliza = [...certificados.values()].reduce(sumarCertificado);
    if (certificados.size < 2) return poliza;
    return { ...poliza, datosCompania: [...poliza.datosCompania, { etiqueta: "Certificados", valor: String(certificados.size) }] };
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
