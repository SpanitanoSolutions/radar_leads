import { describe, expect, it } from "vitest";
import { agotoIntentos, ERROR_GENERICO, ErrorTrabajo, errorSeguro, esReintentable, limiteColgado, porcentaje, trasFallo } from "./trabajos";

const AHORA = new Date("2026-10-29T15:00:00Z");
const minutosDespues = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

describe("trasFallo", () => {
  it("espera 1 y 5 minutos antes de reintentar", () => {
    expect(trasFallo(1, AHORA, true)).toEqual({ estado: "pendiente", ejecutarDespuesDe: minutosDespues(1) });
    expect(trasFallo(2, AHORA, true)).toEqual({ estado: "pendiente", ejecutarDespuesDe: minutosDespues(5) });
  });

  it("al tercer fallo queda en error", () => {
    expect(trasFallo(3, AHORA, true)).toEqual({ estado: "error" });
  });

  it("un error no reintentable corta en el primer intento", () => {
    expect(trasFallo(1, AHORA, false)).toEqual({ estado: "error" });
  });
});

describe("errores", () => {
  it("solo guarda el mensaje de un ErrorTrabajo", () => {
    expect(errorSeguro(new ErrorTrabajo("El PDF no tiene texto legible.", false))).toBe("El PDF no tiene texto legible.");
    expect(errorSeguro(new Error("Falló la póliza AU-123 de Juan Pérez"))).toBe(ERROR_GENERICO);
    expect(errorSeguro("cualquier cosa")).toBe(ERROR_GENERICO);
  });

  it("un error desconocido se puede reintentar", () => {
    expect(esReintentable(new Error("timeout"))).toBe(true);
    expect(esReintentable(new ErrorTrabajo("Formato desconocido", false))).toBe(false);
  });
});

describe("trabajos caídos", () => {
  it("cuenta como caído lo que lleva más de 15 minutos en procesando", () => {
    expect(limiteColgado(AHORA)).toEqual(new Date("2026-10-29T14:45:00Z"));
  });

  it("después del tercer intento ya no se ejecuta", () => {
    expect(agotoIntentos(3)).toBe(false);
    expect(agotoIntentos(4)).toBe(true);
  });
});

describe("porcentaje", () => {
  it("redondea y se mantiene entre 0 y 100", () => {
    expect(porcentaje(3, 7)).toBe(43);
    expect(porcentaje(9, 7)).toBe(100);
    expect(porcentaje(1, 0)).toBe(0);
  });
});
