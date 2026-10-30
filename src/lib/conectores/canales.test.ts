import { describe, expect, it } from "vitest";
import { canalesValidos, efectoEnSalud, ejecutarConCanales, ordenarCanales, pasaAlSiguiente, type IntentoCanal } from "./canales";
import { autorizacion, conPermisos } from "./permisos";
import { crearRegistroSimulado, RegistroConectores, simulacionHabilitada } from "./registro";
import { SimuladaApi } from "./simulada-api";
import { SimuladaPortal } from "./simulada-portal";
import { ErrorConector, type Capacidad, type ConectorCompania, type DenunciaSiniestro, type TipoConector } from "./tipos";

const hoy = () => "2026-10-29";

/** Conector de prueba con solo las capacidades que se le pasan. */
function conector(tipo: TipoConector, metodos: Partial<Record<Capacidad, (...args: never[]) => Promise<unknown>>>): ConectorCompania {
  return {
    compania: "Sancor",
    tipo,
    capacidades: Object.keys(metodos) as Capacidad[],
    probarConexion: async () => ({ ok: true, latenciaMs: 1 }),
    ...metodos,
  } as ConectorCompania;
}

const falla = (codigo: ErrorConector["codigo"]) => async () => {
  throw new ErrorConector(codigo, "falla de prueba");
};
const nunca = () => new Promise<never>(() => {});

const DENUNCIA: DenunciaSiniestro = { referencia: "S-1", poliza: "P", item: null, fecha: "2026-10-27", tipo: "robo", lugar: "", relato: "", terceros: [] };

describe("ordenarCanales", () => {
  const archivo = conector("archivo", { obtenerCuotas: async () => [] });
  const portal = conector("portal", { obtenerCuotas: async () => [] });
  const api = conector("api", { obtenerCuotas: async () => [] });
  const apiSinCuotas = conector("api", { cotizar: async () => ({}) });

  it("API, después portal, después archivo; solo los que tienen la capacidad", () => {
    expect(ordenarCanales([archivo, portal, apiSinCuotas, api], "obtenerCuotas")).toEqual([api, portal, archivo]);
  });

  it("saltea los canales con la credencial vencida o el portal cambiado", () => {
    const salud = (c: ConectorCompania) => c.tipo === "api" ? { credencialVencida: true, portalCambiado: false } : c.tipo === "portal" ? { credencialVencida: false, portalCambiado: true } : undefined;
    expect(ordenarCanales([api, portal, archivo], "obtenerCuotas", salud)).toEqual([archivo]);
  });

  it("con el orden de la compañía, solo esos canales y en ese orden", () => {
    expect(ordenarCanales([archivo, portal, api], "obtenerCuotas", undefined, ["portal", "api"])).toEqual([portal, api]);
    expect(ordenarCanales([archivo, portal, api], "obtenerCuotas", undefined, ["portal"])).toEqual([portal]);
  });

  it("una lista vacía deja solo el canal manual", () => {
    expect(ordenarCanales([archivo, portal, api], "obtenerCuotas", undefined, [])).toEqual([]);
  });
});

describe("canalesValidos", () => {
  it("deja los canales conocidos, sin repetir y en su orden", () => {
    expect(canalesValidos(["portal", "correo", "api", "portal", "API"])).toEqual(["portal", "api"]);
    expect(canalesValidos([])).toEqual([]);
  });
});

describe("ejecutarConCanales", () => {
  it("si la API falla pasa al portal y registra los dos intentos", async () => {
    const registrados: IntentoCanal[] = [];
    const portal = new SimuladaPortal({ compania: "Sancor", hoy, demoraMs: 0, probabilidadFalla: 0 });
    const resultado = await ejecutarConCanales(
      [portal, conector("api", { obtenerCoberturas: falla("no_disponible") })],
      "obtenerCoberturas",
      ["Auto"],
      { registrar: async (intento) => { registrados.push(intento); } },
    );
    expect(resultado).toMatchObject({ ok: true, canal: "portal" });
    expect(registrados.map(({ canal, resultado: r, codigoError }) => [canal, r, codigoError])).toEqual([["api", "error", "no_disponible"], ["portal", "ok", null]]);
    expect(resultado.intentos).toEqual(registrados);
  });

  it("si ninguno funciona, queda el canal manual", async () => {
    const resultado = await ejecutarConCanales([conector("api", { obtenerCuotas: falla("timeout") }), conector("portal", { obtenerCuotas: falla("portal_cambiado") })], "obtenerCuotas", ["P"]);
    expect(resultado).toMatchObject({ ok: false, motivo: "manual" });
    expect(resultado.intentos).toHaveLength(2);
  });

  it("respeta el orden de la compañía: el portal antes que la API", async () => {
    let llamadasApi = 0;
    const resultado = await ejecutarConCanales(
      [conector("api", { obtenerCuotas: async () => { llamadasApi++; return []; } }), conector("portal", { obtenerCuotas: async () => [] })],
      "obtenerCuotas",
      ["P"],
      { canales: ["portal", "api"] },
    );
    expect(resultado).toMatchObject({ ok: true, canal: "portal" });
    expect(llamadasApi).toBe(0);
  });

  it("solo correo: no llama a ningún conector", async () => {
    let llamadas = 0;
    const api = conector("api", { obtenerCuotas: async () => { llamadas++; return []; } });
    expect(await ejecutarConCanales([api], "obtenerCuotas", ["P"], { canales: [] })).toEqual({ ok: false, motivo: "manual", intentos: [] });
    expect(llamadas).toBe(0);
  });

  it("sin conectores también es manual", async () => {
    expect(await ejecutarConCanales([], "obtenerCuotas", ["P"])).toEqual({ ok: false, motivo: "manual", intentos: [] });
  });

  it("si la compañía pide un dato, frena y devuelve la pregunta", async () => {
    const portal = new SimuladaPortal({ compania: "Sancor", hoy, demoraMs: 0, probabilidadFalla: 0, forzar: { datoExtra: true } });
    const otro = conector("archivo", { cotizar: async () => ({ estado: "cotizada" }) });
    const resultado = await ejecutarConCanales([portal, otro], "cotizar", [{ referencia: "S", ramo: "Auto", tipo: "nueva", riesgo: {}, codigoPostal: null, sumaAsegurada: null, moneda: "ARS", vigenciaDesde: null }, []]);
    expect(resultado).toMatchObject({ ok: false, motivo: "requiere_dato", canal: "portal", campo: "uso", pregunta: expect.stringContaining("uso del vehículo") });
    expect(resultado.intentos).toHaveLength(1);
  });

  it("si no encuentra la póliza no prueba otro canal", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    const portal = conector("portal", { verificarPoliza: async () => ({}) });
    expect(await ejecutarConCanales([api, portal], "verificarPoliza", ["NO-EXISTE", "2026-10-29"])).toMatchObject({ ok: false, motivo: "no_encontrado", canal: "api" });
  });

  it("una lectura que tarda de más pasa al siguiente canal", async () => {
    const resultado = await ejecutarConCanales(
      [conector("api", { obtenerCuotas: nunca }), conector("portal", { obtenerCuotas: async () => [] })],
      "obtenerCuotas",
      ["P"],
      { tiempoMaximoMs: { api: 10 } },
    );
    expect(resultado).toMatchObject({ ok: true, canal: "portal" });
    expect(resultado.intentos[0].codigoError).toBe("timeout");
  });

  it("un envío que tarda de más queda incierto y no se repite por otro canal", async () => {
    let enviosPorPortal = 0;
    const resultado = await ejecutarConCanales(
      [conector("api", { denunciarSiniestro: nunca }), conector("portal", { denunciarSiniestro: async () => { enviosPorPortal++; return { numeroSiniestro: "X" }; } })],
      "denunciarSiniestro",
      [DENUNCIA],
      { tiempoMaximoMs: { api: 10 } },
    );
    expect(resultado).toMatchObject({ ok: false, motivo: "incierto", canal: "api" });
    expect(enviosPorPortal).toBe(0);
  });
});

describe("pasaAlSiguiente y efectoEnSalud", () => {
  it("para envíos, solo sigue si es seguro que no salió nada", () => {
    expect(pasaAlSiguiente("no_disponible", "denunciarSiniestro")).toBe(true);
    expect(pasaAlSiguiente("timeout", "subirDocumentos")).toBe("incierto");
    expect(pasaAlSiguiente("timeout", "obtenerCuotas")).toBe(true);
    expect(pasaAlSiguiente("sin_permiso", "cotizar")).toBe(false);
  });

  it("pedir un dato o no encontrar algo no es una falla del canal", () => {
    const intento = (codigoError: IntentoCanal["codigoError"]): IntentoCanal => ({ compania: "Sancor", canal: "api", operacion: "cotizar", resultado: codigoError ? "error" : "ok", codigoError, duracionMs: 5 });
    expect(efectoEnSalud(intento(null))).toBe("exito");
    expect(efectoEnSalud(intento("requiere_dato"))).toBe("exito");
    expect(efectoEnSalud(intento("credencial_vencida"))).toBe("falla");
    expect(efectoEnSalud(intento("sin_permiso"))).toBeNull();
  });
});

describe("permisos", () => {
  const aprobacion = { id: "ap-1", capacidad: "denunciarSiniestro" as const, aprobadoPor: "productor", aprobadoEl: new Date() };

  it("leer no necesita autorización; cotizar sí", async () => {
    const api = conPermisos(new SimuladaApi({ compania: "Sancor", hoy }), autorizacion());
    expect((await api.obtenerCoberturas!("Auto")).length).toBeGreaterThan(0);
    await expect(api.cotizar!({ referencia: "S", ramo: "Auto", tipo: "nueva", riesgo: {}, codigoPostal: null, sumaAsegurada: null, moneda: "ARS", vigenciaDesde: null }, []))
      .rejects.toMatchObject({ codigo: "sin_permiso" });
    const autorizado = conPermisos(new SimuladaApi({ compania: "Sancor", hoy }), autorizacion({ cotizar: { solicitudId: 1, motivo: "aprobada" } }));
    expect((await autorizado.cotizar!({ referencia: "S", ramo: "Auto", tipo: "nueva", riesgo: {}, codigoPostal: null, sumaAsegurada: null, moneda: "ARS", vigenciaDesde: null }, [])).estado).toBe("cotizada");
  });

  it("cada aprobación sirve para un solo envío y de su tipo", async () => {
    const enviado = conector("api", { denunciarSiniestro: async () => ({ numeroSiniestro: "N-1" }), subirDocumentos: async () => ({ recibidos: [], rechazados: [] }) });
    const permisos = autorizacion({ envios: [aprobacion] });
    const api = conPermisos(enviado, permisos);
    await expect(api.subirDocumentos!("N-1", [])).rejects.toMatchObject({ codigo: "sin_permiso" });
    expect(await api.denunciarSiniestro!(DENUNCIA)).toEqual({ numeroSiniestro: "N-1" });
    await expect(api.denunciarSiniestro!(DENUNCIA)).rejects.toMatchObject({ codigo: "sin_permiso" });
  });

  it("un canal caído no gasta la aprobación y el siguiente la usa", async () => {
    const permisos = autorizacion({ envios: [aprobacion] });
    const conectores = [
      conector("api", { denunciarSiniestro: falla("no_disponible") }),
      conector("portal", { denunciarSiniestro: async () => ({ numeroSiniestro: "N-2" }) }),
    ].map((c) => conPermisos(c, permisos));
    expect(await ejecutarConCanales(conectores, "denunciarSiniestro", [DENUNCIA])).toMatchObject({ ok: true, canal: "portal", valor: { numeroSiniestro: "N-2" } });
    expect(permisos.usadas.has("ap-1")).toBe(true);
    expect(await ejecutarConCanales(conectores, "denunciarSiniestro", [DENUNCIA])).toMatchObject({ ok: false, motivo: "sin_permiso" });
  });

  it("no expone métodos que no son capacidades", () => {
    const conAcciones = { ...conector("api", { obtenerCuotas: async () => [] }), emitirPoliza: async () => "emitida" };
    expect("emitirPoliza" in conPermisos(conAcciones, autorizacion())).toBe(false);
  });
});

describe("registro", () => {
  it("sin conectores registrados no hay canales", () => {
    expect(new RegistroConectores().conectoresPara("Sancor")).toEqual([]);
  });

  it("el registro simulado reutiliza las instancias por compañía", async () => {
    const registro = crearRegistroSimulado({ api: { modo: "dos_pasos", hoy }, portal: { demoraMs: 0, hoy } });
    const [api, portal] = registro.conectoresPara("Sancor");
    expect([api.tipo, portal.tipo]).toEqual(["api", "portal"]);
    const pedido = await api.cotizar!({ referencia: "S", ramo: "Auto", tipo: "nueva", riesgo: {}, codigoPostal: null, sumaAsegurada: null, moneda: "ARS", vigenciaDesde: null }, []);
    const [mismaApi] = registro.conectoresPara("Sancor");
    expect((await mismaApi.consultarCotizacion!(pedido.numero)).estado).toBe("cotizada");
  });

  it("la simulación se prende con la variable y nunca en producción", () => {
    expect(simulacionHabilitada({})).toBe(false);
    expect(simulacionHabilitada({ CONECTORES_SIMULADOS: "1" })).toBe(true);
    expect(simulacionHabilitada({ CONECTORES_SIMULADOS: "1", VERCEL_ENV: "production" })).toBe(false);
  });
});
