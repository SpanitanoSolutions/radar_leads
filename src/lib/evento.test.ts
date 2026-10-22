import { describe, expect, it } from "vitest";
import {
  diasDesde,
  etiquetaEvento,
  penalizacionPorAntiguedad,
  ramosSugeridos,
  tipoDeEvento,
} from "./evento";

const AHORA = new Date("2026-10-22T15:00:00Z"); // jueves 22/10/2026, 12 h en Argentina

describe("tipoDeEvento", () => {
  it("lo deduce de la clave de la fuente", () => {
    expect(tipoDeEvento({ clave: "comprar:68-0001-LPR26:30-71222454-8", alcanceLicitacion: "nacional", motivo: "" })).toBe(
      "licitacion",
    );
    expect(tipoDeEvento({ clave: "bo-pba:sociedad:gobblack-sa", alcanceLicitacion: null, motivo: "" })).toBe("sociedad");
    expect(tipoDeEvento({ clave: "bo-pba:transferencia:feian-sa:necochea", alcanceLicitacion: null, motivo: "" })).toBe(
      "transferencia",
    );
  });

  it("en los ejemplos, sin clave, lo deduce del motivo o del alcance", () => {
    expect(tipoDeEvento({ clave: null, alcanceLicitacion: "provincial", motivo: "Ganó licitación" })).toBe("licitacion");
    expect(tipoDeEvento({ clave: null, alcanceLicitacion: null, motivo: "Sociedad nueva con objeto transporte" })).toBe(
      "sociedad",
    );
    expect(tipoDeEvento({ clave: null, alcanceLicitacion: null, motivo: "Busca 4 choferes" })).toBe("otro");
  });
});

describe("antigüedad del evento", () => {
  it("cuenta días calendario en Argentina", () => {
    expect(diasDesde("2026-10-22", AHORA)).toBe(0);
    expect(diasDesde("2026-10-21", AHORA)).toBe(1);
    expect(diasDesde("2026-06-22", AHORA)).toBe(122);
    // 23:30 del 21 en Argentina ya es 22 en UTC: sigue siendo "ayer" para el evento del 20.
    expect(diasDesde("2026-10-20", new Date("2026-10-22T02:30:00Z"))).toBe(1);
  });

  it("una licitación vieja baja fuerte; una sociedad nueva tarda más en perder urgencia", () => {
    expect(penalizacionPorAntiguedad("licitacion", 3)).toBe(0);
    expect(penalizacionPorAntiguedad("licitacion", 10)).toBe(-5);
    expect(penalizacionPorAntiguedad("licitacion", 20)).toBe(-10);
    expect(penalizacionPorAntiguedad("licitacion", 45)).toBe(-25);
    expect(penalizacionPorAntiguedad("licitacion", 122)).toBe(-35);
    expect(penalizacionPorAntiguedad("sociedad", 25)).toBe(0);
    expect(penalizacionPorAntiguedad("sociedad", 45)).toBe(-5);
    expect(penalizacionPorAntiguedad("transferencia", 70)).toBe(-15);
    expect(penalizacionPorAntiguedad("licitacion", null)).toBe(0);
    expect(penalizacionPorAntiguedad("otro", 400)).toBe(0);
  });

  it("pasados 30 días la caución deja de ser el primer ramo de una licitación", () => {
    const ramos = ["Caución", "RC", "ART", "Todo riesgo construcción"];
    expect(ramosSugeridos(ramos, "licitacion", 10)).toEqual(ramos);
    expect(ramosSugeridos(ramos, "licitacion", 31)).toEqual(["RC", "ART", "Todo riesgo construcción", "Caución"]);
    expect(ramosSugeridos(["Flota", "ART"], "sociedad", 200)).toEqual(["Flota", "ART"]);
  });
});

describe("etiquetaEvento", () => {
  it("dice qué pasó y cuándo", () => {
    expect(etiquetaEvento("licitacion", "2026-10-22", AHORA)).toBe("Adjudicada hoy");
    expect(etiquetaEvento("sociedad", "2026-10-21", AHORA)).toBe("Publicado ayer");
    expect(etiquetaEvento("licitacion", "2026-10-12", AHORA)).toBe("Adjudicada hace 10 días");
    expect(etiquetaEvento("licitacion", "2026-06-22", AHORA)).toMatch(/^Adjudicada el 22 jun/);
  });
});
