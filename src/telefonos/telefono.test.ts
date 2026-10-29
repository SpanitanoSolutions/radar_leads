import { describe, expect, it } from "vitest";
import { busquedaApagada, claveEmpresa, consultaTelefono, interpretarRegistro, limpiarTelefono } from "./telefono";

describe("busquedaApagada", () => {
  it("con la clave sola no arranca: hay que prenderla con TELEFONOS_IA=1", () => {
    expect(busquedaApagada({})).toMatch(/ANTHROPIC_API_KEY/);
    expect(busquedaApagada({ ANTHROPIC_API_KEY: "clave" })).toMatch(/TELEFONOS_IA/);
    expect(busquedaApagada({ ANTHROPIC_API_KEY: "clave", TELEFONOS_IA: "0" })).toMatch(/TELEFONOS_IA/);
    expect(busquedaApagada({ ANTHROPIC_API_KEY: "clave", TELEFONOS_IA: "1" })).toBeNull();
  });
});

describe("limpiarTelefono", () => {
  it("acepta los formatos con que las empresas publican sus teléfonos", () => {
    expect(limpiarTelefono("(0223) 495-1234")).toBe("(0223) 495-1234");
    expect(limpiarTelefono("+54 9 223 555-1234")).toBe("+54 9 223 555-1234");
    expect(limpiarTelefono("0800.333.2626")).toBe("0800 333 2626");
    expect(limpiarTelefono("  223  4951234 ")).toBe("223 4951234");
  });

  it("rechaza lo que no es un teléfono, incluido un CUIT", () => {
    expect(limpiarTelefono("30-71222454-8")).toBeNull();
    expect(limpiarTelefono("495-123")).toBeNull();
    expect(limpiarTelefono("ventas@empresa.com.ar")).toBeNull();
    expect(limpiarTelefono("")).toBeNull();
  });
});

describe("interpretarRegistro", () => {
  it("devuelve el teléfono con la página donde la empresa lo publica", () => {
    expect(
      interpretarRegistro({
        telefono: "(0223) 495-1234",
        tipo: "comercial",
        fuente_url: "https://www.senderosdelacosta.com.ar/contacto",
      }),
    ).toEqual({
      telefono: "(0223) 495-1234",
      tipo: "comercial",
      fuenteUrl: "https://www.senderosdelacosta.com.ar/contacto",
    });
  });

  it("no acepta números sin una página que los respalde ni resultados vacíos", () => {
    expect(interpretarRegistro({ telefono: "", tipo: "no_encontrado", fuente_url: "" })).toBeNull();
    expect(interpretarRegistro({ telefono: "(0223) 495-1234", tipo: "general", fuente_url: "" })).toBeNull();
    expect(interpretarRegistro({ telefono: "(0223) 495-1234", tipo: "general", fuente_url: "javascript:alert(1)" })).toBeNull();
    expect(interpretarRegistro({ telefono: "30-71222454-8", tipo: "general", fuente_url: "https://x.com.ar" })).toBeNull();
    expect(interpretarRegistro(null)).toBeNull();
  });
});

describe("claveEmpresa", () => {
  it("agrupa por CUIT, o por nombre y localidad si no hay CUIT", () => {
    expect(claveEmpresa({ empresa: "Ingenieros Electronicos Asociados S.R.L.", cuit: "30-12345678-9", localidad: "X" })).toBe(
      "cuit:30123456789",
    );
    expect(claveEmpresa({ empresa: "Gobblack SA", cuit: null, localidad: "Mar del Plata" })).toBe(
      claveEmpresa({ empresa: "GOBBLACK SA", cuit: null, localidad: "MAR DEL PLATA" }),
    );
  });
});

describe("consultaTelefono", () => {
  it("le da a Claude los datos para identificar a la empresa", () => {
    expect(
      consultaTelefono({ empresa: "Gobblack SA", cuit: null, localidad: "Mar del Plata", rubro: "Transporte y logística" }),
    ).toBe(
      "Empresa: Gobblack SA\nLocalidad: Mar del Plata, provincia de Buenos Aires\nRubro: Transporte y logística\n\n" +
        "Encontrá su teléfono de contacto y registralo con registrar_telefono.",
    );
  });
});
