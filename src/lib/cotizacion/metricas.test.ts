import { describe, expect, it } from "vitest";
import { metricasPorAseguradora, momentosDelEnvio, rankingProductores, solicitudesDetenidas } from "./metricas";

const ahora = new Date("2026-01-10T12:00:00Z");
// Los borradores se crearon a las 8; los pedidos salieron a las 9. El tiempo se mide desde las 9.
const envios = [
  { solicitudId: 1, compania: "Sancor", productor: "Julia", estado: "cotizado", salidoEl: new Date("2026-01-10T09:00:00Z"), respondidoEl: new Date("2026-01-10T10:00:00Z"), primaNeta: 100, seguimientos: 1 },
  { solicitudId: 2, compania: "Sancor", productor: "Julia", estado: "rechazado", salidoEl: new Date("2026-01-10T09:00:00Z"), respondidoEl: new Date("2026-01-10T14:00:00Z"), primaNeta: null, seguimientos: 0 },
  { solicitudId: 3, compania: "La Segunda", productor: "María", estado: "pendiente", salidoEl: null, respondidoEl: null, primaNeta: null, seguimientos: 0 },
  // Respondió, pero no se sabe cuándo salió el pedido: no entra en el tiempo de respuesta.
  { solicitudId: 4, compania: "La Segunda", productor: "Julia", estado: "cotizado", salidoEl: null, respondidoEl: new Date("2026-01-10T11:00:00Z"), primaNeta: 300, seguimientos: 0 },
];
const solicitudes = [
  { id: 1, productor: "Julia", estado: "ganada", creadoEl: new Date("2026-01-10T08:00:00Z"), actualizadoEl: new Date("2026-01-10T20:00:00Z"), completadoEl: null },
  { id: 2, productor: "Julia", estado: "esperando", creadoEl: new Date("2026-01-10T08:00:00Z"), actualizadoEl: new Date("2026-01-12T08:00:00Z"), completadoEl: new Date("2026-01-11T08:00:00Z") },
  { id: 3, productor: "María", estado: "esperando", creadoEl: new Date("2026-01-10T08:00:00Z"), actualizadoEl: new Date("2026-01-10T08:00:00Z"), completadoEl: null },
  { id: 4, productor: "Julia", estado: "atencion", creadoEl: new Date("2026-01-10T08:00:00Z"), actualizadoEl: new Date("2026-01-10T08:00:00Z"), completadoEl: null },
];

describe("métricas de Cotización", () => {
  it("calcula tasas, tiempos desde que salió el pedido, seguimientos y primas por aseguradora", () => {
    const metricas = metricasPorAseguradora(envios);
    expect(metricas.map((m) => m.compania)).toEqual(["La Segunda", "Sancor"]);
    const [laSegunda, sancor] = metricas;
    expect(sancor).toEqual({
      compania: "Sancor", intentos: 2, tasaCotizacion: 0.5, tasaRechazo: 0.5,
      tiempoPromedioHoras: 3, seguimientosPromedio: 0.5, primaNetaPromedio: 100, volumen: 1,
    });
    expect(laSegunda).toMatchObject({ compania: "La Segunda", intentos: 2, tiempoPromedioHoras: null, primaNetaPromedio: 300, volumen: 1 });
  });

  it("el ranking cuenta solicitudes (completada, ganada o perdida es cerrada) y el tiempo de cierre", () => {
    expect(rankingProductores(envios, solicitudes)).toEqual([
      { productor: "Julia", solicitudes: 3, cerradas: 2, activas: 1, tasaCotizacion: 2 / 3, tiempoPromedioCierreHoras: 18, pendientes: 0 },
      { productor: "María", solicitudes: 1, cerradas: 0, activas: 1, tasaCotizacion: 0, tiempoPromedioCierreHoras: null, pendientes: 1 },
    ]);
  });

  it("ordena solicitudes activas detenidas por antigüedad", () => {
    const lista = [
      { numero: 2, estado: "esperando", actualizadoEl: new Date("2026-01-08T00:00:00Z") },
      { numero: 1, estado: "atencion", actualizadoEl: new Date("2026-01-05T00:00:00Z") },
      { numero: 3, estado: "ganada", actualizadoEl: new Date("2026-01-01T00:00:00Z") },
    ];
    expect(solicitudesDetenidas(lista, ahora, 24).map((solicitud) => solicitud.numero)).toEqual([1, 2]);
  });

  it("no cuenta como detenida una solicitud completada, aunque conserve su estado", () => {
    const lista = [
      { numero: 1, estado: "atencion", actualizadoEl: new Date("2026-01-05T00:00:00Z"), completadoEl: new Date("2026-01-06T00:00:00Z") },
      { numero: 2, estado: "esperando", actualizadoEl: new Date("2026-01-08T00:00:00Z"), completadoEl: null },
    ];
    expect(solicitudesDetenidas(lista, ahora, 24).map((solicitud) => solicitud.numero)).toEqual([2]);
  });
});

describe("cuándo salió el pedido y cuándo respondió la compañía", () => {
  const aprobadoEl = new Date("2026-10-30T11:00:00Z");

  it("con conectores: desde el primer canal que llegó a la compañía (el portal caído no cuenta)", () => {
    expect(momentosDelEnvio({
      estado: "cotizado", aprobadoEl: null,
      intentos: [
        { canal: "portal", resultado: "error", codigo: "no_disponible", fecha: "2026-10-30T12:00:00.000Z" },
        { canal: "api", resultado: "pendiente", fecha: "2026-10-30T12:00:05.000Z" },
      ],
    }, { recibidoEl: new Date("2026-11-04T13:00:00Z") })).toEqual({ salidoEl: new Date("2026-10-30T12:00:05.000Z"), respondidoEl: new Date("2026-11-04T13:00:00Z") });
  });

  it("por correo: cuando salió de verdad, no cuando se aprobó ni cuando se creó el borrador", () => {
    expect(momentosDelEnvio({
      estado: "enviado", aprobadoEl,
      intentos: [
        { canal: "correo", resultado: "error", codigo: "sin_enviar", fecha: "2026-10-30T11:00:00.000Z" },
        { canal: "correo", resultado: "enviado", fecha: "2026-10-31T09:00:00.000Z" },
      ],
    }).salidoEl).toEqual(new Date("2026-10-31T09:00:00.000Z"));
  });

  it("un rechazo responde en su intento, aunque no haya resultado", () => {
    const fecha = "2026-10-30T12:00:00.000Z";
    expect(momentosDelEnvio({ estado: "rechazado", aprobadoEl: null, intentos: [{ canal: "api", resultado: "rechazada", detalle: "Fuera de zona", fecha }] }))
      .toEqual({ salidoEl: new Date(fecha), respondidoEl: new Date(fecha) });
  });

  it("los envíos de antes de los conectores salieron al aprobarlos; si nunca salió, no hay salida", () => {
    expect(momentosDelEnvio({ estado: "enviado", aprobadoEl, intentos: [] }).salidoEl).toEqual(aprobadoEl);
    expect(momentosDelEnvio({ estado: "pendiente", aprobadoEl: null, intentos: [] }).salidoEl).toBeNull();
    expect(momentosDelEnvio({ estado: "pendiente", aprobadoEl, intentos: [{ canal: "correo", resultado: "error", fecha: "2026-10-30T11:00:00.000Z" }] }).salidoEl).toBeNull();
  });
});
