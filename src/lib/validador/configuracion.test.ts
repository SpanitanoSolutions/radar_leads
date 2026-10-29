import { describe, expect, it } from "vitest";
import { CONFIG_POR_DEFECTO, resolverConfigValidador, type FilaConfigValidador } from "./configuracion";

const fila = (extra: Partial<FilaConfigValidador>): FilaConfigValidador => ({
  frecuencia: null,
  horaEjecucion: null,
  horaEnriquecimiento: null,
  zonaHoraria: null,
  toleranciaMonto: null,
  graciaHabilitada: null,
  notificaciones: null,
  orgId: null,
  producerId: null,
  ...extra,
});

const ALCANCE = { orgId: "org-1", producerId: "prod-1" };

describe("resolverConfigValidador", () => {
  it("sin filas usa los valores por defecto", () => {
    expect(resolverConfigValidador([], ALCANCE)).toEqual(CONFIG_POR_DEFECTO);
    expect(CONFIG_POR_DEFECTO).toMatchObject({ frecuencia: "diaria", horaEjecucion: "07:00", zonaHoraria: "America/Argentina/Buenos_Aires" });
  });

  it("cada campo sale de la fila más específica que lo tenga cargado", () => {
    const filas = [
      fila({ horaEjecucion: "06:00", toleranciaMonto: 5 }),
      fila({ orgId: "org-1", horaEjecucion: "09:30" }),
      fila({ orgId: "org-1", producerId: "prod-1", graciaHabilitada: false }),
    ];
    expect(resolverConfigValidador(filas, ALCANCE)).toMatchObject({ horaEjecucion: "09:30", toleranciaMonto: 5, graciaHabilitada: false, frecuencia: "diaria" });
  });

  it("ignora filas de otra organización u otro productor", () => {
    const filas = [fila({ orgId: "org-2", frecuencia: "mensual" }), fila({ orgId: "org-1", producerId: "prod-2", frecuencia: "semanal" })];
    expect(resolverConfigValidador(filas, ALCANCE).frecuencia).toBe("diaria");
  });

  it("un valor que no se entiende hereda del nivel de arriba", () => {
    const filas = [fila({ horaEjecucion: "06:00" }), fila({ orgId: "org-1", horaEjecucion: "25:00", frecuencia: "cada tanto", toleranciaMonto: -1 })];
    expect(resolverConfigValidador(filas, ALCANCE)).toMatchObject({ horaEjecucion: "06:00", frecuencia: "diaria", toleranciaMonto: 1 });
  });
});
