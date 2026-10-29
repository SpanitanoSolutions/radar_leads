import { describe, expect, it } from "vitest";
import { SimuladaApi } from "./simulada-api";
import { DATO_EXTRA_COTIZAR, SimuladaPortal } from "./simulada-portal";
import { ErrorConector, type DenunciaSiniestro, type SolicitudCotizacionConector } from "./tipos";

const HOY = "2026-10-29";
const hoy = () => HOY;

const SOLICITUD: SolicitudCotizacionConector = {
  referencia: "SOL-7",
  ramo: "Auto",
  tipo: "renovacion",
  riesgo: { marca: "Volkswagen", modelo: "Gol Trend", anio: 2019 },
  codigoPostal: "7600",
  sumaAsegurada: null,
  moneda: "ARS",
  vigenciaDesde: null,
};

async function codigoDeError(promesa: Promise<unknown>) {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error instanceof ErrorConector ? error.codigo : "otro";
  }
}

describe("SimuladaApi", () => {
  it("cotiza al instante", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    expect(await api.cotizar(SOLICITUD, ["C"])).toMatchObject({ estado: "cotizada", numero: expect.stringMatching(/^SAN-COT-\d+$/), moneda: "ARS" });
  });

  it("en dos pasos, la cotización llega al consultarla", async () => {
    const api = new SimuladaApi({ compania: "Sancor", modo: "dos_pasos", hoy });
    const pedido = await api.cotizar(SOLICITUD, ["C"]);
    expect(pedido.estado).toBe("pendiente");
    expect(await api.consultarCotizacion(pedido.numero)).toMatchObject({ estado: "cotizada", numero: pedido.numero });
    expect(await codigoDeError(api.consultarCotizacion("SAN-COT-0"))).toBe("no_encontrado");
  });

  it("informa la cobranza del período, flota y dólares incluidos", async () => {
    const api = new SimuladaApi({ compania: "Federación Patronal", hoy });
    const pagos = await api.obtenerEstadoCobranza("2026-10-01", "2026-10-31");
    expect(pagos.length).toBeGreaterThan(0);
    expect(pagos.every((pago) => pago.compania === "Federación Patronal" && pago.poliza.startsWith("FP-"))).toBe(true);
    expect(pagos.some((pago) => pago.item === "Ítem 3" && pago.endoso === "1")).toBe(true);
    expect(pagos.some((pago) => pago.moneda === "USD")).toBe(true);
    expect(pagos.some((pago) => pago.estadoCompania === "vencida")).toBe(true);
  });

  it("devuelve las cuotas de todos los ítems de una flota", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    const flota = (await api.obtenerEstadoCobranza("2026-01-01", "2027-12-31")).find((pago) => pago.item)!.poliza;
    expect(await api.obtenerCuotas(flota)).toHaveLength(36);
    expect(await codigoDeError(api.obtenerCuotas("NO-EXISTE"))).toBe("no_encontrado");
  });

  it("verifica la póliza en la fecha del hecho", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    const [anulada] = await api.obtenerCancelaciones("2026-01-01", HOY);
    expect(await api.verificarPoliza(anulada.poliza, HOY)).toMatchObject({ estado: "anulada", deudaVencida: true });
    expect(await api.verificarPoliza(anulada.poliza, "2026-06-15")).toMatchObject({ estado: "vigente", deudaVencida: false });
    expect(await api.verificarPoliza(anulada.poliza, "2026-01-15")).toMatchObject({ estado: "no_vigente" });
  });

  it("acompaña el trámite del siniestro y frena hasta que llegan los documentos", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    const [{ poliza }] = await api.obtenerEstadoCobranza("2026-10-01", "2026-10-31");
    const denuncia: DenunciaSiniestro = {
      referencia: "SIN-3", poliza, item: null, fecha: "2026-10-27T18:30:00-03:00", tipo: "choque_tercero",
      lugar: "Av. Colón y Jara, Mar del Plata", relato: "Choque en la esquina", terceros: [{ patente: "AB123CD", compania: "Rivadavia" }],
    };
    const { numeroSiniestro } = await api.denunciarSiniestro(denuncia);
    const estados = [];
    for (let i = 0; i < 4; i++) estados.push((await api.consultarSiniestro(numeroSiniestro)).estado);
    expect(estados).toEqual(["denunciado", "en_analisis", "requiere_documentacion", "requiere_documentacion"]);

    const subida = await api.subirDocumentos(numeroSiniestro, [
      { nombre: "presupuesto.pdf", tipoMime: "application/pdf", contenido: Buffer.from("%PDF") },
      { nombre: "relato.docx", tipoMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contenido: Buffer.from("x") },
    ]);
    expect(subida.recibidos).toEqual([{ nombre: "presupuesto.pdf", referencia: `${numeroSiniestro}-DOC-1` }]);
    expect(subida.rechazados.map((rechazado) => rechazado.nombre)).toEqual(["relato.docx"]);

    expect((await api.consultarSiniestro(numeroSiniestro)).estado).toBe("en_inspeccion");
    expect(await api.consultarSiniestro(numeroSiniestro)).toMatchObject({ estado: "liquidado", moneda: "ARS", montoLiquidado: expect.any(Number) });
    const [constancia] = await api.descargarDocumentos(numeroSiniestro);
    expect(constancia.tipoMime).toBe("application/pdf");
    expect(constancia.contenido.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("no acepta denuncias de pólizas que no conoce", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    const denuncia = { referencia: "x", poliza: "NO-EXISTE", item: null, fecha: HOY, tipo: "robo", lugar: "", relato: "", terceros: [] };
    expect(await codigoDeError(api.denunciarSiniestro(denuncia))).toBe("no_encontrado");
  });

  it("detecta la credencial vencida al probar la conexión", async () => {
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    expect(await api.probarConexion({ usuario: "pas", secreto: "vencida" })).toEqual({ ok: false, codigo: "credencial_vencida" });
    expect((await api.probarConexion({ usuario: "pas", secreto: "ok" })).ok).toBe(true);
  });
});

describe("SimuladaPortal", () => {
  const sinSorpresas = { compania: "Sancor", hoy, demoraMs: 0, probabilidadFalla: 0, probabilidadDatoExtra: 0 };

  it("sin fallas devuelve los mismos datos que la API", async () => {
    const portal = new SimuladaPortal(sinSorpresas);
    const api = new SimuladaApi({ compania: "Sancor", hoy });
    expect(portal.tipo).toBe("portal");
    expect(await portal.obtenerEstadoCobranza("2026-10-01", "2026-10-31")).toEqual(await api.obtenerEstadoCobranza("2026-10-01", "2026-10-31"));
  });

  it("tarda lo que se le indica", async () => {
    const portal = new SimuladaPortal({ ...sinSorpresas, demoraMs: 40 });
    const inicio = Date.now();
    await portal.obtenerCoberturas("Auto");
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(35);
  });

  it("puede forzarse una falla", async () => {
    const portal = new SimuladaPortal({ ...sinSorpresas, forzar: { falla: "portal_cambiado" } });
    expect(await codigoDeError(portal.obtenerCuotas("x"))).toBe("portal_cambiado");
    expect(await portal.probarConexion()).toEqual({ ok: false, codigo: "portal_cambiado" });
  });

  it("al cotizar pide el uso del vehículo si falta, y no si viene en la solicitud", async () => {
    const portal = new SimuladaPortal({ ...sinSorpresas, forzar: { datoExtra: true } });
    const error = await portal.cotizar(SOLICITUD, ["C"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorConector);
    expect(error).toMatchObject({ codigo: "requiere_dato", pregunta: DATO_EXTRA_COTIZAR.pregunta });
    const conUso = { ...SOLICITUD, riesgo: { ...SOLICITUD.riesgo, uso: "particular" } };
    expect((await portal.cotizar(conUso, ["C"])).estado).toBe("cotizada");
  });

  it("con la misma semilla falla siempre en los mismos pasos", async () => {
    const corrida = async () => {
      const portal = new SimuladaPortal({ compania: "Sancor", hoy, demoraMs: 0, probabilidadFalla: 0.5, semilla: 7 });
      const codigos = [];
      for (let i = 0; i < 12; i++) codigos.push(await codigoDeError(portal.obtenerCoberturas("Auto")));
      return codigos;
    };
    const primera = await corrida();
    expect(await corrida()).toEqual(primera);
    expect(primera.some((codigo) => codigo === null)).toBe(true);
    expect(primera.some((codigo) => codigo !== null)).toBe(true);
  });
});
