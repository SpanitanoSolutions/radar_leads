import { describe, expect, it } from "vitest";
import { calcularProximoSeguimiento, feriadosNacionalesArgentina, trasladarFeriado } from "./seguimientos";

const ESTRATEGIA = "Cada 3 días hábiles";

describe("feriados nacionales", () => {
  it("traslada según la Ley 27.399: martes y miércoles al lunes anterior, jueves y viernes al lunes siguiente", () => {
    expect(trasladarFeriado("2025-06-17")).toBe("2025-06-16"); // martes
    expect(trasladarFeriado("2026-06-17")).toBe("2026-06-15"); // miércoles
    expect(trasladarFeriado("2027-06-17")).toBe("2027-06-21"); // jueves
    expect(trasladarFeriado("2026-11-20")).toBe("2026-11-23"); // viernes
    expect(trasladarFeriado("2026-08-17")).toBe("2026-08-17"); // lunes: queda
    expect(trasladarFeriado("2024-08-17")).toBe("2024-08-17"); // sábado: queda salvo que lo mueva la Jefatura de Gabinete
    expect(trasladarFeriado("2025-10-12")).toBe("2025-10-12"); // domingo: ídem
  });

  it("2026: el 17 de junio y los trasladables movidos, los puente y el 9 de noviembre", () => {
    const feriados = feriadosNacionalesArgentina(2026);
    expect(feriados).toEqual(expect.arrayContaining([
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-03-24", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25",
      "2026-06-15", "2026-06-20", "2026-07-09", "2026-08-17", "2026-10-12", "2026-11-23", "2026-12-08", "2026-12-25",
      "2026-03-23", "2026-07-10", "2026-12-07", "2026-11-09",
    ]));
    expect(feriados).not.toContain("2026-06-17");
    expect(feriados).not.toContain("2026-11-20");
    expect(feriados).toHaveLength(20);
  });

  it("2025: los trasladables, los puente y el 12 de octubre que la Jefatura pasó al viernes 10", () => {
    const feriados = feriadosNacionalesArgentina(2025);
    expect(feriados).toEqual(expect.arrayContaining(["2025-06-16", "2025-11-24", "2025-05-02", "2025-08-15", "2025-11-21", "2025-10-10"]));
    expect(feriados).not.toContain("2025-06-17");
    expect(feriados).not.toContain("2025-11-20");
  });

  it("2024: los trasladables y los puente", () => {
    expect(feriadosNacionalesArgentina(2024)).toEqual(expect.arrayContaining(["2024-06-17", "2024-11-18", "2024-04-01", "2024-06-21", "2024-10-11"]));
    expect(feriadosNacionalesArgentina(2024)).not.toContain("2024-11-20");
  });

  it("un año sin lista cargada todavía aplica la ley: 2027", () => {
    expect(feriadosNacionalesArgentina(2027)).toEqual(expect.arrayContaining(["2027-02-08", "2027-02-09", "2027-03-26", "2027-06-21", "2027-08-16", "2027-10-11", "2027-11-20"]));
  });
});

describe("próximo seguimiento", () => {
  it("cuenta desde el día en Argentina, no desde la fecha en UTC", () => {
    // Jueves 29/10 a las 23:30 en Argentina; en UTC ya es viernes 30.
    const proximo = calcularProximoSeguimiento(new Date("2026-10-29T23:30:00-03:00"), "Automotor", ESTRATEGIA);
    // Viernes 30, lunes 2 y martes 3.
    expect(proximo).toEqual(new Date("2026-11-03T00:00:00-03:00"));
  });

  it("queda a una hora que el cron de ese día ya toma, y el del día anterior no", () => {
    const proximo = calcularProximoSeguimiento(new Date("2026-10-29T15:00:00-03:00"), "Automotor", ESTRATEGIA)!;
    // El cron corre a las 13 UTC (10 de Argentina) y toma lo que tiene próximo seguimiento <= ahora.
    expect(proximo.getTime()).toBeLessThanOrEqual(new Date("2026-11-03T13:00:00Z").getTime());
    expect(proximo.getTime()).toBeGreaterThan(new Date("2026-11-02T13:00:00Z").getTime());
  });

  it("saltea el feriado del 9 de noviembre de 2026", () => {
    // Jueves 5/11: viernes 6, (lunes 9 feriado), martes 10 y miércoles 11.
    expect(calcularProximoSeguimiento(new Date("2026-11-05T12:00:00-03:00"), "Automotor", ESTRATEGIA)).toEqual(new Date("2026-11-11T00:00:00-03:00"));
  });

  it("saltea un trasladable movido: el 20 de noviembre de 2026 pasa al lunes 23", () => {
    // Jueves 19/11: viernes 20 (es hábil), (lunes 23 feriado), martes 24 y miércoles 25.
    expect(calcularProximoSeguimiento(new Date("2026-11-19T12:00:00-03:00"), "Automotor", ESTRATEGIA)).toEqual(new Date("2026-11-25T00:00:00-03:00"));
  });

  it("usa los feriados del año siguiente si el plazo cruza el 1 de enero", () => {
    // Miércoles 30/12: jueves 31, (viernes 1 feriado), lunes 4 y martes 5.
    expect(calcularProximoSeguimiento(new Date("2026-12-30T12:00:00-03:00"), "Automotor", ESTRATEGIA)).toEqual(new Date("2027-01-05T00:00:00-03:00"));
  });

  it("respeta el intervalo por ramo y devuelve null con una estrategia que no entiende", () => {
    expect(calcularProximoSeguimiento(new Date("2026-10-29T12:00:00-03:00"), "Flotas", "Cada 3 días hábiles; para Flotas cada 1 día hábil")).toEqual(new Date("2026-10-30T00:00:00-03:00"));
    expect(calcularProximoSeguimiento(new Date("2026-10-29T12:00:00-03:00"), "Automotor", "cuando puedas")).toBeNull();
  });
});
