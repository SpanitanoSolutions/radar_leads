import { describe, expect, it } from "vitest";
import { sumarDias } from "@/lib/fechas";
import { bloqueDe, calcularEstado, cambioPorInforme, totalesPorBloque, totalizar, type CuotaActual } from "./estados";
import { resolverGracia } from "./gracia";

const HOY = "2026-10-29";
const cuota = (extra: Partial<Parameters<typeof calcularEstado>[0]> = {}) => ({ numero: 1, vencimiento: HOY, pagada: false, cancelada: false, ...extra });
const GRACIA = { diasPrimera: 15, diasSiguientes: 0 };

describe("calcularEstado", () => {
  it("criterio 1: automotor que vence hoy con 15 días de gracia en la 1.ª cuota → Esta semana, y Vencidos recién el día 16", () => {
    const gracia = resolverGracia(
      [{ compania: "Sancor", ramo: "Auto", diasPrimera: 15, diasSiguientes: 0, habilitado: true, orgId: null, producerId: null }],
      { compania: "Sancor", ramo: "Automotor", orgId: null, producerId: null },
    );
    const el = (dia: number) => calcularEstado(cuota(), { hoy: sumarDias(HOY, dia), gracia });
    expect(bloqueDe(el(0).estado)).toBe("semana");
    for (let dia = 1; dia <= 15; dia++) expect(bloqueDe(el(dia).estado)).not.toBe("vencidos");
    expect(el(15)).toMatchObject({ estado: "por_vencer", enGracia: true, finDeGracia: sumarDias(HOY, 15) });
    expect(el(16)).toMatchObject({ estado: "vencida", enGracia: false });
    expect(bloqueDe(el(16).estado)).toBe("vencidos");
  });

  it("criterio 2: la 1.ª cuota y una siguiente de la misma compañía y ramo usan cada una su gracia", () => {
    const hoy = sumarDias(HOY, 5);
    expect(calcularEstado(cuota({ numero: 1 }), { hoy, gracia: GRACIA }).estado).toBe("por_vencer");
    expect(calcularEstado(cuota({ numero: 2 }), { hoy, gracia: GRACIA }).estado).toBe("vencida");
  });

  it("sin gracia, vence hoy está por vencer y mañana ya está vencida", () => {
    const gracia = { diasPrimera: 0, diasSiguientes: 0 };
    expect(calcularEstado(cuota(), { hoy: HOY, gracia }).estado).toBe("por_vencer");
    expect(calcularEstado(cuota(), { hoy: sumarDias(HOY, 1), gracia }).estado).toBe("vencida");
  });

  it("por vencer hasta el domingo de la semana calendario; desde el lunes siguiente, pendiente", () => {
    const sin = { diasPrimera: 0, diasSiguientes: 0 };
    // HOY es jueves 29/10: la semana termina el domingo 1/11.
    expect(calcularEstado(cuota({ vencimiento: "2026-11-01" }), { hoy: HOY, gracia: sin })).toMatchObject({ estado: "por_vencer", diasParaVencer: 3 });
    expect(calcularEstado(cuota({ vencimiento: "2026-11-02" }), { hoy: HOY, gracia: sin })).toMatchObject({ estado: "pendiente", diasParaVencer: 4 });
    // El lunes, toda la semana hasta el domingo está por vencer; el domingo, el lunes que viene ya no.
    expect(calcularEstado(cuota({ vencimiento: "2026-11-08" }), { hoy: "2026-11-02", gracia: sin }).estado).toBe("por_vencer");
    expect(calcularEstado(cuota({ vencimiento: "2026-11-02" }), { hoy: "2026-11-01", gracia: sin }).estado).toBe("pendiente");
  });

  it("pagada y cancelada ganan sobre el vencimiento, y pagada gana sobre cancelada", () => {
    const vencida = { hoy: sumarDias(HOY, 60), gracia: GRACIA };
    expect(calcularEstado(cuota({ pagada: true }), vencida).estado).toBe("pagada");
    expect(calcularEstado(cuota({ cancelada: true }), vencida).estado).toBe("cancelada");
    expect(calcularEstado(cuota({ pagada: true, cancelada: true }), vencida).estado).toBe("pagada");
  });
});

describe("totales", () => {
  it("nunca suman ARS con USD: una línea por moneda, pesos primero", () => {
    const total = totalizar([
      { monto: 100, moneda: "USD", aseguradoId: 1 },
      { monto: 1915.61, moneda: "ARS", aseguradoId: 1 },
      { monto: 84.39, moneda: "ARS", aseguradoId: 2 },
    ]);
    expect(total).toEqual({ montos: [{ moneda: "ARS", monto: 2000 }, { moneda: "USD", monto: 100 }], pagos: 3, asegurados: 2 });
  });

  it("sin cuotas no hay líneas", () => {
    expect(totalizar([])).toEqual({ montos: [], pagos: 0, asegurados: 0 });
  });

  it("reparte en Esta semana, Próximos y Vencidos; pagadas y canceladas no cuentan", () => {
    const t = totalesPorBloque([
      { estado: "por_vencer", monto: 10, moneda: "ARS", aseguradoId: 1 },
      { estado: "pendiente", monto: 20, moneda: "USD", aseguradoId: 2 },
      { estado: "vencida", monto: 30, moneda: "ARS", aseguradoId: 3 },
      { estado: "pagada", monto: 40, moneda: "ARS", aseguradoId: 4 },
      { estado: "cancelada", monto: 50, moneda: "ARS", aseguradoId: 5 },
    ]);
    expect(t.semana.montos).toEqual([{ moneda: "ARS", monto: 10 }]);
    expect(t.proximos.montos).toEqual([{ moneda: "USD", monto: 20 }]);
    expect(t.vencidos.montos).toEqual([{ moneda: "ARS", monto: 30 }]);
  });
});

describe("cambioPorInforme", () => {
  const impaga: CuotaActual = { pagada: false, cancelada: false, origenConfirmacion: null };
  const informe = (estadoCompania: "pendiente" | "pagada" | "vencida" | "anulada") => ({ estadoCompania, fechaPago: estadoCompania === "pagada" ? "2026-10-27" : null, medio: null });

  it("la compañía informa pagada una impaga → se marca pagada con su fecha", () => {
    expect(cambioPorInforme(impaga, informe("pagada"))).toEqual({ tipo: "marcar_pagada", fechaPago: "2026-10-27", medio: null });
  });

  it("reimportar lo mismo no cambia nada", () => {
    expect(cambioPorInforme({ ...impaga, pagada: true, origenConfirmacion: "listado" }, informe("pagada")).tipo).toBe("sin_cambios");
    expect(cambioPorInforme({ ...impaga, cancelada: true }, informe("anulada")).tipo).toBe("sin_cambios");
  });

  it("anulada → cancelada; pero si estaba pagada queda a revisar", () => {
    expect(cambioPorInforme(impaga, informe("anulada")).tipo).toBe("marcar_cancelada");
    expect(cambioPorInforme({ ...impaga, pagada: true }, informe("anulada")).tipo).toBe("a_revisar");
  });

  it("una pagada según la compañía que vuelve a impaga queda a revisar", () => {
    expect(cambioPorInforme({ pagada: true, cancelada: false, origenConfirmacion: "listado" }, informe("pendiente")).tipo).toBe("a_revisar");
    expect(cambioPorInforme({ pagada: true, cancelada: false, origenConfirmacion: "portal" }, informe("vencida")).tipo).toBe("a_revisar");
  });

  it("una pagada confirmada en UNIQO que la compañía todavía no registra no se toca", () => {
    for (const origen of ["comprobante", "manual", null] as const) {
      expect(cambioPorInforme({ pagada: true, cancelada: false, origenConfirmacion: origen }, informe("pendiente")).tipo).toBe("sin_cambios");
    }
  });

  it("una cancelada que la compañía informa pagada o impaga queda a revisar", () => {
    const cancelada = { ...impaga, cancelada: true };
    expect(cambioPorInforme(cancelada, informe("pagada")).tipo).toBe("a_revisar");
    expect(cambioPorInforme(cancelada, informe("pendiente")).tipo).toBe("a_revisar");
  });

  it("que la compañía diga vencida no cambia nada: el vencimiento lo calcula la gracia", () => {
    expect(cambioPorInforme(impaga, informe("vencida"))).toEqual({ tipo: "sin_cambios", motivo: null });
  });
});
