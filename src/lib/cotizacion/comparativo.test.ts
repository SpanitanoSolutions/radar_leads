import { describe, expect, it } from "vitest";
import {
  coberturasManuales,
  coberturasPorFila,
  envioConMejorPrecio,
  filasComparativo,
  unirCoberturasManuales,
  type ResultadoComparativo,
} from "./comparativo";

const resultado = (cambios: Partial<ResultadoComparativo>): ResultadoComparativo => ({
  envioId: 1, primaNeta: null, primaTotal: 100000, gastos: 0, impuestos: 0, moneda: "ARS", franquicia: null,
  sumaAsegurada: null, vigencia: null, condiciones: null, coberturas: [], confirmado: true, ...cambios,
});

describe("coberturas en las filas de la spec", () => {
  it("cada cobertura va a las filas que nombra, sin inferir; lo demás va a Otras", () => {
    expect(coberturasPorFila([
      { nombre: "RC, robo e incendio total", incluida: true },
      { nombre: "Todo riesgo con franquicia", valor: "Franquicia $ 350.000", incluida: true },
      { nombre: "Cristales", valor: "Hasta $ 300.000" },
      { nombre: "Grúa y asistencia mecánica" },
      { nombre: "Terceros completo", incluida: true },
      { nombre: "Granizo", incluida: false },
    ])).toEqual({
      danos: "Todo riesgo con franquicia: Franquicia $ 350.000",
      robo: "RC, robo e incendio total",
      cristales: "Hasta $ 300.000",
      rc: "RC, robo e incendio total",
      servicios: "Grúa y asistencia mecánica",
      otras: "Terceros completo; Granizo: No incluye",
    });
  });

  it("una cobertura que se llama como la fila muestra su valor, o si está incluida", () => {
    expect(coberturasPorFila([{ nombre: "Daños" }, { nombre: "Robo", valor: "Total y parcial" }, { nombre: "Responsabilidad civil", incluida: false }]))
      .toMatchObject({ danos: "Incluida", robo: "Total y parcial", rc: "No incluye", cristales: null, otras: null });
  });

  it("la carga manual reemplaza solo las filas y conserva lo que trajo la compañía", () => {
    const existentes = [{ nombre: "Terceros completo", incluida: true }, { nombre: "Cristales", valor: "Hasta $ 100.000" }, { nombre: "Daños", valor: "Viejo" }];
    expect(coberturasManuales(existentes)).toEqual({ danos: "Viejo", robo: "", cristales: "Hasta $ 100.000", rc: "", servicios: "" });
    expect(unirCoberturasManuales(existentes, { cristales: "Hasta $ 300.000", servicios: " Grúa 300 km ", danos: "" })).toEqual([
      { nombre: "Terceros completo", incluida: true },
      { nombre: "Cristales", valor: "Hasta $ 300.000" },
      { nombre: "Servicios", valor: "Grúa 300 km" },
    ]);
  });
});

describe("filas del comparativo", () => {
  const sancor = resultado({
    envioId: 1, primaNeta: 800000, primaTotal: 912000, gastos: 12000, impuestos: 100000, franquicia: "$ 350.000",
    sumaAsegurada: 18000000, vigencia: "01/11/2026 al 01/11/2027", condiciones: "Pago mensual",
    coberturas: [{ nombre: "Cristales", valor: "Hasta $ 300.000" }, { nombre: "Terceros completo" }],
  });

  it("la detallada tiene las filas de la spec, con una celda por compañía (vacía si no respondió)", () => {
    const filas = filasComparativo([sancor, undefined], "detallada");
    expect(filas.map((fila) => fila.etiqueta)).toEqual([
      "Prima neta", "Gastos", "Impuestos", "Franquicia", "Suma asegurada o límite", "Vigencia", "Condiciones",
      "Daños", "Robo", "Cristales", "Responsabilidad civil", "Servicios", "Otras coberturas",
    ]);
    const celdas = Object.fromEntries(filas.map((fila) => [fila.id, fila.celdas]));
    expect(celdas.gastos[0]).toMatch(/^\$\s?12\.000$/);
    expect(celdas.impuestos[0]).toMatch(/^\$\s?100\.000$/);
    expect(celdas.cristales).toEqual(["Hasta $ 300.000", null]);
    expect(celdas.danos).toEqual([null, null]);
    expect(celdas.otras).toEqual(["Terceros completo", null]);
  });

  it("gastos e impuestos en 0 cuentan como no informados; sin otras coberturas, la fila no aparece", () => {
    const filas = filasComparativo([resultado({ coberturas: [{ nombre: "Robo" }] })], "detallada");
    const celdas = Object.fromEntries(filas.map((fila) => [fila.id, fila.celdas]));
    expect(celdas.gastos).toEqual([null]);
    expect(celdas.impuestos).toEqual([null]);
    expect(celdas.otras).toBeUndefined();
  });

  it("la compacta deja la prima neta y la franquicia", () => {
    expect(filasComparativo([sancor], "compacta").map((fila) => fila.etiqueta)).toEqual(["Prima neta", "Franquicia"]);
  });

  it("los montos en dólares van en dólares", () => {
    const [primaNeta] = filasComparativo([resultado({ primaNeta: 1500, moneda: "USD" })], "compacta");
    expect(primaNeta.celdas).toEqual(["US$ 1.500"]);
  });

  it("“Mejor precio” solo entre las confirmadas, aunque una sin confirmar sea más barata", () => {
    expect(envioConMejorPrecio([
      resultado({ envioId: 1, primaTotal: 912000 }),
      resultado({ envioId: 2, primaTotal: 700000, confirmado: false }),
      undefined,
      resultado({ envioId: 4, primaTotal: 950000 }),
    ])).toBe(1);
    expect(envioConMejorPrecio([resultado({ envioId: 2, confirmado: false })])).toBeNull();
  });
});
