import { describe, expect, it } from "vitest";
import type { PagoNormalizado } from "@/lib/conectores/tipos";
import {
  claveNumero,
  cuotasDeCancelacion,
  matchearPago,
  matchearPagos,
  mismoDocumento,
  mismoNombre,
  proponerCobros,
  type CobroCandidato,
  type ComprobanteParaMatch,
  type CuotaCartera,
} from "./matching";

const OPCIONES = { toleranciaMonto: 1 };

const cuota = (extra: Partial<CuotaCartera>): CuotaCartera => ({
  id: 1,
  compania: "Sancor",
  poliza: "664794781",
  item: null,
  endoso: null,
  numero: 4,
  cantidadCuotas: 12,
  cupon: null,
  monto: 1915.61,
  moneda: "ARS",
  vencimiento: "2026-10-29",
  pagada: false,
  cancelada: false,
  ...extra,
});

const pago = (extra: Partial<PagoNormalizado> = {}): PagoNormalizado => ({
  compania: "SANCOR SEGUROS",
  poliza: "0664794781",
  item: null,
  endoso: null,
  cuotaN: 4,
  cuotaTotal: 12,
  cupon: null,
  monto: 1915.61,
  moneda: "ARS",
  vencimiento: "2026-10-29",
  fechaPago: "2026-10-28",
  medio: "transferencia",
  estadoCompania: "pagada",
  ...extra,
});

describe("claveNumero", () => {
  it("ignora separadores, mayúsculas y ceros a la izquierda", () => {
    expect(claveNumero("001-0664794781")).toBe("10664794781");
    expect(claveNumero("0664794781")).toBe("664794781");
    expect(claveNumero("UY 41999728")).toBe("uy41999728");
    expect(claveNumero(null)).toBe("");
  });
});

describe("matchearPago", () => {
  it("coincidencia exacta y única → confirmado con la cuota", () => {
    const cuotas = [cuota({ id: 1, numero: 3, vencimiento: "2026-09-29" }), cuota({ id: 2 }), cuota({ id: 3, numero: 5, vencimiento: "2026-11-29" })];
    expect(matchearPago(pago(), cuotas, OPCIONES)).toMatchObject({ estado: "confirmado", cuotaId: 2, puntaje: 100 });
  });

  it("acepta la diferencia de monto dentro de la tolerancia, y no más", () => {
    expect(matchearPago(pago({ monto: 1916.5 }), [cuota({})], OPCIONES).estado).toBe("confirmado");
    const r = matchearPago(pago({ monto: 1900 }), [cuota({})], OPCIONES);
    expect(r).toMatchObject({ estado: "a_revisar", cuotaId: 1, puntaje: 80 });
    expect(r.motivo).toContain("$");
  });

  it("otra moneda nunca coincide", () => {
    const r = matchearPago(pago({ moneda: "USD" }), [cuota({})], OPCIONES);
    expect(r.estado).toBe("a_revisar");
    expect(r.puntaje).toBe(70);
    expect(r.motivo).toContain("USD");
  });

  it("vencimiento distinto → a revisar con el motivo", () => {
    const r = matchearPago(pago({ vencimiento: "2026-11-02" }), [cuota({})], OPCIONES);
    expect(r).toMatchObject({ estado: "a_revisar", cuotaId: 1, puntaje: 85 });
    expect(r.motivo).toContain("02/11/2026");
  });

  it("póliza de la cartera pero cuota que no está → a revisar con candidatos ordenados", () => {
    const cuotas = [cuota({ id: 1, numero: 3, vencimiento: "2026-09-29" }), cuota({ id: 2, numero: 5, vencimiento: "2026-11-29" })];
    const r = matchearPago(pago({ monto: 2000 }), cuotas, OPCIONES);
    expect(r.estado).toBe("a_revisar");
    expect(r.candidatos.map((c) => c.cuotaId)).toEqual([1, 2]);
    expect(r.cuotaId).toBeNull();
  });

  it("sin póliza ni cupón en la cartera → no identificado", () => {
    expect(matchearPago(pago({ poliza: "999" }), [cuota({})], OPCIONES)).toMatchObject({ estado: "no_identificado", cuotaId: null, candidatos: [] });
  });

  it("misma póliza en otra compañía no es candidata", () => {
    expect(matchearPago(pago({ compania: "Mapfre" }), [cuota({})], OPCIONES).estado).toBe("no_identificado");
  });

  it("el cupón identifica la cuota aunque la póliza venga escrita distinto", () => {
    const r = matchearPago(pago({ poliza: "664-794781/0", cupon: "29933892721" }), [cuota({ cupon: "29933892721" })], OPCIONES);
    expect(r.estado).toBe("confirmado");
  });

  describe("flotas", () => {
    const flota = [1, 2, 3].map((i) => cuota({ id: i, item: `Ítem ${i}`, monto: 1000 }));

    it("el ítem elige la cuota: 'Ítem 2' y '2' son el mismo", () => {
      expect(matchearPago(pago({ item: "2", monto: 1000 }), flota, OPCIONES)).toMatchObject({ estado: "confirmado", cuotaId: 2 });
    });

    it("sin ítem y con montos iguales → a revisar, sin elegir", () => {
      const r = matchearPago(pago({ monto: 1000 }), flota, OPCIONES);
      expect(r).toMatchObject({ estado: "a_revisar", cuotaId: null });
      expect(r.candidatos).toHaveLength(3);
    });

    it("un pago por toda la flota → a revisar como pago agrupado", () => {
      const r = matchearPago(pago({ monto: 3000 }), flota, OPCIONES);
      expect(r.estado).toBe("a_revisar");
      expect(r.motivo).toContain("pago agrupado");
      expect(r.candidatos.map((c) => c.cuotaId)).toEqual([1, 2, 3]);
    });

    it("un ítem que no está en la cartera → no identificado", () => {
      expect(matchearPago(pago({ item: "4", monto: 1000 }), flota, OPCIONES).estado).toBe("no_identificado");
    });
  });
});

describe("matchearPagos", () => {
  it("dos filas para la misma cuota: la segunda queda a revisar", () => {
    const [a, b] = matchearPagos([pago(), pago()], [cuota({})], OPCIONES);
    expect(a.estado).toBe("confirmado");
    expect(b).toMatchObject({ estado: "a_revisar", cuotaId: 1 });
  });
});

describe("cuotasDeCancelacion", () => {
  it("cancela las impagas de la póliza (o del ítem) y deja las pagadas", () => {
    const cuotas = [
      cuota({ id: 1, numero: 1, pagada: true }),
      cuota({ id: 2, numero: 2 }),
      cuota({ id: 3, numero: 3, cancelada: true }),
      cuota({ id: 4, numero: 4, item: "2" }),
      cuota({ id: 5, poliza: "otra" }),
    ];
    const cancelacion = { compania: "Sancor", poliza: "664794781", item: null, fecha: "2026-10-29", motivo: "falta_de_pago" as const };
    expect(cuotasDeCancelacion(cancelacion, cuotas)).toEqual({ cuotaIds: [2, 4], motivo: "Anulación por falta de pago." });
    expect(cuotasDeCancelacion({ ...cancelacion, item: "Ítem 2" }, cuotas).cuotaIds).toEqual([4]);
  });
});

describe("comprobantes", () => {
  const cobro = (extra: Partial<CobroCandidato>): CobroCandidato => ({
    cuotaIds: [1],
    asegurado: "García, Juan",
    documento: "20-12345678-3",
    compania: "Sancor",
    polizas: ["664794781"],
    cupones: [],
    monto: 1915.61,
    moneda: "ARS",
    vencimiento: "2026-10-29",
    ...extra,
  });
  const comprobante = (extra: Partial<ComprobanteParaMatch> = {}): ComprobanteParaMatch => ({
    monto: 1915.61,
    moneda: "ARS",
    fecha: "2026-10-28",
    referencia: "Pago póliza 664794781",
    pagador: "JUAN GARCIA",
    documentoPagador: null,
    compania: "Sancor",
    ...extra,
  });

  it("propone el cobro correcto con su puntaje y nunca lo confirma solo", () => {
    const cobros = [cobro({}), cobro({ cuotaIds: [7], asegurado: "Pérez, Ana", documento: null, polizas: ["111222333"], monto: 5000 })];
    const r = proponerCobros(comprobante(), cobros, OPCIONES);
    expect(r.estado).toBe("a_revisar");
    expect(r.candidatos).toHaveLength(1);
    expect(r.candidatos[0]).toMatchObject({ cuotaId: 1, cuotaIds: [1], puntaje: 95 });
  });

  it("ordena por puntaje: gana el que además coincide en el nombre", () => {
    const cobros = [cobro({ cuotaIds: [5], asegurado: "Pérez, Ana", documento: null, polizas: ["111222333"] }), cobro({ cuotaIds: [9], polizas: ["555666777"] })];
    const r = proponerCobros(comprobante({ referencia: null }), cobros, OPCIONES);
    expect(r.candidatos.map((c) => c.cuotaId)).toEqual([9, 5]);
  });

  it("un cobro de varias cuotas se propone entero", () => {
    const r = proponerCobros(comprobante({ monto: 3000 }), [cobro({ cuotaIds: [3, 4], monto: 3000 })], OPCIONES);
    expect(r.candidatos[0].cuotaIds).toEqual([3, 4]);
  });

  it("otra moneda no se propone; sin datos que coincidan, no identificado", () => {
    expect(proponerCobros(comprobante({ moneda: "USD" }), [cobro({})], OPCIONES).estado).toBe("no_identificado");
    const nada = comprobante({ monto: 99, referencia: null, pagador: "Otra Persona", compania: null, fecha: null });
    expect(proponerCobros(nada, [cobro({})], OPCIONES)).toMatchObject({ estado: "no_identificado", candidatos: [] });
  });

  it("el documento del pagador suma más que el nombre", () => {
    const [porDocumento] = proponerCobros(comprobante({ pagador: null, documentoPagador: "12.345.678", referencia: null }), [cobro({})], OPCIONES).candidatos;
    const [porNombre] = proponerCobros(comprobante({ referencia: null }), [cobro({})], OPCIONES).candidatos;
    expect(porDocumento.puntaje).toBeGreaterThan(porNombre.puntaje);
  });
});

describe("mismoNombre y mismoDocumento", () => {
  it("reconoce nombres en otro orden y sin tildes, pero no a un pariente", () => {
    expect(mismoNombre("García, Juan", "JUAN GARCIA")).toBe(true);
    expect(mismoNombre("Transportes del Sur S.R.L.", "TRANSPORTES SUR SRL")).toBe(true);
    expect(mismoNombre("García, Juan", "María García")).toBe(false);
  });

  it("el CUIL contiene al DNI, también con 7 dígitos", () => {
    expect(mismoDocumento("20-12345678-3", "12.345.678")).toBe(true);
    expect(mismoDocumento("20-07123456-3", "7.123.456")).toBe(true);
    expect(mismoDocumento("20-12345678-3", "12.345.679")).toBe(false);
    expect(mismoDocumento("123", "123")).toBe(false);
  });
});
