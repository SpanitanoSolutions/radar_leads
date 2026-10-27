import { describe, expect, it } from "vitest";
import { calcularEstadisticas, type DatosEstadisticas } from "./estadisticas";

const datos: DatosEstadisticas = {
  hoy: "2026-10-27",
  asegurados: [{ id: 1 }, { id: 2 }],
  polizas: [
    { id: 1, aseguradoId: 1, ramo: "Auto", compania: "Mapfre", prima: 120000, vigenciaDesde: "2026-01-01", vigenciaHasta: "2026-12-31" },
    { id: 2, aseguradoId: 2, ramo: "Hogar", compania: "Sancor", prima: 60000, vigenciaDesde: null, vigenciaHasta: "2026-11-15" },
    { id: 3, aseguradoId: 1, ramo: "Auto", compania: "Mapfre", prima: 90000, vigenciaDesde: "2026-01-01", vigenciaHasta: "2026-09-30" },
  ],
  cuotas: [
    { polizaId: 1, monto: 10000, estado: "pagada", vencimiento: "2026-10-10", pagadaEl: new Date("2026-10-10T12:00:00-03:00") },
    { polizaId: 1, monto: 10000, estado: "vencida", vencimiento: "2026-09-10", pagadaEl: null },
    { polizaId: 2, monto: 5000, estado: "pendiente", vencimiento: "2026-11-10", pagadaEl: null },
    { polizaId: 2, monto: 5000, estado: "pagada", vencimiento: "2025-11-10", pagadaEl: new Date("2025-11-10T12:00:00-03:00") },
  ],
  acuerdos: [
    { compania: "Mapfre", ramo: "Auto", porcentaje: 10 },
    { compania: "Sancor", ramo: "Hogar", porcentaje: 20 },
  ],
  liquidaciones: [
    { compania: "Mapfre", periodo: "2026-10", montoLiquidado: 1000, depositado: 950, depositadoEl: "2026-10-20" },
    { compania: "Sancor", periodo: "2025-11", montoLiquidado: 1000, depositado: 900, depositadoEl: "2026-10-05" },
  ],
  siniestros: [
    { etapa: "aviso", fecha: new Date("2026-10-01T12:00:00-03:00"), cerrado: false, cerradoEl: null, montoAprobado: null, montoPagado: null },
    { etapa: "pago", fecha: new Date("2026-09-01T12:00:00-03:00"), cerrado: true, cerradoEl: new Date("2026-09-11T12:00:00-03:00"), montoAprobado: 20000, montoPagado: 18000 },
  ],
  solicitudes: [
    { estado: "ganada", creadoEl: new Date("2026-03-01T12:00:00-03:00") },
    { estado: "esperando", creadoEl: new Date("2025-12-01T12:00:00-03:00") },
  ],
};

describe("calcularEstadisticas", () => {
  it("resume pólizas vigentes, prima y distribución por compañía y ramo", () => {
    const resultado = calcularEstadisticas(datos, 2026);
    expect(resultado).toMatchObject({ asegurados: 2, polizasVigentes: 2, primaAnual: 180000, primaPromedio: 90000 });
    expect(resultado.porCompania.map((fila) => [fila.nombre, fila.polizas, fila.prima, fila.participacion])).toEqual([
      ["Mapfre", 1, 120000, 66.7],
      ["Sancor", 1, 60000, 33.3],
    ]);
    expect(resultado.porRamo.map((fila) => fila.nombre)).toEqual(["Auto", "Hogar"]);
  });

  it("agrupa cobranzas por fecha de pago y comisiones por año elegido", () => {
    const resultado = calcularEstadisticas(datos, 2026);
    expect(resultado.cuotasCobradas).toBe(10000);
    expect(resultado.comisionEstimadaAnio).toBe(1000);
    expect(resultado.comisionLiquidadaAnio).toBe(1000);
    expect(resultado.comisionDepositadaAnio).toBe(1850);
    expect(resultado.meses.find((mes) => mes.id === "2026-10")).toMatchObject({ cuotas: 1, primaCobrada: 10000, comisionEstimada: 1000 });
    expect(resultado.cobranza).toEqual([
      { id: "pagada", nombre: "Pagadas", polizas: 2, monto: 15000 },
      { id: "vencida", nombre: "Vencidas", polizas: 1, monto: 10000 },
      { id: "pendiente", nombre: "Pendientes", polizas: 1, monto: 5000 },
    ]);
  });

  it("resumen vencimientos, siniestros y solicitudes solo muestra datos relevantes", () => {
    const resultado = calcularEstadisticas(datos, 2026);
    expect(resultado.vencimientosProximos).toMatchObject([
      { id: "2026-11", polizas: 1, prima: 60000 },
      { id: "2026-12", polizas: 1, prima: 120000 },
    ]);
    expect(resultado.siniestros).toMatchObject({ abiertos: 1, cerrados: 1, indemnizacionAprobada: 20000, indemnizacionPagada: 18000, promedioCierreDias: 10 });
    expect(resultado.cotizaciones).toMatchObject({ total: 1, cerradas: 1, ganadas: 1, tasaGanada: 1 });
  });

  it("devuelve ceros con una cartera vacía", () => {
    const vacios: DatosEstadisticas = { ...datos, asegurados: [], polizas: [], cuotas: [], siniestros: [], solicitudes: [], liquidaciones: [], acuerdos: [] };
    const resultado = calcularEstadisticas(vacios, 2026);
    expect(resultado).toMatchObject({ asegurados: 0, polizasVigentes: 0, primaAnual: 0, comisionDepositadaAnio: 0 });
    expect(resultado.porCompania).toEqual([]);
  });
});