import { describe, expect, it } from "vitest";
import { agruparPorSemana, lunesDe, polizasPorVencer, polizasRenovadas } from "./vencimientos";

describe("lunesDe", () => {
  it("devuelve el lunes de la semana, también para los domingos", () => {
    expect(lunesDe("2026-10-27")).toBe("2026-10-26"); // martes
    expect(lunesDe("2026-11-01")).toBe("2026-10-26"); // domingo
    expect(lunesDe("2026-11-02")).toBe("2026-11-02"); // lunes
  });
});

describe("agruparPorSemana", () => {
  it("agrupa por semana dentro del plazo, con títulos claros", () => {
    const semanas = agruparPorSemana(
      [
        { vence: "2026-10-29", n: 1 },
        { vence: "2026-11-05", n: 2 },
        { vence: "2026-11-03", n: 3 },
        { vence: "2026-11-20", n: 4 },
        { vence: "2026-10-20", n: 5 }, // ya venció
        { vence: "2027-03-01", n: 6 }, // fuera del plazo
      ],
      "2026-10-27",
      30,
    );
    expect(semanas.map((s) => [s.titulo, s.items.map((i) => i.n)])).toEqual([
      ["Esta semana", [1]],
      ["La semana que viene", [3, 2]],
      ["Semana del 16/11 al 22/11", [4]],
    ]);
    expect(semanas[0].items[0].dias).toBe(2);
  });
});

describe("polizasPorVencer", () => {
  it("las vigentes con fecha de fin, con su asegurado; las dadas de baja o vencidas no", () => {
    const a = {
      nombre: "Acosta, Valeria",
      polizas: [
        { id: 1, vigenciaHasta: "2026-11-15", bajaEl: null },
        { id: 2, vigenciaHasta: "2026-10-01", bajaEl: null },
        { id: 3, vigenciaHasta: "2026-12-01", bajaEl: new Date() },
        { id: 4, vigenciaHasta: null, bajaEl: null },
      ],
    };
    expect(polizasPorVencer([a], "2026-10-29").map((i) => [i.poliza.id, i.vence, i.asegurado.nombre])).toEqual([[1, "2026-11-15", "Acosta, Valeria"]]);
  });
});

describe("polizasRenovadas", () => {
  const HOY = "2026-10-29";
  const creada = new Date("2026-01-10T15:00:00Z");
  const poliza = (extra: Partial<Parameters<typeof polizasRenovadas>[0][number]>) => ({
    id: 1,
    aseguradoId: 1,
    ramo: "Auto",
    compania: "Sancor",
    vigenciaDesde: "2026-10-10",
    vigenciaHasta: "2027-10-10",
    bajaEl: null,
    creadoEl: new Date("2026-10-20T15:00:00Z"),
    ...extra,
  });

  it("continúa otra del mismo asegurado, ramo y compañía que terminó ese día, aunque esté dada de baja", () => {
    const anterior = poliza({ id: 2, vigenciaDesde: "2025-10-12", vigenciaHasta: "2026-10-12", bajaEl: new Date(), creadoEl: creada, compania: "SANCOR", ramo: "Automotor" });
    expect(polizasRenovadas([poliza({}), anterior], HOY, 60).map((p) => p.id)).toEqual([1]);
  });

  it("la misma póliza, con la vigencia corrida por una reimportación", () => {
    expect(polizasRenovadas([poliza({ creadoEl: creada })], HOY, 60).map((p) => p.id)).toEqual([1]);
  });

  it("una póliza nueva, de otra compañía o fuera del plazo no es renovación", () => {
    const otraCompania = poliza({ id: 2, compania: "La Segunda", vigenciaDesde: "2025-10-10", vigenciaHasta: "2026-10-10" });
    expect(polizasRenovadas([poliza({}), otraCompania], HOY, 60)).toEqual([]);
    expect(polizasRenovadas([poliza({ vigenciaDesde: "2026-07-01", creadoEl: creada })], HOY, 60)).toEqual([]);
    const anterior = poliza({ id: 2, vigenciaDesde: "2025-10-01", vigenciaHasta: "2026-10-01" });
    expect(polizasRenovadas([poliza({}), anterior], HOY, 60)).toEqual([]);
  });
});
