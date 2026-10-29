import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_POR_DEFECTO, type ConfigValidador } from "./configuracion";
import { enZona, inicioDelPeriodo, instanteEnZona, PASADAS_CRON_UTC, proximaEjecucion, proximaPasada, tocaEjecutar } from "./programacion";

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

describe("proximaPasada", () => {
  it("diaria a las 07:00: corre en la pasada de las 08:00 de Argentina", () => {
    const ultima = art("2026-10-29", "08:00");
    expect(proximaPasada(config(), "validacion", ultima, art("2026-10-29", "15:00"))?.toISOString()).toBe("2026-10-30T11:00:00.000Z");
    expect(proximaPasada(config(), "validacion", null, art("2026-10-29", "06:00"))?.toISOString()).toBe("2026-10-29T11:00:00.000Z");
  });

  it("diaria después de la última pasada del día: no corre nunca", () => {
    expect(proximaPasada(config({ horaEjecucion: "10:00" }), "validacion", null, art("2026-10-29", "06:00"))).toBeNull();
  });

  it("semanal a las 10:00: corre en la pasada del martes", () => {
    const ultima = art("2026-10-27", "08:00");
    expect(proximaPasada(config({ frecuencia: "semanal", horaEjecucion: "10:00" }), "validacion", ultima, art("2026-10-29", "12:00"))?.toISOString()).toBe(
      "2026-11-03T11:00:00.000Z",
    );
  });

  it("las pasadas coinciden con el cron de vercel.json", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const horas = vercel.crons
      .filter((c) => c.path === "/api/cron/validador")
      .map((c) => {
        const [minuto, hora, ...resto] = c.schedule.split(" ");
        expect(resto).toEqual(["*", "*", "*"]);
        return `${hora.padStart(2, "0")}:${minuto.padStart(2, "0")}`;
      });
    expect(horas.sort()).toEqual([...PASADAS_CRON_UTC].sort());
  });
});
