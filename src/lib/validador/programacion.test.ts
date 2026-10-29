import { describe, expect, it } from "vitest";
import { CONFIG_POR_DEFECTO, type ConfigValidador } from "./configuracion";
import { enZona, inicioDelPeriodo, instanteEnZona, proximaEjecucion, tocaEjecutar } from "./programacion";

// El jueves 29/10/2026 en Buenos Aires (UTC−3).
const art = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);
const config = (extra: Partial<ConfigValidador> = {}): ConfigValidador => ({ ...CONFIG_POR_DEFECTO, ...extra });

describe("zona horaria", () => {
  it("lee el día y la hora en la zona, y vuelve al instante", () => {
    expect(enZona(new Date("2026-10-30T02:30:00Z"), "America/Argentina/Buenos_Aires")).toEqual({ dia: "2026-10-29", hora: "23:30" });
    expect(instanteEnZona("2026-10-29", "07:00", "America/Argentina/Buenos_Aires").toISOString()).toBe("2026-10-29T10:00:00.000Z");
    // Una zona inválida usa la de Buenos Aires.
    expect(enZona(new Date("2026-10-29T10:00:00Z"), "Marte/Olympus")).toEqual({ dia: "2026-10-29", hora: "07:00" });
  });

  it("el período empieza el mismo día, el lunes o el 1.º", () => {
    expect(inicioDelPeriodo("2026-10-29", "diaria")).toBe("2026-10-29");
    expect(inicioDelPeriodo("2026-10-29", "semanal")).toBe("2026-10-26");
    expect(inicioDelPeriodo("2026-10-26", "semanal")).toBe("2026-10-26");
    expect(inicioDelPeriodo("2026-10-29", "mensual")).toBe("2026-10-01");
  });
});

describe("tocaEjecutar", () => {
  it("diaria: desde la hora configurada y una sola vez por día", () => {
    const c = config();
    expect(tocaEjecutar(c, "validacion", null, art("2026-10-29", "06:59"))).toBe(false);
    expect(tocaEjecutar(c, "validacion", null, art("2026-10-29", "07:00"))).toBe(true);
    expect(tocaEjecutar(c, "validacion", art("2026-10-29", "07:05"), art("2026-10-29", "11:00"))).toBe(false);
    expect(tocaEjecutar(c, "validacion", art("2026-10-28", "07:05"), art("2026-10-29", "07:01"))).toBe(true);
    // El enriquecimiento tiene su propia hora.
    expect(tocaEjecutar(c, "enriquecimiento", null, art("2026-10-29", "07:30"))).toBe(false);
    expect(tocaEjecutar(c, "enriquecimiento", null, art("2026-10-29", "08:00"))).toBe(true);
  });

  it("respeta la zona horaria configurada", () => {
    // 10:30 UTC son las 07:30 en Buenos Aires y las 04:30 en México.
    const ahora = new Date("2026-10-29T10:30:00Z");
    expect(tocaEjecutar(config(), "validacion", null, ahora)).toBe(true);
    expect(tocaEjecutar(config({ zonaHoraria: "America/Mexico_City" }), "validacion", null, ahora)).toBe(false);
  });

  it("semanal: una vez por semana, desde el lunes a la hora; si el cron no pasó, corre en la próxima pasada", () => {
    const c = config({ frecuencia: "semanal" });
    expect(tocaEjecutar(c, "validacion", art("2026-10-26", "07:02"), art("2026-10-29", "09:00"))).toBe(false);
    expect(tocaEjecutar(c, "validacion", art("2026-10-19", "07:02"), art("2026-10-29", "09:00"))).toBe(true);
    expect(tocaEjecutar(c, "validacion", art("2026-10-19", "07:02"), art("2026-10-26", "06:00"))).toBe(false);
  });

  it("mensual: una vez por mes", () => {
    const c = config({ frecuencia: "mensual" });
    expect(tocaEjecutar(c, "validacion", art("2026-10-01", "07:00"), art("2026-10-29", "09:00"))).toBe(false);
    expect(tocaEjecutar(c, "validacion", art("2026-09-01", "07:00"), art("2026-10-29", "09:00"))).toBe(true);
  });
});

describe("proximaEjecucion", () => {
  it("es hoy a la hora, mañana, el lunes o el 1.º según lo que ya corrió", () => {
    const ahora = art("2026-10-29", "06:00");
    expect(proximaEjecucion(config(), "validacion", art("2026-10-28", "07:00"), ahora).toISOString()).toBe("2026-10-29T10:00:00.000Z");
    const despues = art("2026-10-29", "09:00");
    expect(proximaEjecucion(config(), "validacion", art("2026-10-29", "07:00"), despues).toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(proximaEjecucion(config({ frecuencia: "semanal" }), "validacion", art("2026-10-26", "07:00"), despues).toISOString()).toBe("2026-11-02T10:00:00.000Z");
    expect(proximaEjecucion(config({ frecuencia: "mensual" }), "validacion", art("2026-10-01", "07:00"), despues).toISOString()).toBe("2026-11-01T10:00:00.000Z");
    // Pendiente: en la próxima pasada del cron.
    expect(proximaEjecucion(config(), "validacion", null, despues)).toEqual(despues);
  });
});
