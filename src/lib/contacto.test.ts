import { describe, expect, it } from "vitest";
import { busquedaManual, dominioDe, enlaceTelefono, enlaceWhatsApp, numeroWhatsApp, sinContacto } from "./contacto";

describe("WhatsApp solo para celulares", () => {
  it("reconoce el formato internacional de un celular (+54 9)", () => {
    expect(numeroWhatsApp("+54 9 223 555-1234")).toBe("5492235551234");
    expect(numeroWhatsApp("+54 9 11 5555-1234")).toBe("5491155551234");
  });

  it("convierte el formato local con 15 (característica de 2, 3 o 4 dígitos)", () => {
    expect(numeroWhatsApp("(0223) 15-555-1234")).toBe("5492235551234");
    expect(numeroWhatsApp("011 15 5555 1234")).toBe("5491155551234");
    expect(numeroWhatsApp("02254 15 41-2345")).toBe("5492254412345");
  });

  it("un fijo no es WhatsApp", () => {
    expect(numeroWhatsApp("+54 223 495-1234")).toBeNull();
    expect(numeroWhatsApp("(0223) 495-1234")).toBeNull();
    expect(numeroWhatsApp("0800 333 2626")).toBeNull();
  });

  it("arma el enlace con el mensaje ya escrito", () => {
    expect(enlaceWhatsApp("+54 9 223 555-1234", "Buen día, ¿cómo le va?")).toBe(
      "https://wa.me/5492235551234?text=Buen%20d%C3%ADa%2C%20%C2%BFc%C3%B3mo%20le%20va%3F",
    );
    expect(enlaceWhatsApp("(0223) 495-1234", "hola")).toBeNull();
  });
});

describe("contacto", () => {
  it("tel: sin espacios ni guiones", () => {
    expect(enlaceTelefono("(0223) 495-1234")).toBe("tel:02234951234");
    expect(enlaceTelefono("+54 9 223 555-1234")).toBe("tel:+5492235551234");
  });

  it("sin contacto: se buscó en Google sin resultado y no hay teléfono por otra vía", () => {
    expect(sinContacto({ contactoEstado: "sin-resultado", telefono: null })).toBe(true);
    expect(sinContacto({ contactoEstado: "sin-resultado", telefono: "0223 495-1234" })).toBe(false);
    expect(sinContacto({ contactoEstado: null, telefono: null })).toBe(false); // todavía no se buscó
    expect(sinContacto({ contactoEstado: "posible", telefono: null })).toBe(false);
  });

  it("búsqueda manual y dominio de la web", () => {
    expect(busquedaManual("Gobblack SA", "Mar del Plata")).toBe(
      "https://www.google.com/search?q=%22Gobblack%20SA%22%20Mar%20del%20Plata%20tel%C3%A9fono",
    );
    expect(dominioDe("https://www.senderos.com.ar/contacto")).toBe("senderos.com.ar");
    expect(dominioDe("no es una url")).toBe("no es una url");
  });
});
