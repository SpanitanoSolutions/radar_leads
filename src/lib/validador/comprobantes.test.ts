import { describe, expect, it } from "vitest";
import type { CuentaCompania } from "@/db/schema";
import { cobrosParaComprobante, companiaDeDestino, comprobanteParaMatch, verificarExtraccion, type ComprobanteExtraido, type CuotaAbierta } from "./comprobantes";
import { proponerCobros } from "./matching";

const leido = (extra: Partial<ComprobanteExtraido> = {}): ComprobanteExtraido => ({
  monto: 52300,
  moneda: "ARS",
  fecha: "2026-10-28",
  medio: "Transferencia · Banco Nación",
  numeroOperacion: "000123456",
  referencia: "Poliza 88-322019",
  pagador: "GARCIA JUAN",
  documentoPagador: "20-12345678-3",
  destinoTitular: "Sancor Cooperativa de Seguros",
  destinoCuenta: "sancor.seguros",
  ...extra,
});

const CUENTAS = new Map<string, CuentaCompania[]>([
  ["Sancor", [{ titular: "Sancor Cooperativa de Seguros", alias: "sancor.seguros" }]],
  ["Mapfre", [{ titular: "Mapfre Argentina Seguros", alias: "mapfre.cobranzas" }]],
]);

const cuota = (extra: Partial<CuotaAbierta>): CuotaAbierta => ({
  id: 1,
  aseguradoId: 1,
  asegurado: "Juan García",
  documento: "12345678",
  compania: "Sancor",
  poliza: "88-322019",
  cupon: null,
  monto: 52300,
  moneda: "ARS",
  vencimiento: "2026-11-05",
  ...extra,
});

describe("comprobantes", () => {
  it("verifica lo que leyó la IA: fechas que existen y montos positivos", () => {
    expect(verificarExtraccion(leido({ fecha: "2026-02-31", monto: -5, medio: "  Rapipago  " }))).toMatchObject({ fecha: null, monto: null, medio: "Rapipago" });
    expect(verificarExtraccion(leido({ fecha: "28/10/2026", monto: 52300.004 }))).toMatchObject({ fecha: "2026-10-28", monto: 52300 });
  });

  it("reconoce la compañía por la cuenta de destino, solo si es una", () => {
    expect(companiaDeDestino(["Sancor Cooperativa de Seguros", null], CUENTAS)).toBe("Sancor");
    expect(companiaDeDestino(["mapfre.cobranzas"], CUENTAS)).toBe("Mapfre");
    expect(companiaDeDestino(["Juan Pérez"], CUENTAS)).toBeNull();
    expect(companiaDeDestino([null], CUENTAS)).toBeNull();
  });

  it("criterio 5: propone el cobro correcto con su puntaje y no lo da por pagado", () => {
    const cobros = cobrosParaComprobante([
      cuota({ id: 1 }),
      cuota({ id: 2, aseguradoId: 2, asegurado: "María López", documento: "30111222", poliza: "77-1", monto: 52300 }),
      cuota({ id: 3, aseguradoId: 3, asegurado: "Pedro Díaz", documento: "28999888", poliza: "77-2", monto: 18000, compania: "Mapfre" }),
    ]);
    const datos = verificarExtraccion(leido());
    const propuesta = proponerCobros(comprobanteParaMatch(datos, companiaDeDestino([datos.destinoTitular, datos.destinoCuenta], CUENTAS)), cobros, { toleranciaMonto: 1 });
    expect(propuesta.estado).toBe("a_revisar");
    expect(propuesta.candidatos[0]).toMatchObject({ cuotaIds: [1], puntaje: 100 });
    // El otro cobro del mismo monto queda atrás: no tiene la póliza ni el pagador.
    expect(propuesta.candidatos[1]).toMatchObject({ cuotaIds: [2] });
    expect(propuesta.candidatos[1].puntaje).toBeLessThan(100);
  });

  it("junta las cuotas que se pagan juntas, sin mezclar monedas", () => {
    const cobros = cobrosParaComprobante([
      cuota({ id: 1, poliza: "A", monto: 100 }),
      cuota({ id: 2, poliza: "B", monto: 50.5, cupon: "999" }),
      cuota({ id: 3, poliza: "C", monto: 20, moneda: "USD" }),
    ]);
    expect(cobros).toEqual([
      expect.objectContaining({ cuotaIds: [1, 2], polizas: ["A", "B"], cupones: ["999"], monto: 150.5, moneda: "ARS" }),
      expect.objectContaining({ cuotaIds: [3], monto: 20, moneda: "USD" }),
    ]);
  });
});
