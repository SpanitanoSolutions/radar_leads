import { describe, expect, it } from "vitest";
import { haceCuanto } from "./fechas";

describe("haceCuanto", () => {
  // 22/10 a las 10:00 en Argentina (UTC-3)
  const ahora = new Date("2026-10-22T13:00:00Z");

  it("cuenta días calendario en hora argentina", () => {
    expect(haceCuanto(new Date("2026-10-22T04:00:00Z"), ahora)).toBe("Hoy"); // 01:00 AR
    expect(haceCuanto(new Date("2026-10-22T02:00:00Z"), ahora)).toBe("Ayer"); // 23:00 AR del 21
    expect(haceCuanto(new Date("2026-10-19T15:00:00Z"), ahora)).toBe("Hace 3 días");
  });

  it("muestra la fecha cuando pasó más de un mes", () => {
    expect(haceCuanto(new Date("2026-08-01T15:00:00Z"), ahora)).toMatch(/1.*ago/);
  });
});
