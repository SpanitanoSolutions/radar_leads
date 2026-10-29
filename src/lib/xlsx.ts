// Lector mínimo de planillas .xlsx: devuelve la primera hoja como filas de
// texto. Un .xlsx es un ZIP con XML adentro; se descomprime con
// DecompressionStream, que existe en el navegador y en Node, así funciona
// igual en la vista previa y al guardar. Las fechas llegan como número de
// serie de Excel: las interpreta quien sabe que esa columna es una fecha.

type Entrada = { metodo: number; tamano: number; inicio: number };

function u16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

function entradasZip(b: Uint8Array): Map<string, Entrada> {
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(b, i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("El archivo no es un Excel válido.");
  const total = u16(b, fin + 10);
  let p = u32(b, fin + 16);
  const decodificador = new TextDecoder();
  const entradas = new Map<string, Entrada>();
  for (let n = 0; n < total; n++) {
    if (u32(b, p) !== 0x02014b50) break;
    const metodo = u16(b, p + 10);
    const tamano = u32(b, p + 20);
    const largoNombre = u16(b, p + 28);
    const largoExtra = u16(b, p + 30);
    const largoComentario = u16(b, p + 32);
    const local = u32(b, p + 42);
    const nombre = decodificador.decode(b.subarray(p + 46, p + 46 + largoNombre));
    const inicio = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    entradas.set(nombre, { metodo, tamano, inicio });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

async function leerEntrada(b: Uint8Array, e: Entrada | undefined): Promise<string | null> {
  if (!e) return null;
  const datos = b.slice(e.inicio, e.inicio + e.tamano);
  if (e.metodo === 0) return new TextDecoder().decode(datos);
  if (e.metodo !== 8) throw new Error("El Excel usa una compresión que no se puede leer. Guardalo como CSV.");
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(flujo).text();
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function desescapar(texto: string): string {
  return texto.replace(/&(#x?[0-9a-f]+|\w+);/gi, (entera, codigo: string) => {
    if (codigo[0] === "#") {
      const n = codigo[1].toLowerCase() === "x" ? parseInt(codigo.slice(2), 16) : parseInt(codigo.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : entera;
    }
    return ENTIDADES[codigo] ?? entera;
  });
}

/** Todo el texto de los <t> de un fragmento (los textos con formato vienen partidos). */
function textoDe(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1])).join("");
}

/** "A" → 0, "AB" → 27. */
function indiceColumna(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export async function leerXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entradas = entradasZip(bytes);
  const libro = (await leerEntrada(bytes, entradas.get("xl/workbook.xml"))) ?? "";
  const relaciones = (await leerEntrada(bytes, entradas.get("xl/_rels/workbook.xml.rels"))) ?? "";
  const primeraHoja = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1];
  const destino = primeraHoja
    ? new RegExp(`<Relationship\\b[^>]*Id="${primeraHoja}"[^>]*Target="([^"]+)"`).exec(relaciones)?.[1] ??
      new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${primeraHoja}"`).exec(relaciones)?.[1]
    : undefined;
  const ruta = destino ? `xl/${destino.replace(/^\/?xl\//, "")}` : "xl/worksheets/sheet1.xml";
  const hoja = await leerEntrada(bytes, entradas.get(ruta) ?? entradas.get("xl/worksheets/sheet1.xml"));
  if (!hoja) throw new Error("No encontré ninguna hoja en el Excel.");

  const compartidos = [...((await leerEntrada(bytes, entradas.get("xl/sharedStrings.xml"))) ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => textoDe(m[1]),
  );

  // Cada fila va en su número de fila (las vacías quedan como []), así los
  // mensajes de la importación coinciden con lo que se ve en Excel.
  const filas: string[][] = [];
  for (const fila of hoja.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(/\br="(\d+)"/.exec(fila[1])?.[1]) || filas.length + 1;
    const celdas: string[] = [];
    for (const c of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1];
      const cuerpo = c[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(atributos)?.[1];
      const tipo = /\bt="(\w+)"/.exec(atributos)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = "";
      if (tipo === "s") valor = compartidos[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textoDe(cuerpo);
      else if (v !== undefined) valor = desescapar(v);
      const i = ref ? indiceColumna(ref) : celdas.length;
      while (celdas.length < i) celdas.push("");
      celdas[i] = valor.trim();
    }
    while (filas.length < numero - 1) filas.push([]);
    filas[numero - 1] = celdas;
  }
  // Las vacías del principio también se conservan: si la planilla empieza
  // más abajo, sacarlas correría todos los números de fila.
  return filas;
}
