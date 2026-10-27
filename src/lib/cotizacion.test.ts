import { describe, expect, it } from "vitest";
import { filtrarSolicitudes, mejorCotizacion, resumenCotizacion, type SolicitudParaLista } from "./cotizacion";

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

  it("cuenta solicitudes activas, atención, cotizaciones y cierres", () => {
    expect(resumenCotizacion(solicitudes)).toEqual({ activas: 4, atencion: 1, delMes: 5, recibidas: 5, ganadas: 1, cerradas: 1 });
  });
});