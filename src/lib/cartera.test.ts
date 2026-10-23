import { describe, expect, it } from "vitest";
import { analizarCartera, leerCartera, leerFecha, sugerenciasParaRamo } from "./cartera";

// Planilla de ejemplo con datos inventados, como la exporta Excel (separada por ";").
const CSV = [
  "Cliente;CUIT;Ramo;Compañía;Fecha de vencimiento",
  "Transportes Ejemplo SRL;30-11111111-1;Flota;Compañía A;15/11/2026",
  "Transportes Ejemplo SRL;30-11111111-1;ART;Compañía B;01/03/2027",
  "Cliente Uno;20-00000000-1;Auto;Compañía A;30/10/2026",
  "Cliente Dos;27-00000000-2;Auto, Hogar;Compañía C;2026-12-30",
  "Comercio Ejemplo SA;30-22222222-2;Integral de comercio;Compañía A;fecha rara",
  ";;;;",
].join("\r\n");

describe("leerFecha", () => {
  it("entiende los formatos de fecha habituales", () => {
    expect(leerFecha("15/11/2026")).toBe("2026-11-15");
    expect(leerFecha("5-1-27")).toBe("2027-01-05");
    expect(leerFecha("2026-12-30")).toBe("2026-12-30");
    expect(leerFecha("31/13/2026")).toBeNull();
    expect(leerFecha("fecha rara")).toBeNull();
  });
});

describe("leerCartera", () => {
  it("reconoce las columnas por nombre y separa varios ramos en una celda", async () => {
    const { polizas, avisos } = await leerCartera(CSV);
    expect(polizas).toHaveLength(5);
    expect(polizas[3]).toEqual({
      cliente: "Cliente Dos",
      cuit: "27-00000000-2",
      ramos: ["Auto", "Hogar"],
      compania: "Compañía C",
      vencimiento: "2026-12-30",
    });
    expect(avisos).toEqual(['Fila 6: no entendí la fecha "fecha rara".']);
  });

  it("también lee CSV separados por coma, y avisa si falta la columna del cliente", async () => {
    expect((await leerCartera("Asegurado,Ramo,Vto\nCliente Tres,Hogar,10/11/2026")).polizas).toEqual([
      { cliente: "Cliente Tres", cuit: null, ramos: ["Hogar"], compania: null, vencimiento: "2026-11-10" },
    ]);
    expect((await leerCartera("Patente,Marca\nAAA111,Ford")).avisos[0]).toMatch(/columna del cliente/);
  });
});

describe("analizarCartera", () => {
  it("vencimientos de los próximos 60 días, del más cercano al más lejano", async () => {
    const { polizas } = await leerCartera(CSV);
    const a = analizarCartera(polizas, "2026-10-22");
    expect(a.vencimientos.map((p) => [p.cliente, p.vencimiento, p.dias])).toEqual([
      ["Cliente Uno", "2026-10-30", 8],
      ["Transportes Ejemplo SRL", "2026-11-15", 24],
    ]);
  });

  it("clientes con un solo ramo (juntando las pólizas del mismo CUIT) y qué ofrecerles", async () => {
    const { polizas } = await leerCartera(CSV);
    const a = analizarCartera(polizas, "2026-10-22");
    expect(a.clientes).toBe(4);
    expect(a.unSoloRamo).toEqual([
      { cliente: "Cliente Uno", cuit: "20-00000000-1", ramo: "Auto", sugerencias: ["Hogar", "Accidentes personales", "Vida"] },
      { cliente: "Comercio Ejemplo SA", cuit: "30-22222222-2", ramo: "Integral de comercio", sugerencias: ["ART", "RC", "Flota"] },
    ]);
  });

  it("sugerencias según el ramo que ya tiene", () => {
    expect(sugerenciasParaRamo("FLOTA")).toEqual(["ART", "RC", "Carga"]);
    expect(sugerenciasParaRamo("Seguro de caución")).toEqual(["RC", "ART", "Todo riesgo construcción"]);
    expect(sugerenciasParaRamo("Otro")).toEqual(["ART", "RC", "Accidentes personales"]);
  });
});
