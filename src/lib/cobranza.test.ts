import { describe, expect, it } from "vitest";
import { cuentaComoIntento, etiquetaPendiente, leerReferencia, referenciaDe, textoVencimiento } from "./cobranza";

const HOY = "2026-10-27";

describe("mensajes para aprobar", () => {
  it("etiquetas de las tarjetas", () => {
    expect(etiquetaPendiente(2, "2026-10-29", HOY)).toEqual({ texto: "Paso 2 · Vence en 2 días", tono: "aviso" });
    expect(etiquetaPendiente(3, "2026-10-22", HOY)).toEqual({ texto: "Paso 3 · Vencida hace 5 días", tono: "vencida" });
    expect(etiquetaPendiente("diferencia", "2026-10-31", HOY)).toEqual({ texto: "Pago incompleto", tono: "problema" });
    expect(etiquetaPendiente("agente", "2026-10-26", HOY)).toEqual({ texto: "Agente · Vencida hace 1 día", tono: "vencida" });
    expect(etiquetaPendiente("llamada", "2026-10-27", HOY)).toEqual({ texto: "Llamada · Vence hoy", tono: "llamada" });
  });

  it("vencimiento en palabras", () => {
    expect(textoVencimiento("2026-10-29", HOY)).toBe("vence el jueves 29/10");
    expect(textoVencimiento("2026-10-22", HOY)).toBe("venció el 22/10");
    expect(textoVencimiento("2026-10-27", HOY)).toBe("vence hoy");
    expect(textoVencimiento("2026-11-08", HOY)).toBe("vence el 08/11");
  });

  it("referencias: ida y vuelta", () => {
    expect(leerReferencia("cuota:12:paso:2")).toEqual({ cuotaId: 12, tipo: 2 });
    expect(leerReferencia("cuota:7:diferencia")).toEqual({ cuotaId: 7, tipo: "diferencia" });
    expect(leerReferencia("cuota:7:agente")).toEqual({ cuotaId: 7, tipo: "agente" });
    expect(leerReferencia("vencimiento:3:2026-11-05")).toBeNull();
    expect(referenciaDe(12, 4)).toBe("cuota:12:paso:4");
    expect(referenciaDe(12, "llamada")).toBe("cuota:12:llamada");
  });

  it("los pedidos puntuales del Validador no cuentan como intento", () => {
    expect([1, "agente", "llamada", "diferencia", "comprobante", "recibo"].map((t) => cuentaComoIntento(t as never))).toEqual([true, true, true, false, false, false]);
  });
});
