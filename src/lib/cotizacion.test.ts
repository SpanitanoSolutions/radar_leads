import { describe, expect, it } from "vitest";
import { agregarRespuesta, describirEstrategia, estadoVisible, estaCerrada, filtrarSolicitudes, interpretarEstrategiaSeguimiento, mejorCotizacion, mejorResultadoConfirmado, porcentajeCerrados, resumenCotizacion, soloConfirmadas, sumarDiasHabiles, validarCuitCuil, validarDatosRiesgo, validarCotizacionContraSolicitud, type SolicitudParaLista } from "./cotizacion";

const solicitudes: SolicitudParaLista[] = [
  { numero: 1042, cliente: "Gómez, Lucía", ramo: "Auto", bien: "Peugeot 208", origen: "whatsapp", estado: "lista", cotizaciones: [{ compania: "Sancor", precio: 912000 }, { compania: "Mapfre", precio: 958000 }] },
  { numero: 1041, cliente: "Transportes Del Atlántico SRL", ramo: "Flota", bien: "3 camiones", origen: "email", estado: "esperando", cotizaciones: [{ compania: "Mapfre", precio: 8640000 }, { compania: "Sancor", precio: null }] },
  { numero: 1040, cliente: "Logística Atlántica SRL", ramo: "Flota", bien: "2 camiones", origen: "manual", estado: "atencion", cotizaciones: [] },
  { numero: 1039, cliente: "Acosta, Valeria", ramo: "Auto", bien: "Chevrolet Onix", origen: "whatsapp", estado: "enviada", cotizaciones: [{ compania: "Federación Patronal", precio: 1140000 }] },
  { numero: 1037, cliente: "Distribuidora Tito Hnos. SRL", ramo: "Integral de comercio", bien: "Depósito", origen: "whatsapp", estado: "ganada", cotizaciones: [{ compania: "Mapfre", precio: 1610000 }] },
];

describe("cotización", () => {
  it("filtra por cliente sin tildes, estado, ramo y origen", () => {
    expect(filtrarSolicitudes(solicitudes, { q: "gomez" }).map((s) => s.numero)).toEqual([1042]);
    expect(filtrarSolicitudes(solicitudes, { estado: "atencion", ramo: "Flota" }).map((s) => s.numero)).toEqual([1040]);
    expect(filtrarSolicitudes(solicitudes, { origen: "email" }).map((s) => s.numero)).toEqual([1041]);
    expect(filtrarSolicitudes(solicitudes, { q: "1040" }).map((s) => s.numero)).toEqual([1040]);
  });

  it("elige el menor precio recibido e ignora las compañías que no respondieron", () => {
    expect(mejorCotizacion(solicitudes[0].cotizaciones)).toEqual({ compania: "Sancor", precio: 912000 });
    expect(mejorCotizacion([{ compania: "Sancor", precio: null }])).toBeNull();
  });

  it("el mejor precio sale solo de las respuestas confirmadas", () => {
    const resultados = [
      { envioId: 1, primaTotal: 800_000, confirmado: false },
      { envioId: 2, primaTotal: 912_000, confirmado: true },
      { envioId: 3, primaTotal: 958_000, confirmado: true },
    ];
    expect(mejorResultadoConfirmado(resultados)?.envioId).toBe(2);
    expect(mejorResultadoConfirmado([{ envioId: 1, primaTotal: 800_000, confirmado: false }])).toBeNull();
  });

  it("la lista deja como pendiente el precio que falta confirmar", () => {
    const cotizaciones = [{ compania: "Sancor", precio: 800_000 }, { compania: "Mapfre", precio: 958_000 }];
    const lista = soloConfirmadas(cotizaciones, ["Sancor"]);
    expect(lista).toEqual([{ compania: "Sancor", precio: null }, { compania: "Mapfre", precio: 958_000 }]);
    expect(mejorCotizacion(lista)).toEqual({ compania: "Mapfre", precio: 958_000 });
    expect(soloConfirmadas(cotizaciones, [])).toEqual(cotizaciones);
  });

  it("al confirmar una respuesta recalcula la comparativa, el estado y la nota", () => {
    const solicitud = { companias: ["Sancor", "Mapfre"], cotizaciones: [{ compania: "Sancor", precio: null }, { compania: "Mapfre", precio: null }] };
    const primera = agregarRespuesta(solicitud, { compania: "Sancor", precio: 912_000, origen: "manual" }, "2026-10-30T13:00:00.000Z");
    expect(primera.estado).toBe("esperando");
    expect(primera.pendientes).toEqual(["Mapfre"]);
    expect(primera.nota).toBe("Respuesta recibida de Sancor. Pendiente: Mapfre.");
    expect(primera.cotizaciones).toContainEqual({ compania: "Sancor", precio: 912_000, recibidaEl: "2026-10-30T13:00:00.000Z", estado: "recibida", origen: "manual" });
    const segunda = agregarRespuesta({ companias: solicitud.companias, cotizaciones: primera.cotizaciones }, { compania: "Mapfre", precio: 958_000, observacion: "Con granizo", origen: "portal" }, "2026-10-30T14:00:00.000Z");
    expect(segunda.estado).toBe("lista");
    expect(segunda.nota).toBe("Ya llegaron todas las respuestas; comparativa lista.");
    expect(segunda.cotizaciones.filter((cotizacion) => cotizacion.compania === "Mapfre")).toHaveLength(1);
  });

  it("el porcentaje del detalle cuenta los envíos cerrados: cotizados, rechazados y con error", () => {
    expect(porcentajeCerrados([{ estado: "cotizado" }, { estado: "rechazado" }, { estado: "error" }, { estado: "enviado" }])).toBe(75);
    expect(porcentajeCerrados([{ estado: "cotizado" }, { estado: "en_seguimiento" }, { estado: "requiere_atencion" }])).toBe(33);
    expect(porcentajeCerrados([{ estado: "pendiente" }])).toBe(0);
    expect(porcentajeCerrados([])).toBe(0);
  });

  it("cuenta solicitudes activas, atención, cotizaciones y cierres", () => {
    expect(resumenCotizacion(solicitudes)).toEqual({ activas: 4, atencion: 1, delMes: 5, recibidas: 5, ganadas: 1, cerradas: 1 });
  });

  it("una solicitud completada cuenta como cerrada sin perder su estado guardado", () => {
    const completada = { ...solicitudes[2], completadoEl: new Date("2026-10-30T15:00:00Z") };
    expect(completada.estado).toBe("atencion");
    expect(estadoVisible(completada)).toBe("completada");
    expect(estaCerrada(completada)).toBe(true);
    // Ganada y perdida se siguen mostrando como tales aunque también estén completadas.
    expect(estadoVisible({ ...solicitudes[4], completadoEl: new Date() })).toBe("ganada");
    expect(estaCerrada(solicitudes[1])).toBe(false);

    const conCompletada = [...solicitudes.filter((s) => s.numero !== 1040), completada];
    expect(resumenCotizacion(conCompletada)).toMatchObject({ activas: 3, atencion: 0, delMes: 5 });
    expect(filtrarSolicitudes(conCompletada, { estado: "completada" }).map((s) => s.numero)).toEqual([1040]);
    expect(filtrarSolicitudes(conCompletada, { estado: "atencion" })).toEqual([]);
  });

  it("valida CUIT/CUIL argentino y datos obligatorios del riesgo", () => {
    expect(validarCuitCuil("20-12345678-6")).toBe(true);
    expect(validarCuitCuil("20-12345678-9")).toBe(false);
    expect(validarDatosRiesgo("Automotor", { marca: "Ford", modelo: "Ka", anio: "2020", uso: "particular", codigoPostal: "7600" })).toEqual([]);
    expect(validarDatosRiesgo("Automotor", { marca: "Ford", modelo: "Ka", anio: "2020", uso: "particular", codigoPostal: "7600", cuitCuil: "20-12345678-8" })).toContain("El CUIT/CUIL no es válido.");
  });

  it("interpreta frecuencias simples y saltea fines de semana y feriados", () => {
    expect(interpretarEstrategiaSeguimiento("Cada 3 días hábiles; para Flotas cada 1 día hábil; si ya hay folio, esperar"))
      .toEqual({ intervaloDiasHabiles: 3, porRamo: { flotas: 1 }, esperarConFolio: true });
    expect(interpretarEstrategiaSeguimiento("cada dos días hábiles")).toBeNull();
    // La regla de un ramo no se toma como la general, aunque vaya primero.
    expect(interpretarEstrategiaSeguimiento("Para Flotas cada 1 día hábil; cada 3 días hábiles"))
      .toEqual({ intervaloDiasHabiles: 3, porRamo: { flotas: 1 }, esperarConFolio: false });
    expect(interpretarEstrategiaSeguimiento("Para Flotas cada 1 día"))
      .toEqual({ intervaloDiasHabiles: 3, porRamo: { flotas: 1 }, esperarConFolio: false });
    expect(describirEstrategia(interpretarEstrategiaSeguimiento("Cada 2 días hábiles; para Flotas cada 1 día hábil; si ya hay folio, esperar")!))
      .toBe("Seguimiento cada 2 días hábiles. Flotas: cada 1 día hábil. Si la compañía ya dio un folio, espera la cotización.");
    expect(sumarDiasHabiles("2025-12-19", 3, ["2025-12-22"])).toBe("2025-12-25");
  });

  it("compara CUIT, vehículo, suma y coberturas, y señala datos ausentes", () => {
    const controles = validarCotizacionContraSolicitud(
      { cuitCuil: "20-12345678-6", marca: "Ford", modelo: "Ka", anio: "2020", sumaAsegurada: "10000000", coberturasSolicitadas: "RC, Cristales" },
      { riesgoCotizado: { cuitCuil: "20123456786", marca: "Ford", modelo: "Fiesta", anio: "2020" }, sumaAsegurada: 9_000_000, coberturas: [{ nombre: "RC" }] },
    );
    expect(controles.filter((control) => control.estado === "coincide").map((control) => control.campo)).toEqual(["CUIT/CUIL", "Marca", "Año", "Cobertura: RC"]);
    expect(controles.filter((control) => control.estado === "diferencia").map((control) => control.campo)).toEqual(["Modelo", "Suma asegurada", "Cobertura: Cristales"]);
    expect(controles.find((control) => control.campo === "Cobertura: Cristales")?.estado).toBe("diferencia");
  });
});
