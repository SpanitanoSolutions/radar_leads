type ArchivoZip = { nombre: string; bytes: Uint8Array };

const encoder = new TextEncoder();
function u16(valor: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, valor, true); return b; }
function u32(valor: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, valor >>> 0, true); return b; }
function juntar(partes: Uint8Array[]): Uint8Array {
  const salida = new Uint8Array(partes.reduce((total, parte) => total + parte.length, 0));
  let offset = 0;
  for (const parte of partes) { salida.set(parte, offset); offset += parte.length; }
  return salida;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function escaparXml(valor: string): string {
  return valor.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function columna(indice: number): string {
  let nombre = "";
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) nombre = String.fromCharCode(65 + ((n - 1) % 26)) + nombre;
  return nombre;
}
function crearZip(archivos: ArchivoZip[]): Uint8Array {
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;
  for (const archivo of archivos) {
    const nombre = encoder.encode(archivo.nombre);
    const crc = crc32(archivo.bytes);
    const local = juntar([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(archivo.bytes.length), u32(archivo.bytes.length), u16(nombre.length), u16(0), nombre, archivo.bytes]);
    locales.push(local);
    centrales.push(juntar([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(archivo.bytes.length), u32(archivo.bytes.length), u16(nombre.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nombre]));
    offset += local.length;
  }
  const directorio = juntar(centrales);
  return juntar([...locales, directorio, u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length), u32(directorio.length), u32(offset), u16(0)]);
}

/** Escribe un .xlsx de una hoja usando celdas de texto y ZIP sin compresión. */
export function escribirXlsx(filas: (string | number | null | undefined)[][], nombreHoja = "Cotización"): Uint8Array {
  const nombre = escaparXml(nombreHoja.slice(0, 31));
  const filasXml = filas.map((fila, indiceFila) => {
    const celdas = fila.map((valor, indiceColumna) => {
      const direccion = `${columna(indiceColumna)}${indiceFila + 1}`;
      return `<c r="${direccion}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(String(valor ?? ""))}</t></is></c>`;
    }).join("");
    return `<row r="${indiceFila + 1}">${celdas}</row>`;
  }).join("");
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>`;
  const archivos = [
    { nombre: "[Content_Types].xml", bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { nombre: "_rels/.rels", bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { nombre: "xl/workbook.xml", bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombre}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { nombre: "xl/_rels/workbook.xml.rels", bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { nombre: "xl/worksheets/sheet1.xml", bytes: encoder.encode(hoja) },
  ];
  return crearZip(archivos);
}
