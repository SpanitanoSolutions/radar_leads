import { describe, expect, it } from "vitest";
import type { IntentoEnvio } from "@/db/schema";
import type { IntentoCanal, ResultadoCanales } from "@/lib/conectores/canales";
import type { RespuestaCotizacion } from "@/lib/conectores/tipos";
import {
  agotoConsultas,
  campoDePregunta,
  datoPedido,
  decidirCotizacion,
  elegibleParaCotizar,
  estadoEnvioVisible,
  intentosDeEnvio,
  numeroDe,
  puedeCotizarse,
  respuestaValida,
  solicitudParaConector,
  textoDecision,
  textoFallas,
} from "./orquestador";

const FECHA = "2026-10-30T13:00:00.000Z";
const intento = (canal: IntentoCanal["canal"], codigoError: IntentoCanal["codigoError"] = null): IntentoCanal => ({
  compania: "Sancor", canal, operacion: "cotizar", resultado: codigoError ? "error" : "ok", codigoError, duracionMs: 10,
});
const COTIZADA: Extract<RespuestaCotizacion, { estado: "cotizada" }> = {
  estado: "cotizada",
  numero: "SAN-COT-100200",
  primaNeta: 500_000,
  premio: 655_000,
  moneda: "ARS",
  coberturas: [{ codigo: "D", nombre: "Todo riesgo con franquicia", franquicia: "$ 350.000" }],
  vigencia: { desde: "2026-11-01", hasta: "2027-11-01" },
  validaHasta: "2026-11-14",
};
const ok = (valor: RespuestaCotizacion, intentos = [intento("api")]): ResultadoCanales<RespuestaCotizacion> => ({ ok: true, valor, canal: intentos.at(-1)!.canal, intentos });
const ENVIO = { estado: "pendiente", estadoBorrador: "pendiente", canalUsado: null, numeroCompania: null, ultimoError: null, preguntasPendientes: null, intentos: [] as IntentoEnvio[] };

describe("solicitudParaConector", () => {
  it("lleva la solicitud a los nombres de UNIQO que entiende el conector", () => {
    const pedido = solicitudParaConector({
      numero: 1043,
      ramo: "Automotor",
      tipo: "negocio_nuevo",
      datosRiesgo: { marca: "Toyota", anio: "2022", codigoPostal: "7600", sumaAsegurada: "12.000.000", conGnc: false },
    });
    expect(pedido).toEqual({
      referencia: "1043",
      ramo: "Auto",
      tipo: "nueva",
      riesgo: { marca: "Toyota", anio: "2022", codigoPostal: "7600", sumaAsegurada: "12.000.000", conGnc: "no" },
      codigoPostal: "7600",
      sumaAsegurada: 12_000_000,
      moneda: "ARS",
      vigenciaDesde: null,
    });
  });

  it("una renovación sigue siendo renovación, y sin código postal queda null", () => {
    expect(solicitudParaConector({ numero: 1, ramo: "Flotas", tipo: "renovacion", datosRiesgo: { codigoPostal: "" } }))
      .toMatchObject({ ramo: "Flota", tipo: "renovacion", codigoPostal: null, sumaAsegurada: null });
  });

  it("lee montos escritos de varias maneras", () => {
    expect(numeroDe("1500000,50")).toBe(1_500_000.5);
    expect(numeroDe("$ 2.500.000")).toBe(2_500_000);
    expect(numeroDe(800_000)).toBe(800_000);
    expect(numeroDe("a convenir")).toBeNull();
    expect(numeroDe("0")).toBeNull();
  });
});

describe("decidirCotizacion", () => {
  it("cotizada: el resultado con el formato de la carga manual", () => {
    const decision = decidirCotizacion("Sancor", ok(COTIZADA));
    expect(decision).toEqual({
      tipo: "cotizada",
      canal: "api",
      numero: "SAN-COT-100200",
      resultado: {
        precio: 655_000,
        primaNeta: 500_000,
        impuestos: 155_000,
        moneda: "ARS",
        franquicia: "$ 350.000",
        vigencia: "01/11/2026 al 01/11/2027",
        condiciones: "Cotización SAN-COT-100200, válida hasta el 14/11/2026.",
        coberturas: [{ nombre: "Todo riesgo con franquicia", valor: "Franquicia $ 350.000", incluida: true }],
      },
    });
  });

  it("pendiente y rechazada guardan el número de la compañía", () => {
    expect(decidirCotizacion("Sancor", ok({ estado: "pendiente", numero: "SAN-COT-1" }))).toEqual({ tipo: "pendiente", canal: "api", numero: "SAN-COT-1" });
    expect(decidirCotizacion("Sancor", ok({ estado: "rechazada", numero: "SAN-COT-2", motivo: "No cotiza ese modelo." }, [intento("portal")])))
      .toEqual({ tipo: "rechazada", canal: "portal", numero: "SAN-COT-2", motivo: "No cotiza ese modelo." });
  });

  it("el dato pedido trae su campo; si el conector no lo dice, se arma uno con la pregunta", () => {
    const pregunta = "El portal pide el uso del vehículo: particular o comercial.";
    const conCampo: ResultadoCanales<RespuestaCotizacion> = { ok: false, motivo: "requiere_dato", pregunta, campo: "uso", canal: "portal", intentos: [intento("portal", "requiere_dato")] };
    expect(decidirCotizacion("Rivadavia", conCampo)).toEqual({ tipo: "requiere_dato", canal: "portal", pregunta, campo: "uso" });
    const sinCampo: ResultadoCanales<RespuestaCotizacion> = { ok: false, motivo: "requiere_dato", pregunta: "¿Tiene alarma?", canal: "portal", intentos: [intento("portal", "requiere_dato")] };
    expect(decidirCotizacion("Rivadavia", sinCampo)).toMatchObject({ campo: "dato_tiene_alarma" });
  });

  it("sin conexión automática queda el correo sin error", () => {
    expect(decidirCotizacion("La Segunda", { ok: false, motivo: "manual", intentos: [] })).toEqual({ tipo: "correo", error: null });
  });

  it("si fallan todos los canales queda el correo con lo que pasó en cada uno", () => {
    const r: ResultadoCanales<RespuestaCotizacion> = { ok: false, motivo: "manual", intentos: [intento("api", "timeout"), intento("portal", "no_disponible")] };
    expect(decidirCotizacion("Sancor", r)).toEqual({ tipo: "correo", error: "La conexión directa de Sancor no respondió a tiempo y el portal no está disponible." });
  });

  it("sin permiso también deja el correo, y lo dice", () => {
    const r: ResultadoCanales<RespuestaCotizacion> = { ok: false, motivo: "sin_permiso", canal: "portal", intentos: [intento("portal", "sin_permiso")] };
    expect(decidirCotizacion("Sancor", r)).toEqual({ tipo: "correo", error: "El portal de Sancor no tenía tu autorización para cotizar." });
  });
});

describe("textos", () => {
  it("el evento del portal caído dice que quedó el correo", () => {
    expect(textoDecision("Federación Patronal", { tipo: "correo", error: "El portal de Federación Patronal no está disponible." }))
      .toBe("El portal de Federación Patronal no está disponible; se preparó el correo para aprobar.");
    expect(textoDecision("La Segunda", { tipo: "correo", error: null })).toBe("No hay conexión automática disponible con La Segunda: queda el correo para aprobar.");
  });

  it("la cotización que tarda dice cuándo se consulta", () => {
    expect(textoDecision("Sancor", { tipo: "pendiente", canal: "api", numero: "SAN-COT-1" }, { proximaConsulta: "04/11/2026" }))
      .toBe("Se pidió la cotización a Sancor por conexión directa (número SAN-COT-1). El agente la consulta el 04/11/2026.");
  });

  it("sin fallas no hay texto de falla", () => {
    expect(textoFallas("Sancor", ok(COTIZADA))).toBeNull();
  });
});

describe("intentosDeEnvio", () => {
  it("cada canal con su resultado; el motivo del rechazo queda en el detalle", () => {
    const r = ok({ estado: "rechazada", numero: "X", motivo: "No cotiza ese modelo." }, [intento("api", "timeout"), intento("portal")]);
    expect(intentosDeEnvio(r, FECHA)).toEqual([
      { canal: "api", resultado: "error", codigo: "timeout", fecha: FECHA },
      { canal: "portal", resultado: "rechazada", detalle: "No cotiza ese modelo.", fecha: FECHA },
    ]);
  });

  it("el dato pedido queda con su campo y su pregunta", () => {
    const r: ResultadoCanales<RespuestaCotizacion> = { ok: false, motivo: "requiere_dato", pregunta: "¿Uso?", campo: "uso", canal: "portal", intentos: [intento("portal", "requiere_dato")] };
    expect(intentosDeEnvio(r, FECHA)).toEqual([{ canal: "portal", resultado: "requiere_dato", codigo: "requiere_dato", campo: "uso", detalle: "¿Uso?", fecha: FECHA }]);
  });
});

describe("cuándo se cotiza", () => {
  it("Aprobar y cotizar incluye solo lo que no salió y no se omitió", () => {
    expect(elegibleParaCotizar({ estado: "pendiente", estadoBorrador: "pendiente" })).toBe(true);
    expect(elegibleParaCotizar({ estado: "pendiente", estadoBorrador: "omitido" })).toBe(false);
    expect(elegibleParaCotizar({ estado: "enviado", estadoBorrador: "aprobado" })).toBe(false);
  });

  it("el trabajo no cotiza si mientras tanto se aprobó el correo o se cerró la solicitud", () => {
    const abierta = { estado: "esperando", completadoEl: null };
    expect(puedeCotizarse({ estado: "pendiente", estadoBorrador: "pendiente" }, abierta)).toBe(true);
    expect(puedeCotizarse({ estado: "pendiente", estadoBorrador: "aprobado" }, abierta)).toBe(false);
    expect(puedeCotizarse({ estado: "enviado", estadoBorrador: "omitido" }, abierta)).toBe(false);
    expect(puedeCotizarse({ estado: "pendiente", estadoBorrador: "pendiente" }, { estado: "ganada", completadoEl: null })).toBe(false);
    expect(puedeCotizarse({ estado: "pendiente", estadoBorrador: "pendiente" }, { estado: "esperando", completadoEl: new Date() })).toBe(false);
  });

  it("las consultas paran en el máximo de seguimientos", () => {
    expect(agotoConsultas(0, 3)).toBe(false);
    expect(agotoConsultas(2, 3)).toBe(true);
  });
});

describe("el dato que pidió la compañía", () => {
  const pedido: IntentoEnvio = { canal: "portal", resultado: "requiere_dato", codigo: "requiere_dato", campo: "uso", detalle: "¿Uso?", fecha: FECHA };

  it("se ofrece responder solo mientras el envío lo espera", () => {
    expect(datoPedido({ estado: "requiere_atencion", intentos: [pedido] })).toEqual({ campo: "uso", pregunta: "¿Uso?" });
    expect(datoPedido({ estado: "pendiente", intentos: [pedido] })).toBeNull();
    expect(datoPedido({ estado: "requiere_atencion", intentos: [] })).toBeNull();
  });

  it("la respuesta se limpia y no puede quedar vacía", () => {
    expect(respuestaValida("  particular \n")).toBe("particular");
    expect(respuestaValida("   ")).toBeNull();
    expect(respuestaValida("x".repeat(300))).toHaveLength(200);
  });

  it("el campo armado con la pregunta es corto y sin acentos", () => {
    expect(campoDePregunta("¿Qué uso tiene el vehículo?")).toBe("dato_que_uso_tiene_el_vehiculo");
    expect(campoDePregunta("???")).toBe("dato_pedido");
  });
});

describe("estadoEnvioVisible", () => {
  it("mientras cotiza, lo dice", () => {
    expect(estadoEnvioVisible(ENVIO, { cotizando: true }).texto).toBe("Cotizando por conexión directa o portal…");
  });

  it("lo que cotizó por un canal espera la confirmación", () => {
    expect(estadoEnvioVisible({ ...ENVIO, canalUsado: "api" }, { resultado: { confirmado: false } }))
      .toEqual({ texto: "Cotizó por conexión directa", detalle: "Falta tu confirmación en Cotizaciones." });
    expect(estadoEnvioVisible({ ...ENVIO, estado: "cotizado", canalUsado: "portal" }, { resultado: { confirmado: true } }).texto).toBe("Cotizado por portal");
  });

  it("rechazada con el motivo, y el dato pedido con la pregunta", () => {
    const rechazo: IntentoEnvio = { canal: "api", resultado: "rechazada", detalle: "No cotiza ese modelo.", fecha: FECHA };
    expect(estadoEnvioVisible({ ...ENVIO, estado: "rechazado", intentos: [rechazo] })).toEqual({ texto: "Rechazada", detalle: "No cotiza ese modelo." });
    expect(estadoEnvioVisible({ ...ENVIO, estado: "requiere_atencion", preguntasPendientes: "¿Uso?" })).toEqual({ texto: "Requiere atención", detalle: "¿Uso?" });
  });

  it("una cotización que tarda muestra el número de la compañía", () => {
    expect(estadoEnvioVisible({ ...ENVIO, estado: "enviado", canalUsado: "api", numeroCompania: "SAN-COT-1" }))
      .toEqual({ texto: "Pedida por conexión directa", detalle: "Esperando la cotización número SAN-COT-1." });
  });

  it("si el portal falló, el pendiente muestra por qué y el correo aprobado sin salir también", () => {
    expect(estadoEnvioVisible({ ...ENVIO, ultimoError: "El portal de Sancor no está disponible." }))
      .toEqual({ texto: "Pendiente", detalle: "El portal de Sancor no está disponible." });
    expect(estadoEnvioVisible({ ...ENVIO, estadoBorrador: "aprobado", ultimoError: "No salió: tu correo no está conectado." }))
      .toEqual({ texto: "Correo aprobado, sin enviar", detalle: "No salió: tu correo no está conectado." });
    expect(estadoEnvioVisible({ ...ENVIO, estado: "enviado", canalUsado: "correo", estadoBorrador: "aprobado" }).texto).toBe("Enviado por correo");
  });
});
