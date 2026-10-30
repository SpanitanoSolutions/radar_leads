import { describe, expect, it } from "vitest";
import { filtrarBitacora, grupoDeEvento, nombreActor, type EventoBitacora } from "./bitacora";

const evento = (cambios: Partial<EventoBitacora>): EventoBitacora => ({
  id: 1, fecha: new Date("2026-10-30T13:00:00Z"), tipo: "correo_enviado", actor: "agente", detalle: "Salió el correo a Sancor.",
  solicitudId: 9, numero: 1043, cliente: "Transportes Del Atlántico SRL", compania: "Sancor", ...cambios,
});

const eventos = [
  evento({ id: 1 }),
  evento({ id: 2, tipo: "dato_pedido", compania: "Rivadavia", detalle: "El portal pide el uso del vehículo." }),
  evento({ id: 3, tipo: "ia_chat", actor: "ia", compania: null, detalle: "La IA respondió tu consulta." }),
  evento({ id: 4, tipo: "solicitud_creada", actor: "productor", compania: null, numero: 1042, cliente: "Gómez, Lucía", solicitudId: 8, fecha: new Date("2026-10-28T02:30:00Z") }),
  evento({ id: 5, tipo: "respuesta_cotizado", actor: "simulador", fecha: new Date("2026-10-31T02:30:00Z") }),
];

describe("bitácora de Cotización", () => {
  it("agrupa los tipos de evento", () => {
    expect(grupoDeEvento("correo_enviado")).toBe("correos");
    expect(grupoDeEvento("dato_pedido")).toBe("conexiones");
    expect(grupoDeEvento("cotizacion_confirmada")).toBe("respuestas");
    expect(grupoDeEvento("respuesta_rechazado")).toBe("respuestas");
    expect(grupoDeEvento("ia_extraccion")).toBe("ia");
    expect(grupoDeEvento("propuesta_aprobada")).toBe("solicitud");
    expect(grupoDeEvento("algo_nuevo")).toBe("otros");
    expect(nombreActor("productor")).toBe("Vos");
    expect(nombreActor("otro")).toBe("otro");
  });

  it("filtra por solicitud o cliente (sin tildes), compañía, quién y tipo, y ordena del más nuevo al más viejo", () => {
    expect(filtrarBitacora(eventos, {}).map((e) => e.id)).toEqual([5, 3, 2, 1, 4]);
    expect(filtrarBitacora(eventos, { q: "gomez" }).map((e) => e.id)).toEqual([4]);
    expect(filtrarBitacora(eventos, { q: "1043", compania: "Rivadavia" }).map((e) => e.id)).toEqual([2]);
    expect(filtrarBitacora(eventos, { actor: "ia" }).map((e) => e.id)).toEqual([3]);
    expect(filtrarBitacora(eventos, { grupo: "conexiones" }).map((e) => e.id)).toEqual([2]);
    expect(filtrarBitacora(eventos, { q: "uso del vehiculo" }).map((e) => e.id)).toEqual([2]);
  });

  it("las fechas se comparan en el día argentino", () => {
    // 28/10 02:30 UTC es el 27/10 en Argentina; 31/10 02:30 UTC es el 30/10.
    expect(filtrarBitacora(eventos, { desde: "2026-10-28", hasta: "2026-10-30" }).map((e) => e.id)).toEqual([5, 3, 2, 1]);
    expect(filtrarBitacora(eventos, { hasta: "2026-10-27" }).map((e) => e.id)).toEqual([4]);
  });
});
