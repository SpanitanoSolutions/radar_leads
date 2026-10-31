import { describe, expect, it } from "vitest";
import { guionSinIA, mensajeSinIA, textoIntento, type ReciboParaPlantilla } from "./plantillas";

const recibo = (r: Partial<ReciboParaPlantilla> = {}): ReciboParaPlantilla => ({
  compania: "Sancor",
  ramo: "Auto",
  poliza: "SAN-AU-1",
  recibo: "Cuota 4/12",
  monto: "$ 14.974,43",
  vencimiento: "2026-11-05",
  diasParaVencer: 3,
  comoPagar: null,
  ...r,
});

describe("mensajes sin IA", () => {
  it("cambia según el recibo más atrasado y firma", () => {
    expect(mensajeSinIA("Lucía", [recibo()], "Juan").texto).toBe(
      "Hola Lucía, ¿cómo estás? Te recuerdo que el 05/11 vence la cuota de tu seguro de auto con Sancor ($ 14.974,43). Si ya la pagaste, avisame. Saludos, Juan",
    );
    expect(mensajeSinIA("Lucía", [recibo({ diasParaVencer: 0 })], "Juan").texto).toMatch(/Hoy vence/);
    expect(mensajeSinIA("Lucía", [recibo({ diasParaVencer: -5, vencimiento: "2026-10-28" })], "Juan").texto).toMatch(/venció el 28\/10 y todavía no me figura/);
    expect(mensajeSinIA("Lucía", [recibo({ diasParaVencer: -20, comoPagar: "transferencia" })], "Juan").texto).toMatch(/sigue impaga.*no te quedes sin cobertura/);
    expect(mensajeSinIA("Lucía", [recibo({ comoPagar: "transferencia o Rapipago" })], "Juan").texto).toMatch(/Podés pagarlo por transferencia o Rapipago/);
  });

  it("menciona varios recibos juntos, sin amenazas", () => {
    const m = mensajeSinIA("Lucía", [recibo(), recibo({ compania: "Rivadavia", ramo: "Hogar", diasParaVencer: -2, vencimiento: "2026-10-31" })], "Juan");
    expect(m.asunto).toBe("Tus cuotas de seguro pendientes");
    expect(m.texto).toMatch(/hogar con Rivadavia .* y auto con Sancor/);
    expect(m.texto).not.toMatch(/juicio|legal|intimaci/i);
    expect(guionSinIA("Lucía", [recibo()], "Juan")).toMatch(/^Presentate como asistente de Juan/);
  });

  it("cuenta el intento como en la spec", () => {
    expect(textoIntento(4, -11, "$ 14.974,43")).toBe("Cuarto intento. Póliza vencida hace 11 días, $ 14.974,43.");
    expect(textoIntento(1, 2, "$ 1")).toBe("Primer intento. Vence en 2 días, $ 1.");
    expect(textoIntento(12, 0, "$ 1")).toBe("Intento 12. Vence hoy, $ 1.");
  });
});
