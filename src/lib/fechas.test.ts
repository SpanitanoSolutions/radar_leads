import { describe, expect, it } from "vitest";
import { diaYMes, edad, finDeSemana, haceCuanto, sumarDias } from "./fechas";

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

describe("sumarDias y diaYMes", () => {
  it("suma días calendario cruzando meses y años", () => {
    expect(sumarDias("2026-10-22", 7)).toBe("2026-10-29");
    expect(sumarDias("2026-10-28", 7)).toBe("2026-11-04");
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(diaYMes("2026-11-04")).toBe("04/11");
  });
});

describe("edad", () => {
  it("cuenta los años cumplidos", () => {
    expect(edad("1977-02-16", "2026-10-28")).toBe(49);
    expect(edad("1977-10-28", "2026-10-28")).toBe(49);
    expect(edad("1977-10-29", "2026-10-28")).toBe(48);
  });
});

describe("finDeSemana", () => {
  it("devuelve el domingo de la semana de lunes a domingo", () => {
    expect(finDeSemana("2026-10-26")).toBe("2026-11-01"); // lunes
    expect(finDeSemana("2026-10-29")).toBe("2026-11-01"); // jueves
    expect(finDeSemana("2026-11-01")).toBe("2026-11-01"); // domingo
    expect(finDeSemana("2026-12-30")).toBe("2027-01-03"); // cruza el año
  });
});
