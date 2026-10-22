import { describe, expect, it } from "vitest";
import type { Lead } from "@/db/schema";
import { calcularResultados, esMotivoDescarte, origenDeLead, parsearMonto } from "./cierre";

describe("parsearMonto", () => {
  it("entiende los formatos en que se escribe una plata", () => {
    expect(parsearMonto("$ 150.000")).toBe(150000);
    expect(parsearMonto("150000")).toBe(150000);
    expect(parsearMonto("1.200.000,50")).toBe(1200001);
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto(null)).toBeNull();
    expect(parsearMonto("mucho")).toBeNull();
    expect(parsearMonto("1.20")).toBeNull(); // ambiguo: no se adivina
  });
});

describe("motivos de descarte", () => {
  it("acepta solo los del catálogo", () => {
    expect(esMotivoDescarte("ya-tiene-productor")).toBe(true);
    expect(esMotivoDescarte("cualquiera")).toBe(false);
  });
});

type L = Parameters<typeof calcularResultados>[0][number];
let n = 0;
const lead = (extra: Partial<Lead>): L => ({
  clave: `comprar:${n++}:30-1`,
  alcanceLicitacion: "nacional",
  motivo: "Ganó licitación",
  fuente: "COMPR.AR – adjudicaciones",
  sectorId: "construccion",
  estado: "nuevo",
  esEjemplo: false,
  contactadoEl: null,
  reunionEl: null,
  cierreComision: null,
  cierrePrima: null,
  ...extra,
});

describe("origenDeLead", () => {
  it("separa licitaciones, sociedades nuevas y fondos de comercio", () => {
    expect(origenDeLead(lead({}))).toBe("Licitaciones (COMPR.AR)");
    expect(
      origenDeLead(lead({ clave: "bo-pba:sociedad:x", alcanceLicitacion: null, motivo: "Sociedad nueva: construcción" })),
    ).toBe("Sociedades nuevas (Boletín Oficial)");
    expect(
      origenDeLead(lead({ clave: "bo-pba:transferencia:x:y", alcanceLicitacion: null, motivo: "Compró un fondo de comercio" })),
    ).toBe("Fondos de comercio (Boletín Oficial)");
  });
});

describe("calcularResultados", () => {
  const ahora = new Date("2026-10-22T12:00:00Z");
  const leads = [
    lead({ estado: "cerrado", contactadoEl: ahora, reunionEl: ahora, cierreComision: 180000, cierrePrima: 1200000 }),
    lead({ estado: "reunion", contactadoEl: ahora, reunionEl: ahora }),
    lead({ estado: "llamado", contactadoEl: ahora }),
    lead({ estado: "descartado", contactadoEl: ahora }), // no atendió: se llamó
    lead({ estado: "nuevo" }),
    lead({
      clave: "bo-pba:sociedad:gobblack-sa",
      alcanceLicitacion: null,
      motivo: "Sociedad nueva: transporte de pasajeros",
      fuente: "Boletín Oficial PBA",
      sectorId: "flotas",
      estado: "cerrado",
      cierreComision: 90000,
    }),
    lead({ estado: "cerrado", esEjemplo: true, cierreComision: 999999 }), // los ejemplos no cuentan
  ];
  const r = calcularResultados(leads, { construccion: "Construcción", flotas: "Flotas y transporte" });

  it("arma el embudo total sin los ejemplos", () => {
    expect(r.total).toMatchObject({
      leads: 6,
      contactados: 5, // el cerrado del Boletín no tenía fecha de contacto, pero cerrado implica contacto
      reuniones: 2,
      cerrados: 2,
      descartados: 1,
      comision: 270000,
      prima: 1200000,
    });
    expect(r.total.conversion).toBeCloseTo(2 / 6);
    expect(r.total.conversionContactados).toBeCloseTo(2 / 5);
  });

  it("separa por fuente y por sector, los que más cierran primero", () => {
    expect(r.porOrigen.map((f) => [f.nombre, f.leads, f.cerrados, f.comision])).toEqual([
      ["Licitaciones (COMPR.AR)", 5, 1, 180000],
      ["Sociedades nuevas (Boletín Oficial)", 1, 1, 90000],
    ]);
    expect(r.porSector.map((f) => [f.nombre, f.leads])).toEqual([
      ["Construcción", 5],
      ["Flotas y transporte", 1],
    ]);
  });
});
