import { describe, expect, it } from "vitest";
import { conciliarPeriodo, textoReclamoComision, type AcuerdoConciliacion, type CuotaConciliable } from "./conciliacion";

const acuerdos: AcuerdoConciliacion[] = [
  { compania: "Sancor", ramo: "Hogar", porcentaje: 20 },
  { compania: "Federación Patronal", ramo: "Flota", porcentaje: 12 },
  { compania: "Mapfre", ramo: "Auto", porcentaje: 10 },
];
const cuotas: CuotaConciliable[] = [
  { asegurado: "Ibáñez, Carolina", polizaNumero: "61-H-44019", polizaId: 1, cuotaNumero: 4, ramo: "Hogar", compania: "Sancor", monto: 35000, pagadaEl: "2026-09-10" },
  { asegurado: "Escuela de Conducir Faro SRL", polizaNumero: "88-551877", polizaId: 2, cuotaNumero: 8, ramo: "Flota", compania: "Federación Patronal", monto: 158300, pagadaEl: "2026-09-12" },
  { asegurado: "Acosta, Valeria", polizaNumero: "88-322019", polizaId: 3, cuotaNumero: 3, ramo: "Auto", compania: "Mapfre", monto: 72500, pagadaEl: "2026-09-08" },
  { asegurado: "Otro", polizaNumero: "otro-mes", polizaId: 4, cuotaNumero: 1, ramo: "Auto", compania: "Mapfre", monto: 100000, pagadaEl: "2026-08-08" },
];

describe("conciliarPeriodo", () => {
  it("detecta una póliza omitida y calcula la comisión a reclamar", () => {
    const filas = conciliarPeriodo("2026-09", cuotas, acuerdos, [
      {
        id: 1,
        compania: "Sancor",
        periodo: "2026-09",
        recibidaEl: "2026-10-08",
        montoLiquidado: 0,
        depositado: 0,
        retenciones: null,
        items: [],
      },
    ]);
    const sancor = filas.find((fila) => fila.compania === "Sancor");
    expect(sancor).toMatchObject({ esperado: 7000, diferencia: 7000, estado: "reclamar" });
    expect(sancor?.hallazgos[0].tipo).toBe("faltante");
  });

  it("identifica un porcentaje distinto y no marca las retenciones como error", () => {
    const filas = conciliarPeriodo("2026-09", cuotas, acuerdos, [
      {
        id: 2,
        compania: "Federación Patronal",
        periodo: "2026-09",
        recibidaEl: "2026-10-06",
        montoLiquidado: 15830,
        depositado: 15023,
        retenciones: { iibb: 484, ganancias: 323 },
        items: [{ polizaNumero: "88-551877", cuotaNumero: 8, porcentaje: 10, comision: 15830 }],
      },
    ]);
    expect(filas[0]).toMatchObject({ esperado: 18996, diferencia: 3166, estado: "reclamar", retenciones: 807 });
    expect(filas[0].hallazgos.map((h) => h.tipo)).toEqual(["porcentaje", "retenciones"]);
    expect(filas[0].hallazgos[1].texto).toContain("Cierra");
  });

  it("señala liquidaciones que no llegaron y omite las cuotas de otros períodos", () => {
    const filas = conciliarPeriodo("2026-09", cuotas, acuerdos, []);
    const mapfre = filas.find((fila) => fila.compania === "Mapfre");
    expect(mapfre).toMatchObject({ esperado: 7250, liquidado: null, estado: "sin-liquidacion" });
  });

  it("prepara un email con el detalle y el total", () => {
    const fila = conciliarPeriodo("2026-09", cuotas, acuerdos, [
      { id: 1, compania: "Sancor", periodo: "2026-09", recibidaEl: "2026-10-08", montoLiquidado: 0, depositado: 0, retenciones: null, items: [] },
    ]).find((resultado) => resultado.compania === "Sancor")!;
    const reclamo = textoReclamoComision(fila);
    expect(reclamo.asunto).toContain("septiembre de 2026");
    expect(reclamo.texto).toContain("Total a revisar: $ 7.000");
    expect(reclamo.texto.endsWith("{productor}")).toBe(true);
  });
});