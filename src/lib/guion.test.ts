import { describe, expect, it } from "vitest";
import { guionContacto, type DatosGuion } from "./guion";

const GOBBLACK: DatosGuion = {
  empresa: "Gobblack SA",
  tipoEvento: "sociedad",
  sectorId: "flotas",
  rubro: "Transporte de pasajeros",
  localidad: "Mar del Plata",
  motivo: "Sociedad nueva: transporte de pasajeros",
  diasEvento: 1,
};

describe("guionContacto", () => {
  it("sociedad nueva de transporte de pasajeros: menciona la constitución y pregunta por la flota", () => {
    expect(guionContacto({ ...GOBBLACK, productor: "Jorge Pérez" })).toBe(
      "Buen día, ¿cómo le va? Le habla Jorge Pérez, productor asesor de seguros de Mar del Plata. " +
        "Vi en el Boletín Oficial que Gobblack SA se constituyó hace poco, ¡felicitaciones! " +
        "¿Ya tienen cubiertos los vehículos y a las personas que trasladan? " +
        "Si le parece, le preparo una propuesta sin compromiso.",
    );
  });

  it("sin nombre de productor, no deja un hueco para completar", () => {
    const texto = guionContacto(GOBBLACK);
    expect(texto).toMatch(/^Buen día, ¿cómo le va\? Soy productor asesor de seguros/);
    expect(texto).not.toMatch(/\[|undefined/);
  });

  it("licitación reciente: la caución primero; si ya pasó un mes, el resto de la cobertura", () => {
    const obra: DatosGuion = {
      empresa: "Senderos de la Costa S.A.",
      tipoEvento: "licitacion",
      sectorId: "construccion",
      rubro: "Construcción",
      localidad: "Mar del Plata",
      motivo: "Ganó licitación nacional: Refacción de contrapisos muros y tabiques",
      diasEvento: 5,
    };
    expect(guionContacto(obra)).toContain(
      "Vi que Senderos de la Costa S.A. ganó hace poco la licitación de refacción de contrapisos muros y tabiques, ¡felicitaciones! ¿Ya tienen resuelto el seguro de caución",
    );
    const vieja = guionContacto({ ...obra, diasEvento: 120 });
    expect(vieja).not.toContain("caución");
    expect(vieja).toContain("RC, ART y el seguro de la obra");
  });

  it("transporte de carga y compra de fondo de comercio", () => {
    expect(guionContacto({ ...GOBBLACK, rubro: "Transporte de carga" })).toContain("la flota y la mercadería");
    expect(
      guionContacto({
        empresa: "Bluma Grupo Gastronómico SRL",
        tipoEvento: "transferencia",
        sectorId: "gastronomia",
        rubro: "Café Bluma",
        localidad: "Escobar",
        motivo: "Compró un fondo de comercio",
        diasEvento: 2,
      }),
    ).toContain("tomó el fondo de comercio de café bluma en Escobar. Con el cambio de titular");
  });

  it("habla de usted, nunca de vos", () => {
    for (const sectorId of ["flotas", "construccion", "industria", "gastronomia", "salud", "comercio"]) {
      const texto = guionContacto({ ...GOBBLACK, sectorId, rubro: "Rubro" });
      expect(texto).not.toMatch(/\b(vos|tenés|querés|podés|te)\b/i);
      expect(texto.length).toBeLessThan(400);
    }
  });
});
