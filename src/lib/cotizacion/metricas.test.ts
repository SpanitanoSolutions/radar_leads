import { describe, expect, it } from "vitest";
import { metricasPorAseguradora, rankingProductores, solicitudesDetenidas } from "./metricas";

const ahora = new Date("2026-01-10T12:00:00Z");
const envios = [
  { solicitudId: 1, compania: "Sancor", productor: "Julia", estado: "cotizado", creadoEl: new Date("2026-01-10T08:00:00Z"), respondidoEl: new Date("2026-01-10T10:00:00Z"), primaNeta: 100, seguimientos: 1 },
  { solicitudId: 2, compania: "Sancor", productor: "Julia", estado: "rechazado", creadoEl: new Date("2026-01-10T08:00:00Z"), respondidoEl: new Date("2026-01-10T12:00:00Z"), primaNeta: null, seguimientos: 0 },
  { solicitudId: 3, compania: "La Segunda", productor: "María", estado: "pendiente", creadoEl: new Date("2026-01-01T08:00:00Z"), respondidoEl: null, primaNeta: null, seguimientos: 0 },
];

describe("métricas de Cotización", () => {
  it("calcula tasas, tiempos, seguimientos y primas por aseguradora", () => {
    expect(metricasPorAseguradora(envios)[0]).toEqual({
      compania: "Sancor", intentos: 2, tasaCotizacion: 0.5, tasaRechazo: 0.5,
      tiempoPromedioHoras: 3, seguimientosPromedio: 0.5, primaNetaPromedio: 100, volumen: 1,
    });
  });

  it("agrupa solicitudes y pendientes por productor", () => {
    expect(rankingProductores(envios)).toEqual([
      { productor: "Julia", solicitudes: 2, cerradas: 2, activas: 0, tasaCotizacion: 0.5, tiempoPromedioCierreHoras: 3, pendientes: 0 },
      { productor: "María", solicitudes: 1, cerradas: 0, activas: 1, tasaCotizacion: 0, tiempoPromedioCierreHoras: null, pendientes: 1 },
    ]);
  });

  it("ordena solicitudes activas detenidas por antigüedad", () => {
    const solicitudes = [
      { numero: 2, estado: "esperando", actualizadoEl: new Date("2026-01-08T00:00:00Z") },
      { numero: 1, estado: "atencion", actualizadoEl: new Date("2026-01-05T00:00:00Z") },
      { numero: 3, estado: "ganada", actualizadoEl: new Date("2026-01-01T00:00:00Z") },
    ];
    expect(solicitudesDetenidas(solicitudes, ahora, 24).map((solicitud) => solicitud.numero)).toEqual([1, 2]);
  });
});
