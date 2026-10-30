import { describe, expect, it } from "vitest";
import {
  filtroDeConsumo,
  inicioDelMes,
  limiteAlcanzado,
  resolverConfiguracion,
  type AlcanceIA,
  type FilaConfiguracionIA,
} from "./configuracion";

const fila = (extra: Partial<FilaConfiguracionIA>): FilaConfiguracionIA => ({
  agente: "*",
  operacion: "*",
  proveedor: null,
  modelo: null,
  activa: true,
  limiteCostoUsd: null,
  limiteTokensMes: null,
  orgId: null,
  producerId: null,
  ...extra,
});

const ALCANCE: AlcanceIA = { agente: "validador", operacion: "extraer_listado", orgId: "org-1", producerId: "prod-1" };

describe("resolverConfiguracion", () => {
  it("sin filas la IA queda apagada", () => {
    expect(resolverConfiguracion([], ALCANCE)).toEqual({ activa: false, proveedor: null, modelo: null, limites: [] });
  });

  it("la plataforma la prende y la organización la apaga", () => {
    const filas = [fila({}), fila({ orgId: "org-1", activa: false })];
    expect(resolverConfiguracion(filas, ALCANCE).activa).toBe(false);
  });

  it("la fila de un agente (el interruptor de Cotización) pesa más que la * / *, pero el tope general sigue", () => {
    const cotizacion: AlcanceIA = { agente: "cotizacion", operacion: "*", orgId: null, producerId: null };
    const general = fila({ limiteCostoUsd: 20 });
    expect(resolverConfiguracion([general, fila({ agente: "cotizacion", activa: false })], cotizacion).activa).toBe(false);
    const prendida = resolverConfiguracion([general, fila({ agente: "cotizacion" })], cotizacion);
    expect(prendida.activa).toBe(true);
    expect(prendida.limites).toEqual([{ agente: "*", operacion: "*", porProductor: false, costoUsd: 20, tokensMes: null }]);
    // El Validador no se entera del interruptor de Cotización.
    expect(resolverConfiguracion([general, fila({ agente: "cotizacion", activa: false })], ALCANCE).activa).toBe(true);
  });

  it("el productor pisa a la organización y a la plataforma", () => {
    const filas = [fila({ activa: false }), fila({ orgId: "org-1", activa: false }), fila({ orgId: "org-1", producerId: "prod-1" })];
    expect(resolverConfiguracion(filas, ALCANCE).activa).toBe(true);
  });

  it("ignora filas de otra organización, otro productor u otro agente", () => {
    const filas = [
      fila({ activa: false }),
      fila({ orgId: "org-2" }),
      fila({ orgId: "org-1", producerId: "prod-2" }),
      fila({ agente: "siniestros", orgId: "org-1" }),
    ];
    expect(resolverConfiguracion(filas, ALCANCE).activa).toBe(false);
  });

  it("dentro del mismo alcance, agente y operación exactos pesan más que el comodín", () => {
    const filas = [fila({ orgId: "org-1", activa: false }), fila({ orgId: "org-1", agente: "validador", operacion: "extraer_listado" })];
    expect(resolverConfiguracion(filas, ALCANCE).activa).toBe(true);
  });

  it("toma el modelo de la fila más específica que lo tenga cargado", () => {
    const filas = [fila({ modelo: "claude-sonnet-5-5", proveedor: "anthropic" }), fila({ orgId: "org-1", modelo: "claude-haiku-5-5" }), fila({ orgId: "org-1", producerId: "prod-1" })];
    expect(resolverConfiguracion(filas, ALCANCE)).toMatchObject({ modelo: "claude-haiku-5-5", proveedor: "anthropic" });
  });

  it("la cuota de la plataforma es la cuota por defecto de cada organización", () => {
    const filas = [fila({ limiteCostoUsd: 5 }), fila({ orgId: "org-1", limiteCostoUsd: 20 }), fila({ agente: "validador", limiteTokensMes: 1000 })];
    expect(resolverConfiguracion(filas, ALCANCE).limites).toEqual([
      { agente: "*", operacion: "*", porProductor: false, costoUsd: 20, tokensMes: null },
      { agente: "validador", operacion: "*", porProductor: false, costoUsd: null, tokensMes: 1000 },
    ]);
  });
});

describe("filtroDeConsumo", () => {
  it("mide por organización aunque el límite venga de la plataforma", () => {
    expect(filtroDeConsumo({ agente: "*", operacion: "*", porProductor: false, costoUsd: 5, tokensMes: null }, ALCANCE))
      .toEqual({ agente: null, operacion: null, orgId: "org-1", producerId: null, porProductor: false });
  });

  it("un límite del productor mide solo su consumo", () => {
    expect(filtroDeConsumo({ agente: "validador", operacion: "*", porProductor: true, costoUsd: 1, tokensMes: null }, ALCANCE))
      .toEqual({ agente: "validador", operacion: null, orgId: "org-1", producerId: "prod-1", porProductor: true });
  });
});

describe("limiteAlcanzado", () => {
  const limite = { agente: "*", operacion: "*", porProductor: false, costoUsd: 2, tokensMes: 10_000 };

  it("hay margen mientras el consumo esté por debajo de los dos topes", () => {
    expect(limiteAlcanzado([{ limite, consumo: { costoUsd: 1.99, tokens: 9_999 } }])).toBeNull();
  });

  it("se corta al llegar al tope de costo o al de tokens", () => {
    expect(limiteAlcanzado([{ limite, consumo: { costoUsd: 2, tokens: 0 } }])).toBe(limite);
    expect(limiteAlcanzado([{ limite, consumo: { costoUsd: 0, tokens: 10_000 } }])).toBe(limite);
  });
});

describe("inicioDelMes", () => {
  it("usa el mes de Argentina, no el de UTC", () => {
    // 1/11 a las 02:00 UTC todavía es 31/10 en Buenos Aires.
    expect(inicioDelMes(new Date("2026-11-01T02:00:00Z")).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(inicioDelMes(new Date("2026-11-01T03:00:00Z")).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
});
