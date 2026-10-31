import { describe, expect, it } from "vitest";
import { resolverConfigCobranza } from "./configuracion";
import { pasadasLocales, proximaPasada, tocaCorrer } from "./programacion";

const config = resolverConfigCobranza(null); // 10:00, lunes a viernes
const lunes10 = new Date("2026-11-02T13:00:00Z");

describe("programación del agente", () => {
  it("corre los días permitidos desde la hora configurada, una vez por día", () => {
    expect(tocaCorrer(config, null, lunes10)).toBe(true);
    expect(tocaCorrer(config, null, new Date("2026-11-02T12:59:00Z"))).toBe(false);
    expect(tocaCorrer(config, lunes10, new Date("2026-11-02T20:00:00Z"))).toBe(false);
    expect(tocaCorrer(config, lunes10, new Date("2026-11-03T13:00:00Z"))).toBe(true);
    expect(tocaCorrer(config, null, new Date("2026-11-01T13:00:00Z"))).toBe(false); // domingo
  });

  it("dice cuándo corre de verdad con el cron diario", () => {
    expect(proximaPasada(config, null, new Date("2026-11-02T12:00:00Z"))).toEqual(lunes10);
    expect(proximaPasada(config, lunes10, new Date("2026-11-02T14:00:00Z"))).toEqual(new Date("2026-11-03T13:00:00Z"));
    // Viernes después de la pasada: el próximo es el lunes.
    expect(proximaPasada(config, new Date("2026-11-06T13:00:00Z"), new Date("2026-11-06T14:00:00Z"))).toEqual(new Date("2026-11-09T13:00:00Z"));
  });

  it("una hora posterior a la pasada diaria no corre nunca", () => {
    expect(proximaPasada({ ...config, horaEjecucion: "11:00" }, null, new Date("2026-11-02T12:00:00Z"))).toBeNull();
    expect(proximaPasada({ ...config, diasPermitidos: [] }, null, new Date("2026-11-02T12:00:00Z"))).toBeNull();
    expect(proximaPasada({ ...config, horaEjecucion: "08:30" }, null, new Date("2026-11-02T12:00:00Z"))).toEqual(lunes10);
  });

  it("muestra la pasada en la hora local", () => {
    expect(pasadasLocales("America/Argentina/Buenos_Aires")).toEqual(["10:00"]);
  });
});
