import { describe, expect, it } from "vitest";
import type { PagoNormalizado } from "@/lib/conectores/tipos";
import { importe } from "@/lib/formato";
import { leerTablaCsv } from "@/lib/importacion";
import { leerListado, proponerMapeoPorSinonimos, type PlantillaListado } from "./listados";
import { planDeFuente, procesarFuente, type CuotaParaProcesar, type EntradaPago } from "./procesar";

const OPCIONES = { toleranciaMonto: 1 };

const cuota = (extra: Partial<CuotaParaProcesar>): CuotaParaProcesar => ({
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
  origenConfirmacion: null,
  ...extra,
});

const entrada = (pago: Partial<PagoNormalizado>): EntradaPago => ({
  fila: null,
  original: null,
  pago: {
    compania: "Sancor",
    poliza: "664794781",
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
    ...pago,
  },
});

const LISTADO = [
  "Póliza;Cuota;Vencimiento;Importe;Fecha de pago;Forma de pago;Estado",
  "0664794781;4/12;29/10/2026;$ 1.915,61;28/10/2026;Transferencia;Cobrada",
  "88-322019;3/6;05/11/2026;$ 52.300,00;04/11/2026;Rapipago;Cobrada",
  "55-100200;1/12;10/11/2026;$ 8.000,00;;;Impaga",
  "99-999999;2/12;10/11/2026;$ 3.000,00;09/11/2026;Pago Fácil;Cobrada",
].join("\n");

const CARTERA: CuotaParaProcesar[] = [
  cuota({ id: 10 }),
  // El monto no coincide: la compañía cobró otra cosa.
  cuota({ id: 20, poliza: "88-322019", numero: 3, cantidadCuotas: 6, monto: 50_000, vencimiento: "2026-11-05" }),
  cuota({ id: 30, poliza: "55-100200", numero: 1, monto: 8000, vencimiento: "2026-11-10" }),
  cuota({ id: 40, poliza: "664794781", numero: 5, vencimiento: "2026-11-29" }),
];

describe("planDeFuente", () => {
  const plantilla: PlantillaListado = {
    id: 7,
    compania: "Sancor",
    version: 1,
    mapeo: { ...proponerMapeoPorSinonimos(["Póliza", "Cuota", "Vencimiento", "Importe", "Estado"]) },
  };

  it("con un formato guardado se lee con la plantilla, aunque haya IA", () => {
    const encabezados = ["Póliza", "Cuota", "Vencimiento", "Importe", "Estado", "Columna nueva"];
    const plan = planDeFuente({ formato: "xlsx", encabezados, compania: "SANCOR SEGUROS", plantillas: [plantilla], iaDisponible: true });
    expect(plan).toEqual({ paso: "leer_con_plantilla", plantilla });
  });

  it("un formato nuevo se propone con IA si está disponible y, si no, por sinónimos", () => {
    const base = { formato: "csv" as const, encabezados: ["Recibo", "Importe"], compania: "Sancor", plantillas: [plantilla] };
    expect(planDeFuente({ ...base, iaDisponible: true })).toEqual({ paso: "proponer_mapeo", con: "ia" });
    expect(planDeFuente({ ...base, iaDisponible: false })).toEqual({ paso: "proponer_mapeo", con: "sinonimos" });
  });

  it("un PDF necesita la IA para transcribir la tabla", () => {
    const base = { formato: "pdf" as const, encabezados: null, compania: "Sancor", plantillas: [] };
    expect(planDeFuente({ ...base, iaDisponible: true })).toEqual({ paso: "extraer_con_ia" });
    expect(planDeFuente({ ...base, iaDisponible: false })).toMatchObject({ paso: "sin_ia" });
  });
});

describe("procesarFuente", () => {
  it("criterio 3: un listado con formato guardado actualiza las cuotas que coinciden y deja las demás a revisar o no identificadas, sin IA", async () => {
    const tabla = await leerTablaCsv(LISTADO, "cobranza sancor.csv");
    const plantilla: PlantillaListado = { id: 1, compania: "Sancor", version: 1, mapeo: proponerMapeoPorSinonimos(tabla.encabezados) };
    const plan = planDeFuente({ formato: "csv", encabezados: tabla.encabezados, compania: "Sancor", plantillas: [plantilla], iaDisponible: true });
    expect(plan.paso).toBe("leer_con_plantilla");

    const lectura = leerListado(tabla, plantilla.mapeo, "Sancor");
    expect(lectura.problemas).toEqual([]);
    const r = procesarFuente({ pagos: lectura.filas }, CARTERA, OPCIONES);

    expect(r.pagos.map((p) => [p.fila, p.estado, p.cuotaId])).toEqual([
      [2, "confirmado", 10],
      [3, "a_revisar", 20],
      [4, "confirmado", 30],
      [5, "no_identificado", null],
    ]);
    // Solo cambia la cuota pagada que coincide del todo; la impaga sigue como estaba.
    expect(r.cambios).toEqual([{ cuotaId: 10, tipo: "marcar_pagada", fechaPago: "2026-10-28", medio: "transferencia" }]);
    expect(r.revisadas.sort()).toEqual([10, 30]);
    expect(r.totales).toEqual({ confirmados: 2, aRevisar: 1, noIdentificados: 1, pagadas: 1, canceladas: 0 });
    expect(r.pagos[1].motivo).toContain(importe(52_300, "ARS"));
    expect(r.pagos[0].original).toMatchObject({ Estado: "Cobrada" });
  });

  it("reimportar el mismo listado no cambia nada", () => {
    const yaPagada = [cuota({ id: 10, pagada: true, origenConfirmacion: "listado" })];
    const r = procesarFuente({ pagos: [entrada({})] }, yaPagada, OPCIONES);
    expect(r.pagos[0]).toMatchObject({ estado: "confirmado", cambio: { tipo: "sin_cambios" } });
    expect(r.cambios).toEqual([]);
  });

  it("si la compañía contradice la cartera, queda a revisar y no se pisa", () => {
    const cancelada = [cuota({ id: 10, cancelada: true })];
    const r = procesarFuente({ pagos: [entrada({})] }, cancelada, OPCIONES);
    expect(r.pagos[0]).toMatchObject({ estado: "a_revisar", cuotaId: 10, motivo: "La cuota está cancelada y la compañía la informa pagada." });
    expect(r.cambios).toEqual([]);
  });

  it("una anulación cancela las impagas, salvo las que la misma fuente informó pagas", () => {
    const cuotas = [cuota({ id: 10 }), cuota({ id: 11, numero: 5, vencimiento: "2026-11-29" }), cuota({ id: 12, numero: 3, vencimiento: "2026-09-29", pagada: true })];
    const r = procesarFuente(
      { pagos: [entrada({})], cancelaciones: [{ compania: "Sancor", poliza: "664794781", item: null, fecha: "2026-11-15", motivo: "falta_de_pago" }] },
      cuotas,
      OPCIONES,
    );
    expect(r.cambios).toEqual([
      { cuotaId: 10, tipo: "marcar_pagada", fechaPago: "2026-10-28", medio: "transferencia" },
      { cuotaId: 11, tipo: "marcar_cancelada", motivo: "Anulación por falta de pago.", fecha: "2026-11-15" },
    ]);
    expect(r.totales).toMatchObject({ pagadas: 1, canceladas: 1 });
  });

  it("sin número de cuota, la identifica el vencimiento", () => {
    const cuotas = [cuota({ id: 10 }), cuota({ id: 11, numero: 5, vencimiento: "2026-11-29" })];
    const r = procesarFuente({ pagos: [entrada({ cuotaN: 0, cuotaTotal: 0, vencimiento: "2026-11-29" })] }, cuotas, OPCIONES);
    expect(r.pagos[0]).toMatchObject({ estado: "confirmado", cuotaId: 11 });
  });

  it("con solo el cupón también la encuentra, sin decir que la póliza es distinta", () => {
    const cuotas = [cuota({ id: 10, cupon: "29933892721" })];
    const r = procesarFuente({ pagos: [entrada({ poliza: "", cupon: "29933892721", monto: 1800 })] }, cuotas, OPCIONES);
    expect(r.pagos[0].estado).toBe("a_revisar");
    expect(r.pagos[0].motivo).not.toContain("póliza figura");
  });
});
