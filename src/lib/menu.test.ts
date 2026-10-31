import { describe, expect, it } from "vitest";
import { armarMenu, estaActivo, fechaCorta, itemConfiguracion, type ContadoresMenu } from "./menu";

const CONTADORES: ContadoresMenu = {
  asegurados: 16,
  vencen30: 7,
  leads: 10,
  agentes: { cotizacion: 2, validador: 2, siniestros: 3, cobranza: 5, conciliador: null },
  conexionesPendientes: 1,
  ultimaImportacion: { fecha: "2026-10-24", archivo: "cartera_octubre.csv" },
};

const item = (texto: string, c = CONTADORES) =>
  armarMenu(c).flatMap((g) => g.items).find((i) => i.texto === texto)!;

describe("armarMenu", () => {
  it("arma los grupos con el dashboard antes de la cartera", () => {
    const grupos = armarMenu(CONTADORES);
    expect(grupos.map((g) => g.titulo)).toEqual(["Inicio", "Mi cartera", "Agentes", "Captación de clientes"]);
    expect(grupos[0].items[0]).toMatchObject({ href: "/inicio", texto: "Resumen general" });
    expect(grupos[2].items.map((i) => i.texto)).toEqual([
      "Cotización",
      "Validador de pagos",
      "Siniestros",
      "Cobranza",
      "Conciliador",
      "Extractor de pólizas",
    ]);
  });

  it("vencimientos en ámbar y validador en rojo", () => {
    expect(item("Vencimientos").contador).toMatchObject({ valor: 7, tono: "ambar" });
    expect(item("Validador de pagos").contador).toMatchObject({ valor: 2, tono: "rojo" });
  });

  it("un agente sin configurar lleva la etiqueta Configurar y no contador", () => {
    const conciliador = item("Conciliador");
    expect(conciliador.configurar).toBe(true);
    expect(conciliador.contador).toBeUndefined();
  });

  it("los contadores de atención no se muestran en cero", () => {
    const c = { ...CONTADORES, vencen30: 0, agentes: { ...CONTADORES.agentes, cobranza: 0 } };
    expect(item("Vencimientos", c).contador).toBeUndefined();
    expect(item("Cobranza", c).contador).toBeUndefined();
    expect(item("Cobranza", c).configurar).toBeUndefined();
  });

  it("asegurados y leads muestran la cantidad aunque sea cero", () => {
    const c = { ...CONTADORES, asegurados: 0, leads: 0 };
    expect(item("Asegurados", c).contador?.valor).toBe(0);
    expect(item("Leads del día", c).contador?.valor).toBe(0);
  });

  it("configuración avisa las conexiones pendientes", () => {
    expect(itemConfiguracion(CONTADORES).contador).toMatchObject({ valor: 1, descripcion: "1 conexión pendiente" });
    expect(itemConfiguracion({ ...CONTADORES, conexionesPendientes: 0 }).contador).toBeUndefined();
  });
});

describe("estaActivo", () => {
  it("marca la sección y sus subpáginas", () => {
    expect(estaActivo({ href: "/asegurados" }, "/asegurados")).toBe(true);
    expect(estaActivo({ href: "/asegurados" }, "/asegurados/4")).toBe(true);
    expect(estaActivo({ href: "/leads" }, "/leads/12")).toBe(true);
  });

  it("no confunde rutas con el mismo comienzo", () => {
    expect(estaActivo({ href: "/agentes/cobranza" }, "/agentes/cotizacion")).toBe(false);
    expect(estaActivo({ href: "/asegurados" }, "/aseguradosx")).toBe(false);
  });

  it("leads del día también queda activo en el resumen y los resultados", () => {
    const leads = item("Leads del día");
    expect(estaActivo(leads, "/resumen")).toBe(true);
    expect(estaActivo(leads, "/resultados")).toBe(true);
    expect(estaActivo(leads, "/sectores")).toBe(false);
  });
});

describe("fechaCorta", () => {
  it("pasa de ISO a dd/mm/aaaa", () => {
    expect(fechaCorta("2026-10-24")).toBe("24/10/2026");
  });
});
