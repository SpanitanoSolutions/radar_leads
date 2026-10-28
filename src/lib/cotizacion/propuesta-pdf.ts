export type LineaPropuesta = { etiqueta: string; valor: string };

function limpiarPdf(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?")
    .replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** PDF de una página, generado sin dependencias; queda como borrador en la base. */
export function generarPdfPropuesta(titulo: string, lineas: LineaPropuesta[]): Uint8Array {
  const contenido = [
    "BT", "/F1 18 Tf", "54 790 Td", `(${limpiarPdf(titulo)}) Tj`,
    "/F1 10 Tf", "0 -28 Td", "(Propuesta de seguro - sujeta a confirmacion de cobertura y condiciones) Tj",
    ...lineas.slice(0, 32).flatMap((linea) => ["0 -22 Td", `/F1 11 Tf (${limpiarPdf(`${linea.etiqueta}: ${linea.valor}`).slice(0, 180)}) Tj`]),
    "0 -30 Td", "/F1 9 Tf", "(Documento preliminar. No constituye una poliza ni cobertura vigente.) Tj", "ET",
  ].join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objetos.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
