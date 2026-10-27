import { describe, expect, it } from "vitest";
import { aCsv, fechaCsv, montoCsv } from "./csv";

describe("aCsv", () => {
  it("separa con punto y coma y escapa lo que hace falta", () => {
    expect(aCsv([["Asegurado", "Bien"], ["Gómez, Lucía", 'Buque "Don Nino"'], ["Sosa; Ricardo", null]])).toBe(
      '﻿Asegurado;Bien\r\nGómez, Lucía;"Buque ""Don Nino"""\r\n"Sosa; Ricardo";\r\n',
    );
  });
});

describe("formatos para Excel", () => {
  it("montos con coma decimal y fechas dd/mm/aaaa", () => {
    expect(montoCsv(1234567.5)).toBe("1234567,50");
    expect(montoCsv(null)).toBe("");
    expect(fechaCsv("2026-11-05")).toBe("05/11/2026");
  });
});
