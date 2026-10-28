import { describe, expect, it } from "vitest";
import { generarPdfPropuesta } from "./propuesta-pdf";

describe("propuesta PDF", () => {
  it("genera un PDF imprimible con datos saneados y advertencia", () => {
    const pdf = new TextDecoder().decode(generarPdfPropuesta("Propuesta (cliente)", [
      { etiqueta: "Organización", valor: "Productores\\Sur" },
    ]));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("(Propuesta \\(cliente\\)) Tj");
    expect(pdf).toContain("Organizacion: Productores\\\\Sur");
    expect(pdf).toContain("No constituye una poliza");
    expect(pdf.endsWith("%%EOF")).toBe(true);
  });
});
