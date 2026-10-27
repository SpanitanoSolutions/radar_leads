import { describe, expect, it } from "vitest";
import {
  leerReferencia,
  referenciaDe,
  dentroDeHorario,
  etiquetaPendiente,
  fechaDelPaso,
  grupoDe,
  kpisCobranza,
  pasoQueToca,
  proximoPaso,
  textoProximo,
  textoVencimiento,
  tonoEstado,
} from "./cobranza";

const HOY = "2026-10-27";
const GRACIA = 30;

describe("secuencia", () => {
  it("fecha de cada paso", () => {
    expect([1, 2, 3, 4, 5].map((p) => fechaDelPaso(p as 1, "2026-10-30", GRACIA))).toEqual([
      "2026-10-27",
      "2026-10-30",
      "2026-11-02",
      "2026-11-09",
      "2026-11-24",
    ]);
  });

  it("recordatorio 3 días antes, vence hoy y vencida a los 3 días", () => {
    expect(pasoQueToca("2026-10-30", HOY, GRACIA, 0)).toBe(1);
    expect(pasoQueToca("2026-10-27", HOY, GRACIA, 1)).toBe(2);
    expect(pasoQueToca("2026-10-24", HOY, GRACIA, 2)).toBe(3);
  });

  it("llamada a los 10 días y riesgo de cobertura 5 días antes del fin de la gracia", () => {
    expect(pasoQueToca("2026-10-15", HOY, GRACIA, 3)).toBe(4);
    expect(pasoQueToca("2026-10-02", HOY, GRACIA, 4)).toBe(5);
    // Con un plazo de gracia corto, el aviso de riesgo llega antes que la llamada.
    expect(fechaDelPaso(5, "2026-10-19", 12)).toBe("2026-10-26");
    expect(pasoQueToca("2026-10-19", HOY, 12, 3)).toBe(5);
  });

  it("si se saltearon días, solo toca el paso más reciente", () => {
    expect(pasoQueToca("2026-10-22", HOY, GRACIA, 0)).toBe(3);
  });

  it("no repite pasos hechos ni adelanta los que no llegaron", () => {
    expect(pasoQueToca("2026-10-30", HOY, GRACIA, 1)).toBeNull();
    expect(pasoQueToca("2026-11-05", HOY, GRACIA, 0)).toBeNull();
    expect(proximoPaso("2026-11-05", HOY, GRACIA, 0)).toEqual({ paso: 1, fecha: "2026-11-02" });
  });
});

describe("textos del seguimiento", () => {
  const base = { vencimiento: "2026-11-05", hoy: HOY, diasGracia: GRACIA, hecho: 0, pausa: null, sinContacto: false, pendiente: null };

  it("próximo paso según el estado", () => {
    expect(textoProximo(base)).toBe("Recordatorio el 02/11");
    expect(textoProximo({ ...base, pausa: { motivo: "Promesa de pago", hasta: "2026-10-30" } })).toBe("En pausa hasta el 30/10");
    expect(textoProximo({ ...base, pausa: { motivo: "Pagó a una cuenta equivocada", hasta: null } })).toBe("En pausa hasta que lo resuelvas");
    expect(textoProximo({ ...base, sinContacto: true })).toBe("Completar el contacto en la ficha");
    expect(textoProximo({ ...base, pendiente: { tipo: 2, canal: "whatsapp" } })).toBe("Aviso por WhatsApp · para aprobar");
    expect(textoProximo({ ...base, pendiente: { tipo: 4, canal: "llamada" } })).toBe("Llamada tuya · hoy");
    expect(textoProximo({ ...base, pendiente: { tipo: "diferencia", canal: "email" } })).toBe("Pedir la diferencia · para aprobar");
  });

  it("etiquetas de las tarjetas para aprobar", () => {
    expect(etiquetaPendiente(2, "2026-10-29", HOY)).toEqual({ texto: "Paso 2 · Vence en 2 días", tono: "aviso" });
    expect(etiquetaPendiente(3, "2026-10-22", HOY)).toEqual({ texto: "Paso 3 · Vencida hace 5 días", tono: "vencida" });
    expect(etiquetaPendiente(4, "2026-10-15", HOY)).toEqual({ texto: "Paso 4 · Vencida hace 12 días", tono: "llamada" });
    expect(etiquetaPendiente("diferencia", "2026-10-31", HOY)).toEqual({ texto: "Pago incompleto", tono: "problema" });
  });

  it("vencimiento en palabras", () => {
    expect(textoVencimiento("2026-10-29", HOY)).toBe("vence el jueves 29/10");
    expect(textoVencimiento("2026-10-22", HOY)).toBe("venció el 22/10");
    expect(textoVencimiento("2026-10-27", HOY)).toBe("vence hoy");
    expect(textoVencimiento("2026-11-08", HOY)).toBe("vence el 08/11");
  });

  it("grupos y tono del estado", () => {
    expect(grupoDe("2026-10-22", HOY, false)).toBe("vencidas");
    expect(grupoDe("2026-10-30", HOY, false)).toBe("porvencer");
    expect(grupoDe("2026-10-22", HOY, true)).toBe("pausadas");
    expect(tonoEstado({ pausa: { hasta: "2026-10-30" }, sinContacto: false, problema: false, atraso: 6, hecho: 3 })).toBe("ok");
    expect(tonoEstado({ pausa: null, sinContacto: false, problema: false, atraso: 12, hecho: 3 })).toBe("mal");
    expect(tonoEstado({ pausa: null, sinContacto: false, problema: false, atraso: 5, hecho: 2 })).toBe("neutro");
  });
});

describe("reglas", () => {
  it("solo de lunes a sábado, de 9 a 20 h", () => {
    expect(dentroDeHorario(new Date("2026-10-27T10:00:00-03:00"))).toBe(true); // martes
    expect(dentroDeHorario(new Date("2026-10-27T08:59:00-03:00"))).toBe(false);
    expect(dentroDeHorario(new Date("2026-10-27T20:00:00-03:00"))).toBe(false);
    expect(dentroDeHorario(new Date("2026-11-01T12:00:00-03:00"))).toBe(false); // domingo
    expect(dentroDeHorario(new Date("2026-10-31T12:00:00-03:00"))).toBe(true); // sábado
  });
});

describe("kpisCobranza", () => {
  it("por cobrar y cobrado del mes, vencidas y cerca de quedar sin cobertura", () => {
    const k = kpisCobranza(
      [
        { asegurado: "A", aseguradoId: 1, monto: 100, vencimiento: "2026-10-29", pagada: false, cuotas: 1 },
        { asegurado: "B", aseguradoId: 2, monto: 300, vencimiento: "2026-10-20", pagada: true, cuotas: 3 },
        { asegurado: "Sosa, Ricardo", aseguradoId: 3, monto: 96200, vencimiento: "2026-10-15", pagada: false, cuotas: 1 },
        { asegurado: "C", aseguradoId: 4, monto: 50, vencimiento: "2026-11-05", pagada: false, cuotas: 1 },
      ],
      HOY,
    );
    expect(k).toMatchObject({ porCobrar: 96600, cuotasDelMes: 5, aseguradosDelMes: 3, cobrado: 300, vencidas: 1, montoVencido: 96200 });
    expect(k.riesgo.map((r) => [r.asegurado, r.atraso])).toEqual([["Sosa, Ricardo", 12]]);
  });
});

describe("referencias de los mensajes", () => {
  it("ida y vuelta", () => {
    expect(leerReferencia("cuota:12:paso:2")).toEqual({ cuotaId: 12, tipo: 2 });
    expect(leerReferencia("cuota:7:diferencia")).toEqual({ cuotaId: 7, tipo: "diferencia" });
    expect(leerReferencia("vencimiento:3:2026-11-05")).toBeNull();
    expect(referenciaDe(12, 4)).toBe("cuota:12:paso:4");
    expect(referenciaDe(12, "recibo")).toBe("cuota:12:recibo");
  });
});
