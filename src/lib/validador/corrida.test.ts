import { describe, expect, it } from "vitest";
import { estadoDeCorrida, periodoDeConsulta, resumenDeCorrida, type DatosResumen } from "./corrida";

const datos = (extra: Partial<DatosResumen> = {}): DatosResumen => ({
  companias: 3,
  pagadas: 39,
  canceladas: 0,
  aRevisar: 3,
  noIdentificados: 0,
  porVencer: 12,
  vencidas: 0,
  errores: [],
  ...extra,
});

describe("corrida", () => {
  it("pide desde una semana antes de la última corrida buena, sin pasar de 60 días", () => {
    expect(periodoDeConsulta("2026-10-29", "2026-10-28")).toEqual({ desde: "2026-10-21", hasta: "2026-11-29" });
    expect(periodoDeConsulta("2026-10-29", null)).toEqual({ desde: "2026-08-30", hasta: "2026-11-29" });
    expect(periodoDeConsulta("2026-10-29", "2026-01-10")).toEqual({ desde: "2026-08-30", hasta: "2026-11-29" });
  });

  it("termina con errores si alguna compañía falló", () => {
    expect(estadoDeCorrida([])).toBe("ok");
    expect(estadoDeCorrida([{ compania: "Sancor", codigo: "timeout", mensaje: "No respondió." }])).toBe("con_errores");
  });

  it("resume lo que pasó en castellano", () => {
    expect(resumenDeCorrida(datos())).toBe("Se revisaron 3 compañías: se confirmaron 39 pagos. 12 cuotas vencen esta semana. Hay 3 casos para revisar.");
    expect(resumenDeCorrida(datos({ companias: 1, pagadas: 1, canceladas: 2, aRevisar: 1, noIdentificados: 1, porVencer: 1, vencidas: 4 }))).toBe(
      "Se revisó 1 compañía: se confirmó 1 pago y se cancelaron 2 cuotas. 1 cuota vence esta semana y 4 están vencidas. Hay 1 caso para revisar y 1 pago no identificado.",
    );
    expect(resumenDeCorrida(datos({ pagadas: 0, aRevisar: 0, porVencer: 0, errores: [{ compania: "Mapfre", codigo: "timeout", mensaje: "No respondió: queda la importación manual." }] }))).toBe(
      "Se revisaron 3 compañías: no hubo pagos nuevos. Mapfre: No respondió: queda la importación manual.",
    );
    expect(resumenDeCorrida(datos({ companias: 0, pagadas: 0, aRevisar: 0, porVencer: 0 }))).toBe("No había compañías para revisar.");
  });
});
