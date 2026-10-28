import { describe, expect, it } from "vitest";
import { escribirXlsx } from "./xlsx-escribir";
import { leerXlsx } from "./xlsx";

describe("escritura de Excel", () => {
  it("crea un XLSX que puede reabrirse con acentos y caracteres reservados", async () => {
    const bytes = escribirXlsx([["Aseguradora", "Prima"], ["Federación Patronal & Cía.", 12345]], "Cotización");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    await expect(leerXlsx(bytes)).resolves.toEqual([["Aseguradora", "Prima"], ["Federación Patronal & Cía.", "12345"]]);
  });
});
