import { describe, expect, it } from "vitest";
import { generarPdfPropuesta, partirEnRenglones, textoPdf, type DocumentoPdf } from "./propuesta-pdf";

const documento: DocumentoPdf = {
  titulo: "Propuesta de seguro para Gómez, Lucía (cliente)",
  subtitulo: "Solicitud 1042 · Automotor",
  marca: { organizacion: "Pérez Seguros", productor: "Julián Pérez", contacto: "223 555-0101 · julian@ejemplo.com" },
  tabla: {
    columnas: [{ titulo: "Compañía", ancho: 250 }, { titulo: "Prima total", ancho: 245, derecha: true }],
    filas: [{ celdas: ["Sancor", "$ 912.000"], destacada: true, etiqueta: "Mejor precio" }, { celdas: ["Mapfre", "$ 958.000"] }],
  },
  secciones: [{ titulo: "Coberturas informadas", lineas: ["Sancor. Cristales: Hasta $ 300.000."] }],
  pie: "Documento preliminar: no es una póliza ni una cobertura vigente.",
  fecha: "30/10/2026",
};

const comoTexto = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

/** Cada entrada de la tabla de referencias apunta al comienzo de su objeto. */
function referenciasCorrectas(pdf: Uint8Array): boolean {
  const texto = comoTexto(pdf);
  const xref = Number(/startxref\n(\d+)\n%%EOF$/.exec(texto)![1]);
  const [, cantidad] = /^xref\n0 (\d+)\n/.exec(texto.slice(xref))!;
  const entradas = texto.slice(xref).split("\n").slice(3, 2 + Number(cantidad));
  return entradas.every((entrada, i) => texto.startsWith(`${i + 1} 0 obj`, Number(entrada.slice(0, 10))));
}

describe("propuesta en PDF", () => {
  it("escribe los acentos y los signos en WinAnsi, con escapes octales", () => {
    expect(textoPdf("Año – “ok” (1) \\ ñ")).toBe("A\\361o \\226 \\223ok\\224 \\(1\\) \\\\ \\361");
    expect(textoPdf("Listo ✓")).toBe("Listo ?");
  });

  it("corta los renglones y termina el último en “…” si no entra", () => {
    const texto = "Todo riesgo con franquicia de 350.000 pesos para el vehículo";
    expect(partirEnRenglones(texto, 2000, 10)).toEqual([texto]);
    const cortado = partirEnRenglones(texto, 90, 10, false, 2);
    expect(cortado).toHaveLength(2);
    expect(cortado[1].endsWith("…")).toBe(true);
  });

  it("es un PDF A4 válido, con Helvetica en WinAnsi, el título con acentos y la tabla de referencias bien", () => {
    const pdf = generarPdfPropuesta(documento);
    const texto = comoTexto(pdf);
    expect(texto.startsWith("%PDF-1.4")).toBe(true);
    expect(texto.endsWith("%%EOF")).toBe(true);
    expect(texto).toContain("/BaseFont /Helvetica /Encoding /WinAnsiEncoding");
    expect(texto).toContain("/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding");
    expect(texto).toContain("(Propuesta de seguro para G\\363mez, Luc\\355a \\(cliente\\)) Tj");
    expect(texto).toContain("(P\\351rez Seguros) Tj");
    expect(texto).toContain("(Mejor precio) Tj");
    expect(texto).toContain("(Emitido el 30/10/2026) Tj");
    expect(texto).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(texto).not.toContain("/XObject");
    expect(referenciasCorrectas(pdf)).toBe(true);
  });

  it("con logo lo dibuja, y la transparencia va como máscara", () => {
    const logo = { ancho: 300, alto: 100, espacioColor: "DeviceRGB" as const, filtro: "FlateDecode" as const, datos: Uint8Array.from([1, 2, 3]), mascara: Uint8Array.from([4, 5]) };
    const pdf = generarPdfPropuesta({ ...documento, logo });
    const texto = comoTexto(pdf);
    expect(texto).toContain("/XObject << /Im1 7 0 R >>");
    expect(texto).toContain("/Subtype /Image /Width 300 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 8 0 R");
    // 150 × 50: entra en 150 × 56 sin deformarse.
    expect(texto).toContain("q 150 0 0 50 50 741.89 cm /Im1 Do Q");
    expect(referenciasCorrectas(pdf)).toBe(true);
  });
});
