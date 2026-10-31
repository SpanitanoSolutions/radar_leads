import { describe, expect, it } from "vitest";
import { resolverConfigCobranza } from "./configuracion";
import { chipVencimiento, kpisCobranza, pestanaDe, textoIntentos, vencimientoRelativo } from "./estados";
import {
  canalesDisponibles,
  canalPreferido,
  contactoParaCobranza,
  debeEscalarPorIntentos,
  destinoDe,
  diaIso,
  estadoSincronizado,
  motivoDelMomento,
  motivoExclusion,
  motivoParaNoContactar,
  promesaVencida,
  type CasoParaReglas,
  type CobroParaSincronizar,
} from "./reglas";

const config = resolverConfigCobranza(null);
const real = { ...config, modoPrueba: false };
const hoy = "2026-11-02"; // lunes
// 12:00 de Buenos Aires del día `d` de noviembre.
const mediodia = (d: number) => new Date(`2026-11-${String(d).padStart(2, "0")}T15:00:00Z`);
const caso = (c: Partial<CasoParaReglas> = {}): CasoParaReglas => ({
  estado: "pendiente",
  intentos: 0,
  ultimoContactoEl: null,
  promesaEl: null,
  diasParaVencer: 0,
  noContactar: false,
  borradorPendiente: false,
  ...c,
});

describe("reglas de contacto", () => {
  it("se le puede escribir a un pendiente que vence pronto", () => {
    expect(motivoParaNoContactar(caso({ diasParaVencer: 5 }), config, hoy)).toBeNull();
    expect(motivoParaNoContactar(caso({ diasParaVencer: -30 }), config, hoy)).toBeNull();
  });

  it("no le escribe antes del primer contacto, ni dos veces en pocos días, ni más del máximo", () => {
    expect(motivoParaNoContactar(caso({ diasParaVencer: 6 }), config, hoy)).toBe("temprano");
    expect(motivoParaNoContactar(caso({ estado: "sin_respuesta", intentos: 1, ultimoContactoEl: mediodia(1) }), config, hoy)).toBe("espera");
    expect(motivoParaNoContactar(caso({ estado: "sin_respuesta", intentos: 1, ultimoContactoEl: mediodia(2) }), config, hoy)).toBe("espera");
    expect(motivoParaNoContactar(caso({ estado: "sin_respuesta", intentos: 2, ultimoContactoEl: new Date("2026-10-30T15:00:00Z") }), config, hoy)).toBeNull();
    expect(motivoParaNoContactar(caso({ estado: "sin_respuesta", intentos: 5, ultimoContactoEl: new Date("2026-10-20T15:00:00Z") }), config, hoy)).toBe("max_intentos");
  });

  it("respeta el estado, la marca de no contactar y los borradores pendientes", () => {
    for (const estado of ["escalado", "rechazado", "pagado", "excluido", "sin_datos", "respondio", "informo_pago"] as const) {
      expect(motivoParaNoContactar(caso({ estado }), config, hoy)).toBe("estado");
    }
    expect(motivoParaNoContactar(caso({ noContactar: true }), config, hoy)).toBe("no_contactar");
    expect(motivoParaNoContactar(caso({ borradorPendiente: true }), config, hoy)).toBe("borrador");
  });

  it("una promesa frena hasta la fecha más los días de gracia", () => {
    const prometio = caso({ estado: "promesa", promesaEl: "2026-10-30", intentos: 1 });
    expect(motivoParaNoContactar(prometio, config, "2026-11-02")).toBe("promesa");
    expect(promesaVencida(prometio, config, "2026-11-02")).toBe(false);
    expect(promesaVencida(prometio, config, "2026-11-03")).toBe(true);
    expect(motivoParaNoContactar(prometio, config, "2026-11-03")).toBeNull();
  });

  it("escala cuando llegó al máximo y el último intento ya tuvo su tiempo", () => {
    const agotado = { estado: "sin_respuesta" as const, intentos: 5, ultimoContactoEl: new Date("2026-10-31T15:00:00Z") };
    expect(debeEscalarPorIntentos(agotado, config, hoy)).toBe(false);
    expect(debeEscalarPorIntentos(agotado, config, "2026-11-03")).toBe(true);
    expect(debeEscalarPorIntentos({ ...agotado, intentos: 4 }, config, "2026-11-10")).toBe(false);
    expect(debeEscalarPorIntentos({ ...agotado, estado: "promesa" }, config, "2026-11-10")).toBe(false);
  });

  it("días y ventana horaria solo en modo real", () => {
    expect(diaIso("2026-11-02")).toBe(1);
    expect(diaIso("2026-11-01")).toBe(7);
    expect(motivoDelMomento(real, mediodia(2))).toBeNull();
    expect(motivoDelMomento(real, mediodia(1))).toBe("dia");
    expect(motivoDelMomento(real, new Date("2026-11-02T22:30:00Z"))).toBe("horario"); // 19:30
    expect(motivoDelMomento(real, new Date("2026-11-02T11:59:00Z"))).toBe("horario"); // 08:59
    expect(motivoDelMomento(config, mediodia(1))).toBeNull();
  });
});

describe("canales y destinos", () => {
  const persona = { tipo: "persona" as const, telefono: "223 555-1234", email: null, contactoTelefono: null, contactoEmail: "otro@x.com" };
  const empresa = { tipo: "empresa" as const, telefono: "223 400-0000", email: "info@empresa.com", contactoTelefono: null, contactoEmail: "pagos@empresa.com" };

  it("a las empresas, el contacto de administración primero", () => {
    expect(contactoParaCobranza(empresa)).toEqual({ telefono: "223 400-0000", email: "pagos@empresa.com" });
    expect(contactoParaCobranza(persona)).toEqual({ telefono: "223 555-1234", email: "otro@x.com" });
    expect(contactoParaCobranza({ ...persona, telefono: "  ", contactoEmail: null })).toEqual({ telefono: null, email: null });
  });

  it("solo canales habilitados y con el dato; WhatsApp primero para personas y correo para empresas", () => {
    const soloTelefono = { telefono: "223", email: null };
    expect(canalesDisponibles(soloTelefono, config)).toEqual(["whatsapp"]);
    const conTelefono = { ...config, canales: { ...config.canales, telefono: { ...config.canales.telefono, habilitado: true } } };
    expect(canalesDisponibles(soloTelefono, conTelefono)).toEqual(["whatsapp", "telefono"]);
    expect(canalPreferido("persona", ["email", "whatsapp"])).toBe("whatsapp");
    expect(canalPreferido("empresa", ["email", "whatsapp"])).toBe("email");
    expect(canalPreferido("persona", [])).toBeNull();
  });

  it("en modo prueba va al destino de prueba o se simula", () => {
    const contacto = { telefono: "223 555-1234", email: "cliente@x.com" };
    expect(destinoDe("email", contacto, real)).toEqual({ para: "cliente@x.com", prueba: false });
    expect(destinoDe("email", contacto, config)).toEqual({ para: null, prueba: true });
    const conPrueba = { ...config, prueba: { ...config.prueba, telefono: "223 000-0000", email: "yo@prueba.com" } };
    expect(destinoDe("email", contacto, conPrueba)).toEqual({ para: "yo@prueba.com", prueba: true });
    expect(destinoDe("whatsapp", contacto, conPrueba)).toEqual({ para: "223 000-0000", prueba: true });
  });
});

describe("sincronización con la cartera", () => {
  const filtros = config.filtros;
  const cobro = (c: Partial<CobroParaSincronizar> = {}): CobroParaSincronizar => ({
    compania: "Sancor",
    ramos: ["Auto"],
    monto: 1000,
    pagado: false,
    cancelado: false,
    tieneContacto: true,
    noContactar: null,
    ...c,
  });

  it("un caso nuevo arranca pendiente, sin datos o excluido", () => {
    expect(estadoSincronizado(cobro(), null, filtros)).toEqual({ estado: "pendiente", motivo: null });
    expect(estadoSincronizado(cobro({ tieneContacto: false }), null, filtros)).toEqual({ estado: "sin_datos", motivo: null });
    expect(estadoSincronizado(cobro({ noContactar: "manual" }), null, filtros)?.estado).toBe("excluido");
    expect(estadoSincronizado(cobro({ pagado: true }), null, filtros)).toEqual({ estado: "pagado", motivo: null });
  });

  it("los filtros dejan afuera por compañía, ramo y monto", () => {
    const f = { ...filtros, companias: ["Seguros Rivadavia"], ramos: ["Automotor"], montoMinimo: 500 };
    expect(motivoExclusion(cobro({ compania: "Rivadavia" }), f)).toBeNull();
    expect(motivoExclusion(cobro(), f)).toMatch(/Sancor/);
    expect(motivoExclusion(cobro({ compania: "Rivadavia", ramos: ["Hogar"] }), f)).toMatch(/Hogar/);
    expect(motivoExclusion(cobro({ compania: "Rivadavia", ramos: ["Hogar", "Auto"] }), f)).toBeNull();
    expect(motivoExclusion(cobro({ compania: "Rivadavia", monto: 100 }), f)).toMatch(/mínimo/);
    expect(motivoExclusion(cobro({ noContactar: "manual" }), { ...filtros, excluirMarcados: false })).toBeNull();
    expect(motivoExclusion(cobro({ noContactar: "baja" }), { ...filtros, excluirMarcados: false })).toMatch(/no recibir/);
  });

  it("no toca los estados que decidieron el agente o el productor, salvo el pago", () => {
    const escalado = { estado: "escalado" as const, motivo: "x", incluirIgual: false, intentos: 5 };
    expect(estadoSincronizado(cobro({ tieneContacto: false }), escalado, filtros)).toBeNull();
    expect(estadoSincronizado(cobro({ pagado: true }), escalado, filtros)).toEqual({ estado: "pagado", motivo: null });
  });

  it("vuelve a la gestión cuando se completa el contacto o cambia el filtro", () => {
    const sinDatos = { estado: "sin_datos" as const, motivo: null, incluirIgual: false, intentos: 0 };
    expect(estadoSincronizado(cobro(), sinDatos, filtros)).toEqual({ estado: "pendiente", motivo: null });
    const excluido = { estado: "excluido" as const, motivo: "x", incluirIgual: false, intentos: 2 };
    expect(estadoSincronizado(cobro(), excluido, filtros)).toEqual({ estado: "sin_respuesta", motivo: null });
    expect(estadoSincronizado(cobro(), { ...excluido, estado: "pendiente", motivo: null, intentos: 0 }, filtros)).toBeNull();
  });

  it("reactivar un excluido le gana a los filtros, pero no a una baja", () => {
    const forzado = { estado: "pendiente" as const, motivo: null, incluirIgual: true, intentos: 0 };
    expect(estadoSincronizado(cobro({ noContactar: "manual" }), forzado, filtros)).toBeNull();
    expect(estadoSincronizado(cobro({ noContactar: "baja" }), forzado, filtros)?.estado).toBe("excluido");
  });

  it("si el recibo vuelve a figurar impago, el caso se reabre", () => {
    const pagado = { estado: "pagado" as const, motivo: null, incluirIgual: false, intentos: 2 };
    expect(estadoSincronizado(cobro(), pagado, filtros)?.estado).toBe("sin_respuesta");
    expect(estadoSincronizado(cobro({ pagado: true }), pagado, filtros)).toBeNull();
  });
});

describe("estados y KPIs", () => {
  const dia = (d: Date) => d.toISOString().slice(0, 10);

  it("arma los 5 KPIs con los montos por moneda", () => {
    const k = kpisCobranza(
      [
        { estado: "pendiente", monto: 100, moneda: "ARS", ultimoContactoEl: null, pagadoEl: null, aContactarHoy: true },
        { estado: "sin_respuesta", monto: 200.555, moneda: "ARS", ultimoContactoEl: new Date("2026-11-02T13:00:00Z"), pagadoEl: null, aContactarHoy: false },
        { estado: "promesa", monto: 50, moneda: "USD", ultimoContactoEl: null, pagadoEl: null, aContactarHoy: false },
        { estado: "escalado", monto: 10, moneda: "ARS", ultimoContactoEl: null, pagadoEl: null, aContactarHoy: false },
        { estado: "rechazado", monto: 20, moneda: "ARS", ultimoContactoEl: null, pagadoEl: null, aContactarHoy: false },
        { estado: "pagado", monto: 300, moneda: "ARS", ultimoContactoEl: null, pagadoEl: new Date("2026-11-01T13:00:00Z"), aContactarHoy: false },
        { estado: "pagado", monto: 999, moneda: "ARS", ultimoContactoEl: null, pagadoEl: new Date("2026-10-30T13:00:00Z"), aContactarHoy: false },
        { estado: "excluido", monto: 5000, moneda: "ARS", ultimoContactoEl: null, pagadoEl: null, aContactarHoy: false },
      ],
      hoy,
      dia,
    );
    expect(k.activos).toEqual({ cantidad: 5, ars: 330.56, usd: 50 });
    expect(k.hoy).toMatchObject({ cantidad: 2, contactados: 1, porContactar: 1, ars: 300.56 });
    expect(k.promesas).toEqual({ cantidad: 1, ars: 0, usd: 50 });
    expect(k.escalados).toEqual({ cantidad: 2, ars: 30, usd: 0 });
    expect(k.pagadosMes).toEqual({ cantidad: 1, ars: 300, usd: 0 });
  });

  it("Activos muestra lo pagado del mes y nada de lo pagado antes", () => {
    expect(pestanaDe({ estado: "pagado", pagadoEl: new Date("2026-11-01T13:00:00Z") }, "2026-11", dia)).toBe("activos");
    expect(pestanaDe({ estado: "pagado", pagadoEl: new Date("2026-10-01T13:00:00Z") }, "2026-11", dia)).toBeNull();
    expect(pestanaDe({ estado: "sin_datos", pagadoEl: null }, "2026-11", dia)).toBe("sin_datos");
    expect(pestanaDe({ estado: "excluido", pagadoEl: null }, "2026-11", dia)).toBe("excluidos");
  });

  it("textos de vencimiento e intentos", () => {
    expect(vencimientoRelativo(-27)).toBe("hace 27d");
    expect(vencimientoRelativo(15)).toBe("en 15d");
    expect(vencimientoRelativo(0)).toBe("hoy");
    expect(chipVencimiento(-11)).toEqual({ texto: "Vencido hace 11 días", tono: "rojo" });
    expect(chipVencimiento(1).texto).toBe("Vence en 1 día");
    expect(textoIntentos(0, null, hoy, dia)).toEqual({ cantidad: "0 intentos", ultimo: "Sin contactos" });
    expect(textoIntentos(1, new Date("2026-11-02T13:00:00Z"), hoy, dia)).toEqual({ cantidad: "1 intento", ultimo: "Últ. contacto hoy" });
    expect(textoIntentos(4, new Date("2026-10-23T13:00:00Z"), hoy, dia).ultimo).toBe("Últ. contacto hace 10d");
  });
});
