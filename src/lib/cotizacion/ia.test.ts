import { describe, expect, it } from "vitest";
import { pesos } from "@/lib/formato";
import { cuerpoVerificado, esquemaRespuestaCompaniaIA, estrategiaVerificada, mensajeEstrategia, respuestaLeida, resumenLectura, textoDeChat, type RespuestaCompaniaIA } from "./ia";

const LEIDA: RespuestaCompaniaIA = {
  primaTotal: 912000.456,
  primaNeta: 760000,
  gastos: 52000,
  impuestos: 100000,
  franquicia: "  $ 350.000 ",
  sumaAsegurada: 18000000,
  vigencia: "Anual",
  condiciones: null,
  coberturas: [{ nombre: "Todo riesgo", valor: "Franquicia $ 350.000" }, { nombre: "  ", valor: "x" }, { nombre: "Granizo", valor: null }],
  riesgoCotizado: { cuitCuil: "30-71234567-8", marca: "Toyota", modelo: " ", anio: "2024", codigoPostal: null },
};

describe("respuestaLeida", () => {
  it("verifica los montos, limpia los textos y deja solo los datos del riesgo que vinieron", () => {
    expect(respuestaLeida(LEIDA)).toEqual({
      precio: 912000.46,
      primaNeta: 760000,
      gastos: 52000,
      impuestos: 100000,
      franquicia: "$ 350.000",
      sumaAsegurada: 18000000,
      vigencia: "Anual",
      condiciones: null,
      coberturas: [{ nombre: "Todo riesgo", valor: "Franquicia $ 350.000" }, { nombre: "Granizo" }],
      riesgoCotizado: { cuitCuil: "30-71234567-8", marca: "Toyota", anio: "2024" },
    });
  });

  it("sin una prima total positiva no hay respuesta para el comparativo", () => {
    expect(respuestaLeida({ ...LEIDA, primaTotal: null })).toBeNull();
    expect(respuestaLeida({ ...LEIDA, primaTotal: 0 })).toBeNull();
    expect(respuestaLeida({ ...LEIDA, primaTotal: -5 })).toBeNull();
  });

  it("los montos que no son positivos quedan vacíos (gastos e impuestos en cero)", () => {
    const leida = respuestaLeida({ ...LEIDA, primaNeta: -1, gastos: null, impuestos: Number.NaN, sumaAsegurada: 0 });
    expect(leida).toMatchObject({ primaNeta: null, gastos: 0, impuestos: 0, sumaAsegurada: null });
  });

  it("el esquema rechaza una salida sin los campos pedidos", () => {
    expect(esquemaRespuestaCompaniaIA.safeParse({ primaTotal: 1 }).success).toBe(false);
    expect(esquemaRespuestaCompaniaIA.safeParse(LEIDA).success).toBe(true);
  });
});

describe("resumenLectura", () => {
  it("resume lo leído para revisarlo, sin las líneas vacías", () => {
    const resumen = resumenLectura("Sancor", respuestaLeida(LEIDA));
    expect(resumen.split("\n")).toEqual([
      "Respuesta de Sancor (falta tu confirmación)",
      `Prima total: ${pesos(912000.46)}`,
      `Prima neta: ${pesos(760000)}`,
      `Gastos: ${pesos(52000)}`,
      `Impuestos: ${pesos(100000)}`,
      `Suma asegurada: ${pesos(18000000)}`,
      "Franquicia: $ 350.000",
      "Vigencia: Anual",
      "Coberturas: Todo riesgo (Franquicia $ 350.000); Granizo",
    ]);
  });

  it("sin prima total, pide cargarla a mano", () => {
    expect(resumenLectura("Mapfre", null)).toBe("La IA leyó el PDF de Mapfre, pero no encontró la prima total. Cargá la respuesta a mano.");
  });
});

describe("cuerpoVerificado", () => {
  it("un cuerpo vacío no reemplaza al borrador", () => {
    expect(cuerpoVerificado("   ")).toBeNull();
    expect(cuerpoVerificado("  Buenos días.  ")).toBe("Buenos días.");
  });
});

describe("textoDeChat", () => {
  it("suma lo que falta al final de la respuesta", () => {
    expect(textoDeChat({ respuesta: "Sancor es la más barata confirmada.", faltan: ["La respuesta de Mapfre", " "] }))
      .toBe("Sancor es la más barata confirmada.\n\nPara completar falta:\n- La respuesta de Mapfre");
  });

  it("sin faltantes devuelve solo la respuesta, y sin respuesta, nada", () => {
    expect(textoDeChat({ respuesta: "Listo.", faltan: [] })).toBe("Listo.");
    expect(textoDeChat({ respuesta: " ", faltan: ["algo"] })).toBeNull();
  });
});

describe("Sugerir con IA la estrategia de seguimiento", () => {
  it("lo que propone la IA pasa por el parser: si el agente lo entiende, vuelve limpio y explicado", () => {
    expect(estrategiaVerificada("  Cada 3 días hábiles;\n para Flotas cada 1 día hábil; si la aseguradora ya dio un folio, esperar la cotización. ")).toEqual({
      estrategia: "Cada 3 días hábiles; para Flotas cada 1 día hábil; si la aseguradora ya dio un folio, esperar la cotización.",
      descripcion: "Seguimiento cada 3 días hábiles. Flotas: cada 1 día hábil. Si la compañía ya dio un folio, espera la cotización.",
    });
  });

  it("si el agente no la entiende, no se ofrece", () => {
    expect(estrategiaVerificada("Escribirles cuando parezca oportuno.")).toBeNull();
    expect(estrategiaVerificada("cada dos días hábiles")).toBeNull();
    expect(estrategiaVerificada("   ")).toBeNull();
  });

  it("el pedido lleva los ramos, el máximo, la estrategia actual y lo que pide el productor, recortado", () => {
    const mensaje = mensajeEstrategia({ ramos: ["Automotor", "Flotas"], maximo: 3, actual: "Cada 3 días hábiles", pedido: "x".repeat(900) });
    expect(mensaje).toContain("Ramos que vende: Automotor, Flotas.");
    expect(mensaje).toContain("Máximo de seguimientos por compañía: 3.");
    expect(mensaje).toContain("Estrategia actual: Cada 3 días hábiles");
    expect(mensaje.split("\n")[3]).toHaveLength("Lo que pide el productor: ".length + 500);
  });
});
