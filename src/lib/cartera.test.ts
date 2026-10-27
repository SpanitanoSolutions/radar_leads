import { describe, expect, it } from "vitest";
import { cuitsDeClientes, proximosVencimientos, yaEsCliente, type Poliza } from "./cartera";

// Pólizas inventadas, una fila por póliza como las arma obtenerCartera().
const POLIZAS: Poliza[] = [
  { cliente: "Transportes Ejemplo SRL", cuit: "30-11111111-1", ramos: ["Flota"], compania: "Compañía A", vencimiento: "2026-11-15" },
  { cliente: "Transportes Ejemplo SRL", cuit: "30-11111111-1", ramos: ["ART"], compania: "Compañía B", vencimiento: "2027-03-01" },
  { cliente: "Cliente Uno", cuit: "20-00000000-1", ramos: ["Auto"], compania: "Compañía A", vencimiento: "2026-10-30" },
  { cliente: "Comercio Ejemplo SA", cuit: null, ramos: ["Integral de comercio"], compania: null, vencimiento: null },
];

describe("cartera guardada", () => {
  it("vencimientos próximos para el resumen: dentro del plazo, el más cercano primero", () => {
    expect(proximosVencimientos(POLIZAS, "2026-10-22", 30).map((p) => [p.cliente, p.dias])).toEqual([
      ["Cliente Uno", 8],
      ["Transportes Ejemplo SRL", 24],
    ]);
    expect(proximosVencimientos(POLIZAS, "2026-10-22", 5)).toEqual([]);
  });

  it("reconoce los leads que ya son clientes por CUIT, con o sin guiones", () => {
    const clientes = cuitsDeClientes(POLIZAS);
    expect(yaEsCliente("30-11111111-1", clientes)).toBe(true);
    expect(yaEsCliente("30111111111", clientes)).toBe(true);
    expect(yaEsCliente("30-99999999-9", clientes)).toBe(false);
    expect(yaEsCliente(null, clientes)).toBe(false);
  });
});
