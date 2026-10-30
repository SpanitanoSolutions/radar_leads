import { describe, expect, it } from "vitest";
import { CAPACIDADES } from "./tipos";
import {
  AGENTES_CONECTORES,
  agenteDe,
  canalesEnUso,
  capacidadesDelAgente,
  estadoCanal,
  leerOrdenCanales,
  listaCompanias,
  modoDeCanales,
  permisoDe,
  resumenCompania,
  textoModo,
  type SaludGuardada,
} from "./vista";

const salud = (canal: string, cambios: Partial<SaludGuardada> = {}): SaludGuardada => ({
  canal,
  ultimoExitoEl: null,
  ultimoErrorEl: null,
  codigoUltimoError: null,
  credencialVencida: false,
  portalCambiado: false,
  latenciaMs: null,
  ...cambios,
});
const ayer = new Date("2026-10-29T12:00:00Z");
const hoy = new Date("2026-10-30T12:00:00Z");
const todas = { tipo: "api" as const, capacidades: CAPACIDADES };
const portal = { tipo: "portal" as const, capacidades: CAPACIDADES };

describe("agentes", () => {
  it("cada capacidad es de un solo agente y no falta ninguna", () => {
    const repartidas = AGENTES_CONECTORES.flatMap((a) => a.capacidades);
    expect([...repartidas].sort()).toEqual([...CAPACIDADES].sort());
    expect(capacidadesDelAgente(null)).toHaveLength(CAPACIDADES.length);
  });

  it("cada agente ve lo suyo", () => {
    expect(capacidadesDelAgente("cotizacion")).toEqual(["cotizar", "consultarCotizacion", "obtenerCoberturas"]);
    expect(capacidadesDelAgente("validador")).toEqual(["obtenerEstadoCobranza", "obtenerCuotas", "obtenerCancelaciones"]);
    expect(capacidadesDelAgente("siniestros")).toContain("denunciarSiniestro");
  });

  it("lee el agente de la dirección y descarta lo desconocido", () => {
    expect(agenteDe("validador")).toBe("validador");
    expect(agenteDe("cobranza")).toBeNull();
    expect(agenteDe(undefined)).toBeNull();
  });

  it("dice cuándo puede usar cada capacidad el agente solo", () => {
    expect(permisoDe("obtenerCuotas")).toBe("Automático");
    expect(permisoDe("cotizar")).toBe("Al aprobar la solicitud");
    expect(permisoDe("denunciarSiniestro")).toBe("Con tu aprobación, caso por caso");
  });
});

describe("orden de canales", () => {
  it("sin fila es automático; la lista vacía, solo correo o carga manual", () => {
    expect(modoDeCanales(undefined)).toEqual({ modo: "automatico" });
    expect(modoDeCanales([])).toEqual({ modo: "manual" });
    expect(modoDeCanales(["portal", "fax", "api", "portal"])).toEqual({ modo: "propio", canales: ["portal", "api"] });
    expect(modoDeCanales(["fax"])).toEqual({ modo: "manual" });
  });

  it("los canales en uso son los del orden que tienen conector", () => {
    expect(canalesEnUso({ modo: "automatico" }, ["portal", "api"])).toEqual(["api", "portal"]);
    expect(canalesEnUso({ modo: "propio", canales: ["portal", "archivo"] }, ["api", "portal"])).toEqual(["portal"]);
    expect(canalesEnUso({ modo: "manual" }, ["api", "portal"])).toEqual([]);
  });

  it("lo explica en palabras", () => {
    expect(textoModo({ modo: "propio", canales: ["portal", "api"] })).toBe("Portal de productores, después Conexión directa. Los demás no se usan.");
    expect(textoModo({ modo: "manual" })).toMatch(/^Solo correo o carga manual/);
  });

  it("lee el formulario: automático borra la fila, manual deja la lista vacía", () => {
    expect(leerOrdenCanales({ modo: "automatico", lugares: { api: "2" } })).toEqual({ canales: null });
    expect(leerOrdenCanales({ modo: "manual", lugares: { api: "1" } })).toEqual({ canales: [] });
  });

  it("en el orden propio ordena por lugar y saltea los que no se usan", () => {
    expect(leerOrdenCanales({ modo: "propio", lugares: { api: "2", portal: "1", archivo: "" } })).toEqual({ canales: ["portal", "api"] });
    expect(leerOrdenCanales({ modo: "propio", lugares: { archivo: "3" } })).toEqual({ canales: ["archivo"] });
  });

  it("rechaza lugares repetidos, ninguno elegido o un modo desconocido", () => {
    expect(leerOrdenCanales({ modo: "propio", lugares: { api: "1", portal: "1" } })).toEqual({ error: "Cada canal tiene que ir en un lugar distinto." });
    expect(leerOrdenCanales({ modo: "propio", lugares: { api: "7", portal: "x" } })).toHaveProperty("error");
    expect(leerOrdenCanales({ modo: "", lugares: {} })).toHaveProperty("error");
  });
});

describe("salud", () => {
  it("sin datos no se usó; con éxito después del error anda bien", () => {
    expect(estadoCanal(undefined)).toEqual({ tono: "gris", texto: "Sin uso todavía" });
    expect(estadoCanal(salud("api", { ultimoErrorEl: ayer, ultimoExitoEl: hoy })).tono).toBe("verde");
  });

  it("el último error manda si es posterior al último éxito", () => {
    expect(estadoCanal(salud("api", { ultimoExitoEl: ayer, ultimoErrorEl: hoy }))).toEqual({ tono: "ambar", texto: "Falló la última vez" });
    expect(estadoCanal(salud("api", { ultimoErrorEl: hoy })).tono).toBe("ambar");
  });

  it("la clave vencida o el portal cambiado sacan al canal de uso", () => {
    expect(estadoCanal(salud("portal", { credencialVencida: true, ultimoExitoEl: hoy })).texto).toMatch(/clave/);
    expect(estadoCanal(salud("portal", { portalCambiado: true })).tono).toBe("rojo");
  });
});

describe("resumenCompania", () => {
  it("sin conectores no hay conexión automática", () => {
    expect(resumenCompania({ modo: { modo: "automatico" }, conectores: [], salud: [], agente: null })).toEqual({ tono: "gris", texto: "Sin conexión automática" });
  });

  it("con conectores pero solo manual, lo dice", () => {
    expect(resumenCompania({ modo: { modo: "manual" }, conectores: [todas], salud: [], agente: null }).texto).toBe("Solo correo o carga manual");
  });

  it("cuenta solo los canales del orden y con capacidades del agente", () => {
    const soloCuotas = { tipo: "api" as const, capacidades: ["obtenerCuotas"] as const };
    expect(resumenCompania({ modo: { modo: "automatico" }, conectores: [soloCuotas], salud: [], agente: "cotizacion" }).tono).toBe("gris");
    expect(resumenCompania({ modo: { modo: "automatico" }, conectores: [soloCuotas], salud: [], agente: "validador" }).tono).toBe("verde");
  });

  it("avisa si un canal en uso falla y marca rojo si no anda ninguno", () => {
    const conectores = [todas, portal];
    const vencido = salud("portal", { credencialVencida: true });
    expect(resumenCompania({ modo: { modo: "automatico" }, conectores, salud: [vencido], agente: null })).toEqual({ tono: "ambar", texto: "Revisá la conexión" });
    expect(resumenCompania({ modo: { modo: "propio", canales: ["portal"] }, conectores, salud: [vencido], agente: null }).tono).toBe("rojo");
  });
});

describe("listaCompanias", () => {
  it("une las fuentes por nombre canónico, sin repetir y en orden", () => {
    expect(listaCompanias(["Sancor", "Seguros Rivadavia"], ["SANCOR SEGUROS", "Rivadavia", null, " "], ["Zurich"])).toEqual(["Rivadavia", "Sancor", "Zurich"]);
  });
});
