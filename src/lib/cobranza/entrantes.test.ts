import { describe, expect, it } from "vitest";
import { claveCorreo, claveTelefono, clasificarSinIA, referenciaCaso } from "./entrantes";

describe("respuestas entrantes", () => {
  it("reconoce el mismo teléfono escrito de distintas formas", () => {
    expect(claveTelefono("+54 9 223 512-0087")).toBe("2235120087");
    expect(claveTelefono("223 512-0087")).toBe("2235120087");
    expect(claveTelefono("5492235120087@s.whatsapp.net")).toBe("2235120087");
    expect(claveTelefono("123")).toBeNull();
    expect(claveCorreo('"Lucía Gómez" <Lucia.Gomez@Ejemplo.com.ar>')).toBe("lucia.gomez@ejemplo.com.ar");
    expect(claveCorreo("sin correo")).toBeNull();
  });

  it("encuentra la referencia del caso en el texto o el asunto", () => {
    expect(referenciaCaso("Re: Tu seguro · Ref. C-123", "hola")).toBe(123);
    expect(referenciaCaso(null, "ok, C-7")).toBe(7);
    expect(referenciaCaso("ABC-123")).toBeNull();
  });

  it("sin IA clasifica con prudencia", () => {
    const hoy = "2026-11-02";
    expect(clasificarSinIA("Por favor no me escriban más", hoy)).toEqual({ tipo: "baja" });
    expect(clasificarSinIA("Ya lo pagué ayer por home banking", hoy)).toEqual({ tipo: "ya_pago" });
    expect(clasificarSinIA("Mañana lo transfiero, gracias", hoy)).toEqual({ tipo: "promesa_pago", fecha: "2026-11-03" });
    expect(clasificarSinIA("No voy a pagar más esto", hoy)).toEqual({ tipo: "rechazo" });
    expect(clasificarSinIA("¿Por qué aumentó la cuota?", hoy)).toEqual({ tipo: "respondio" });
    expect(clasificarSinIA("El viernes lo pago", hoy)).toEqual({ tipo: "respondio" });
  });
});
