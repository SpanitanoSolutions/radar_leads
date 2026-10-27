import { describe, expect, it } from "vitest";
import { agruparPorSemana, lunesDe } from "./vencimientos";

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
