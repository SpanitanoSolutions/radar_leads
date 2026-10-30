import { describe, expect, it } from "vitest";
import { paqueteParaEnvio, pasosConfiguracionCotizacion, ramosConPaquete, VOZ_POR_DEFECTO, type DatosChecklist } from "./configuracion";

const vacio: DatosChecklist = {
  aseguradoras: [
    { id: 1, nombre: "Sancor", activa: true, contactos: [] },
    { id: 2, nombre: "Seguros Rivadavia", activa: false, contactos: [{ email: "cotiza@rivadavia.com.ar" }] },
  ],
  paquetes: [],
  credenciales: [],
  voz: { elegida: false, ...VOZ_POR_DEFECTO },
};

const listos = (datos: DatosChecklist) => Object.fromEntries(pasosConfiguracionCotizacion(datos).map((paso) => [paso.id, paso.listo]));

describe("checklist del inicio de Cotización", () => {
  it("tiene los 4 pasos de la spec, cada uno con su sección", () => {
    const pasos = pasosConfiguracionCotizacion(vacio);
    expect(pasos.map((paso) => paso.texto)).toEqual([
      "Agregá lo que vendés",
      "Agregá una aseguradora con contacto",
      "Conectá los accesos de portal",
      "Elegí cómo suena tu agente",
    ]);
    expect(pasos.map((paso) => paso.href)).toEqual([
      "/agentes/cotizacion/configuracion#paquetes",
      "/agentes/cotizacion/configuracion#aseguradoras",
      "/configuracion/companias?agente=cotizacion",
      "/agentes/cotizacion/configuracion#voz",
    ]);
    expect(listos(vacio)).toEqual({ vendes: false, aseguradora: false, portales: false, voz: false });
  });

  it("lo que vendés: un paquete de una aseguradora activa (el de una inactiva no cuenta)", () => {
    expect(listos({ ...vacio, paquetes: [{ aseguradoraId: 2 }] }).vendes).toBe(false);
    expect(listos({ ...vacio, paquetes: [{ aseguradoraId: 1 }] }).vendes).toBe(true);
  });

  it("aseguradora con contacto: activa y con un correo válido", () => {
    const sinCorreo = { ...vacio, aseguradoras: [{ id: 1, nombre: "Sancor", activa: true, contactos: [{ email: "sin arroba" }] }] };
    expect(listos(sinCorreo).aseguradora).toBe(false);
    const conCorreo = { ...vacio, aseguradoras: [{ id: 1, nombre: "Sancor", activa: true, contactos: [{ email: "cotiza@sancor.com.ar" }] }] };
    expect(listos(conCorreo).aseguradora).toBe(true);
  });

  it("accesos de portal: una clave activa de una compañía con la que cotizás, por su nombre canónico", () => {
    const activa = { ...vacio, aseguradoras: [{ id: 3, nombre: "Seguros Rivadavia", activa: true, contactos: [] }] };
    expect(listos({ ...activa, credenciales: [{ compania: "Rivadavia", estado: "activa" }] }).portales).toBe(true);
    expect(listos({ ...activa, credenciales: [{ compania: "Rivadavia", estado: "vencida" }] }).portales).toBe(false);
    expect(listos({ ...activa, credenciales: [{ compania: "Mapfre", estado: "activa" }] }).portales).toBe(false);
  });

  it("la voz: guardada alguna vez, o cambiada", () => {
    expect(listos({ ...vacio, voz: null }).voz).toBe(false);
    expect(listos({ ...vacio, voz: { ...VOZ_POR_DEFECTO, elegida: true } }).voz).toBe(true);
    expect(listos({ ...vacio, voz: { ...VOZ_POR_DEFECTO, elegida: false, nombreAgente: "Martina" } }).voz).toBe(true);
  });
});

describe("paquetes de cada aseguradora", () => {
  const paquetes = [
    { id: 7, aseguradoraId: 1, ramo: "Automotor" },
    { id: 3, aseguradoraId: 1, ramo: "Auto" },
    { id: 9, aseguradoraId: 1, ramo: "Hogar" },
    { id: 4, aseguradoraId: 2, ramo: "Flotas" },
  ];

  it("junta los ramos con paquete por su nombre canónico", () => {
    expect(ramosConPaquete(paquetes)).toEqual(new Map([[1, ["Auto", "Hogar"]], [2, ["Flota"]]]));
  });

  it("el envío lleva el paquete de su ramo; con varios, el primero que se cargó", () => {
    expect(paqueteParaEnvio(1, "Automotor", paquetes)).toBe(3);
    expect(paqueteParaEnvio(2, "Flota", paquetes)).toBe(4);
    expect(paqueteParaEnvio(2, "Automotor", paquetes)).toBeNull();
    expect(paqueteParaEnvio(null, "Automotor", paquetes)).toBeNull();
  });
});
