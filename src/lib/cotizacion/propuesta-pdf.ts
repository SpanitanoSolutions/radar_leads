import type { ImagenPdf } from "./logo-pdf";

// PDF de una página, A4, sin dependencias: la propuesta para el cliente y el
// comparativo exportado. Helvetica con WinAnsiEncoding, así los acentos, la ñ
// y las comillas salen bien (van como escapes octales). El logo de la cuenta,
// si hay, va arriba a la izquierda. Lo que no entra en la página se resume al
// pie de la tabla.

export type ColumnaPdf = { titulo: string; ancho: number; derecha?: boolean };
export type FilaPdf = { celdas: string[]; destacada?: boolean; etiqueta?: string };

export type DocumentoPdf = {
  titulo: string;
  subtitulo?: string;
  introduccion?: string;
  marca: { organizacion: string; productor?: string | null; contacto?: string | null };
  logo?: ImagenPdf | null;
  tabla: { columnas: ColumnaPdf[]; filas: FilaPdf[] };
  secciones?: { titulo: string; lineas: string[] }[];
  pie: string;
  /** "30/10/2026". */
  fecha: string;
};

const ANCHO_PAGINA = 595.28;
const ALTO_PAGINA = 841.89;
const MARGEN = 50;
const ANCHO_UTIL = ANCHO_PAGINA - 2 * MARGEN;
const LIMITE_INFERIOR = 110;

// Anchos de Helvetica (milésimas del cuerpo) para ASCII 32 a 126; la negrita se aproxima.
const ANCHOS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

// Lo que WinAnsi tiene fuera de Latin-1.
const WIN_ANSI: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };

function anchoTexto(texto: string, tamano: number, negrita = false): number {
  let total = 0;
  for (const caracter of texto) {
    const base = caracter.normalize("NFD")[0];
    const codigo = base.charCodeAt(0);
    total += codigo >= 32 && codigo <= 126 ? ANCHOS[codigo - 32] : 556;
  }
  return (total * tamano * (negrita ? 1.06 : 1)) / 1000;
}

/** El texto como cadena de PDF: WinAnsi, con escapes octales fuera de ASCII. */
export function textoPdf(texto: string): string {
  let salida = "";
  for (const caracter of texto.replace(/[\r\n\t]+/g, " ")) {
    const codigo = caracter.charCodeAt(0);
    if (caracter === "\\" || caracter === "(" || caracter === ")") salida += `\\${caracter}`;
    else if (codigo >= 32 && codigo <= 126) salida += caracter;
    else {
      const ansi = WIN_ANSI[caracter] ?? (codigo >= 0xa0 && codigo <= 0xff ? codigo : null);
      salida += ansi === null ? "?" : `\\${ansi.toString(8).padStart(3, "0")}`;
    }
  }
  return salida;
}

/** Corta un texto en renglones que entran en `ancho`; con `maximo`, el último termina en "…". */
export function partirEnRenglones(texto: string, ancho: number, tamano: number, negrita = false, maximo = Infinity): string[] {
  const renglones: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (anchoTexto(prueba, tamano, negrita) <= ancho || !actual) actual = prueba;
    else { renglones.push(actual); actual = palabra; }
  }
  if (actual) renglones.push(actual);
  if (renglones.length <= maximo) return renglones;
  const cortados = renglones.slice(0, maximo);
  let ultimo = cortados[maximo - 1];
  while (ultimo && anchoTexto(`${ultimo}…`, tamano, negrita) > ancho) ultimo = ultimo.slice(0, -1);
  cortados[maximo - 1] = `${ultimo.trimEnd()}…`;
  return cortados;
}

const numero = (valor: number) => (Math.round(valor * 100) / 100).toString();

class Lienzo {
  private ops: string[] = [];
  texto(x: number, y: number, contenido: string, tamano: number, { negrita = false, gris = false } = {}) {
    this.ops.push(`BT /${negrita ? "F2" : "F1"} ${tamano} Tf ${gris ? "0.42 0.45 0.47" : "0.08 0.13 0.12"} rg ${numero(x)} ${numero(y)} Td (${textoPdf(contenido)}) Tj ET`);
  }
  textoDerecha(xDerecha: number, y: number, contenido: string, tamano: number, opciones: { negrita?: boolean; gris?: boolean } = {}) {
    this.texto(xDerecha - anchoTexto(contenido, tamano, opciones.negrita), y, contenido, tamano, opciones);
  }
  rectangulo(x: number, y: number, ancho: number, alto: number, rgb: string) {
    this.ops.push(`${rgb} rg ${numero(x)} ${numero(y)} ${numero(ancho)} ${numero(alto)} re f`);
  }
  linea(x1: number, y1: number, x2: number, y2: number) {
    this.ops.push(`0.86 0.88 0.88 RG 0.8 w ${numero(x1)} ${numero(y1)} m ${numero(x2)} ${numero(y2)} l S`);
  }
  imagen(x: number, y: number, ancho: number, alto: number) {
    this.ops.push(`q ${numero(ancho)} 0 0 ${numero(alto)} ${numero(x)} ${numero(y)} cm /Im1 Do Q`);
  }
  contenido() {
    return this.ops.join("\n");
  }
}

function dibujar(doc: DocumentoPdf): string {
  const l = new Lienzo();
  let y = ALTO_PAGINA - MARGEN;

  // Encabezado: el logo (o el nombre) a la izquierda y los datos de la cuenta a la derecha.
  let altoEncabezado = 34;
  if (doc.logo) {
    const escala = Math.min(150 / doc.logo.ancho, 56 / doc.logo.alto, 1);
    const ancho = doc.logo.ancho * escala;
    const alto = doc.logo.alto * escala;
    l.imagen(MARGEN, y - alto, ancho, alto);
    altoEncabezado = Math.max(alto, 34);
  } else {
    l.texto(MARGEN, y - 18, doc.marca.organizacion, 16, { negrita: true });
  }
  const derecha = ANCHO_PAGINA - MARGEN;
  // Sin logo, el nombre de la organización ya está a la izquierda.
  const datosCuenta = [doc.logo ? doc.marca.organizacion : null, doc.marca.productor, doc.marca.contacto].filter((dato): dato is string => Boolean(dato));
  datosCuenta.forEach((dato, i) => l.textoDerecha(derecha, y - 10 - i * 13, dato, i === 0 && doc.logo ? 10 : 9, i === 0 && doc.logo ? { negrita: true } : { gris: true }));
  y -= altoEncabezado + 16;
  l.linea(MARGEN, y, derecha, y);

  // Título
  y -= 30;
  for (const renglon of partirEnRenglones(doc.titulo, ANCHO_UTIL, 18, true, 2)) {
    l.texto(MARGEN, y, renglon, 18, { negrita: true });
    y -= 22;
  }
  if (doc.subtitulo) { l.texto(MARGEN, y, doc.subtitulo, 10, { gris: true }); y -= 20; }
  if (doc.introduccion) {
    for (const renglon of partirEnRenglones(doc.introduccion, ANCHO_UTIL, 10, false, 3)) { l.texto(MARGEN, y, renglon, 10); y -= 14; }
    y -= 6;
  }

  // Tabla
  const { columnas, filas } = doc.tabla;
  const xs = columnas.reduce<number[]>((acc, columna, i) => [...acc, i ? acc[i - 1] + columnas[i - 1].ancho : MARGEN], []);
  const celda = (texto: string, i: number, yFila: number, opciones: { negrita?: boolean; gris?: boolean } = {}) => {
    if (columnas[i].derecha) l.textoDerecha(xs[i] + columnas[i].ancho - 6, yFila, texto, opciones.negrita ? 9 : 10, opciones);
    else l.texto(xs[i] + 6, yFila, texto, opciones.negrita ? 9 : 10, opciones);
  };
  l.rectangulo(MARGEN, y - 8, ANCHO_UTIL, 22, "0.95 0.96 0.96");
  columnas.forEach((columna, i) => celda(columna.titulo, i, y, { negrita: true, gris: true }));
  y -= 24;
  let dibujadas = 0;
  for (const fila of filas) {
    const renglones = fila.celdas.map((texto, i) => partirEnRenglones(texto, columnas[i].ancho - 12, 10, false, 2));
    const extra = fila.etiqueta ? 1 : 0;
    const altoFila = Math.max(1, ...renglones.map((r) => r.length + (r === renglones[0] ? extra : 0))) * 13 + 10;
    if (y - altoFila < LIMITE_INFERIOR + 20) break;
    if (fila.destacada) l.rectangulo(MARGEN, y - altoFila + 13, ANCHO_UTIL, altoFila, "0.92 0.97 0.86");
    renglones.forEach((lineas, i) => lineas.forEach((renglon, j) => celda(renglon, i, y - j * 13)));
    if (fila.etiqueta) l.texto(xs[0] + 6, y - renglones[0].length * 13, fila.etiqueta, 8, { negrita: true });
    y -= altoFila;
    l.linea(MARGEN, y + 13 - 2, derecha, y + 13 - 2);
    dibujadas++;
  }
  if (!filas.length) { l.texto(MARGEN + 6, y, "Todavía no hay respuestas para mostrar.", 10, { gris: true }); y -= 20; }
  if (dibujadas < filas.length) { l.texto(MARGEN + 6, y, `Y ${filas.length - dibujadas} más en el comparativo.`, 9, { gris: true }); y -= 18; }

  // Secciones (coberturas informadas)
  for (const seccion of doc.secciones ?? []) {
    if (y < LIMITE_INFERIOR + 40 || !seccion.lineas.length) break;
    y -= 10;
    l.texto(MARGEN, y, seccion.titulo, 11, { negrita: true });
    y -= 16;
    for (const linea of seccion.lineas) {
      for (const renglon of partirEnRenglones(linea, ANCHO_UTIL, 9, false, 3)) {
        if (y < LIMITE_INFERIOR) break;
        l.texto(MARGEN, y, renglon, 9);
        y -= 12;
      }
    }
  }

  // Pie
  l.linea(MARGEN, 78, derecha, 78);
  partirEnRenglones(doc.pie, ANCHO_UTIL, 8, false, 2).forEach((renglon, i) => l.texto(MARGEN, 64 - i * 11, renglon, 8, { gris: true }));
  l.textoDerecha(derecha, 40, `Emitido el ${doc.fecha}`, 8, { gris: true });
  return l.contenido();
}

const codificar = (texto: string) => new TextEncoder().encode(texto);

/** El documento como bytes: los objetos, la imagen (con su máscara) y la tabla de referencias. */
export function generarPdfPropuesta(doc: DocumentoPdf): Uint8Array {
  const contenido = dibujar(doc);
  const objetos: (string | { diccionario: string; datos: Uint8Array })[] = [];
  const agregar = (objeto: (typeof objetos)[number]) => objetos.push(objeto);
  agregar("<< /Type /Catalog /Pages 2 0 R >>");
  agregar("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const logo = doc.logo;
  const recursos = `<< /Font << /F1 4 0 R /F2 5 0 R >>${logo ? " /XObject << /Im1 7 0 R >>" : ""} >>`;
  agregar(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PAGINA} ${ALTO_PAGINA}] /Resources ${recursos} /Contents 6 0 R >>`);
  agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  agregar({ diccionario: "<<", datos: codificar(contenido) });
  if (logo) {
    const mascara = logo.mascara ? " /SMask 8 0 R" : "";
    agregar({ diccionario: `<< /Type /XObject /Subtype /Image /Width ${logo.ancho} /Height ${logo.alto} /ColorSpace /${logo.espacioColor} /BitsPerComponent 8 /Filter /${logo.filtro}${mascara}`, datos: logo.datos });
    if (logo.mascara) agregar({ diccionario: `<< /Type /XObject /Subtype /Image /Width ${logo.ancho} /Height ${logo.alto} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, datos: logo.mascara });
  }

  const partes: Uint8Array[] = [codificar("%PDF-1.4\n")];
  let largo = partes[0].length;
  const desplazamientos: number[] = [];
  const sumar = (parte: Uint8Array) => { partes.push(parte); largo += parte.length; };
  objetos.forEach((objeto, i) => {
    desplazamientos.push(largo);
    if (typeof objeto === "string") sumar(codificar(`${i + 1} 0 obj\n${objeto}\nendobj\n`));
    else {
      sumar(codificar(`${i + 1} 0 obj\n${objeto.diccionario} /Length ${objeto.datos.length} >>\nstream\n`));
      sumar(objeto.datos);
      sumar(codificar("\nendstream\nendobj\n"));
    }
  });
  const xref = largo;
  sumar(codificar(`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${desplazamientos.map((d) => `${String(d).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  const pdf = new Uint8Array(largo);
  let posicion = 0;
  for (const parte of partes) { pdf.set(parte, posicion); posicion += parte.length; }
  return pdf;
}
