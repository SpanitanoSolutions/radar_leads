import { describe, expect, it } from "vitest";
import { armarBorradorSolicitud } from "./correo";

const base = {
  plantillaAsunto: "SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]",
  plantillaCuerpo: "Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}. Organización: {organizacion}. Moneda: {moneda}. Forma de pago: {forma_de_pago}.",
  aseguradora: { nombre: "Sancor", codigoProductor: "4521" },
  solicitud: { ramo: "Automotor", cliente: "Panadería La Espiga SA", datosRiesgo: { cuitCuil: "30-71234567-1" } },
  cuenta: { productor: "Julián Pérez", organizacion: "Pérez Seguros" },
};

describe("borrador de la solicitud a cada compañía", () => {
  it("usa el productor y la organización de la cuenta, no textos fijos", () => {
    const { asunto, cuerpo } = armarBorradorSolicitud(base);
    expect(asunto).toBe("SOLICITUD – Automotor – Panadería La Espiga SA – Sancor – 4521");
    expect(cuerpo).toBe("Buenos días. Solicitamos una propuesta para Panadería La Espiga SA, CUIT 30-71234567-1, ramo Automotor. Productor: Julián Pérez. Organización: Pérez Seguros. Moneda: ARS. Forma de pago: a convenir.");
    expect(cuerpo).not.toMatch(/Productor: Productor|UNIQO/);
  });

  it("suma las instrucciones fijas de la configuración y después las de la aseguradora", () => {
    const { cuerpo } = armarBorradorSolicitud({
      ...base,
      instruccionesCuerpo: "Por favor, respondan a {productor} con la cotización en PDF.",
      aseguradora: { ...base.aseguradora, instrucciones: "Indicar el código de productor en la respuesta." },
    });
    expect(cuerpo.split("\n\n")).toEqual([
      expect.stringMatching(/^Buenos días\./),
      "Por favor, respondan a Julián Pérez con la cotización en PDF.",
      "Indicar el código de productor en la respuesta.",
    ]);
  });

  it("no agrega párrafos vacíos si no hay instrucciones", () => {
    const { cuerpo } = armarBorradorSolicitud({ ...base, instruccionesCuerpo: "  " });
    expect(cuerpo).not.toContain("\n");
  });

  it("si falta el nombre del productor usa el de la organización, y al revés", () => {
    expect(armarBorradorSolicitud({ ...base, cuenta: { productor: null, organizacion: "Pérez Seguros" } }).cuerpo)
      .toContain("Productor: Pérez Seguros. Organización: Pérez Seguros.");
    expect(armarBorradorSolicitud({ ...base, cuenta: { productor: "Julián Pérez", organizacion: null } }).cuerpo)
      .toContain("Productor: Julián Pérez. Organización: Julián Pérez.");
  });

  it("el asunto propio de la aseguradora manda y, sin clave, no termina en guion", () => {
    expect(armarBorradorSolicitud({ ...base, aseguradora: { nombre: "Sancor" } }).asunto).toBe("SOLICITUD – Automotor – Panadería La Espiga SA – Sancor");
    expect(armarBorradorSolicitud({ ...base, aseguradora: { nombre: "Sancor", asunto: "Pedido [RAMO] / [CLIENTE]" } }).asunto).toBe("Pedido Automotor / Panadería La Espiga SA");
  });

  it("sin configuración usa los textos por defecto", () => {
    const { asunto, cuerpo } = armarBorradorSolicitud({ aseguradora: base.aseguradora, solicitud: base.solicitud, cuenta: base.cuenta });
    expect(asunto).toBe("SOLICITUD – Automotor – Panadería La Espiga SA – Sancor – 4521");
    expect(cuerpo).toBe("Buenos días. Solicitamos una propuesta para Panadería La Espiga SA, CUIT 30-71234567-1, ramo Automotor. Productor: Julián Pérez.");
  });
});
