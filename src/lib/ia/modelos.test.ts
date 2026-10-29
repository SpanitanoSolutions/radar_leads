import { describe, expect, it } from "vitest";
import { estimarCostoIA } from "./index";
import { MODELO_HAIKU, MODELO_SONNET, planDeTarea } from "./modelos";

describe("planDeTarea", () => {
  it("extrae con Haiku y reintenta con Sonnet", () => {
    expect(planDeTarea("extraer")).toMatchObject({ modelo: MODELO_HAIKU, modeloReintento: MODELO_SONNET });
  });

  it("explica con Sonnet y no reintenta", () => {
    expect(planDeTarea("explicar")).toMatchObject({ modelo: MODELO_SONNET, modeloReintento: null });
  });

  it("el modelo configurado pisa el de la tarea", () => {
    expect(planDeTarea("extraer", "claude-opus-5-5")).toMatchObject({ modelo: "claude-opus-5-5", modeloReintento: null });
    expect(planDeTarea("explicar", " claude-haiku-5-5 ")).toMatchObject({ modelo: MODELO_HAIKU, modeloReintento: MODELO_SONNET });
  });

  it("un modelo configurado vacío no cuenta", () => {
    expect(planDeTarea("clasificar", "  ").modelo).toBe(MODELO_HAIKU);
  });
});

describe("estimarCostoIA", () => {
  it("usa el precio de lista de cada modelo", () => {
    expect(estimarCostoIA(MODELO_HAIKU, 10_000, 1_000)).toBe(0.0015);
    expect(estimarCostoIA(MODELO_SONNET, 10_000, 1_000)).toBe(0.03);
  });

  it("Haiku cobra el tramo largo cuando el prompt pasa de 100.000 tokens", () => {
    expect(estimarCostoIA(MODELO_HAIKU, 100_000, 0)).toBe(0.01);
    expect(estimarCostoIA(MODELO_HAIKU, 120_000, 1_000)).toBe(0.0625);
  });

  it("un modelo sin precio se estima con el más caro", () => {
    expect(estimarCostoIA("modelo-nuevo", 1_000_000, 0)).toBe(4);
  });
});
