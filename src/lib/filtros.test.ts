import { describe, expect, it } from "vitest";
import type { Ajustes, Lead, Sector } from "@/db/schema";
import {
  aplicarFiltros,
  calcularKpis,
  contarPorSector,
  contarPorZona,
  leadsVisibles,
  leerFiltros,
  urlFiltros,
  type Filtros,
} from "./filtros";

const sector = (id: string, extra: Partial<Sector> = {}): Sector => ({
  id,
  nombre: id,
  ejemplos: "",
  ramosTipicos: "",
  principal: false,
  activo: true,
  prioridad: "media",
  orden: 0,
  ...extra,
});

let siguienteId = 1;
const lead = (extra: Partial<Lead>): Lead => ({
  id: siguienteId++,
  empresa: "Empresa",
  cuit: null,
  rubro: "Rubro",
  localidad: "Mar del Plata",
  zona: "mdp",
  sectorId: "flotas",
  motivo: "",
  descripcion: null,
  fuente: "Boletín Oficial",
  fuenteUrl: null,
  alcanceLicitacion: null,
  ramos: [],
  scoreBase: 70,
  estado: "nuevo",
  nota: null,
  recordatorio: null,
  telefono: null,
  domicilio: null,
  artActual: null,
  deudaBcra: null,
  esEjemplo: false,
  clave: null,
  detectadoEl: new Date("2026-10-20T12:00:00Z"),
  actualizadoEl: new Date("2026-10-20T12:00:00Z"),
  ...extra,
});

const todoActivo: Pick<Ajustes, "zonas" | "licitaciones"> = {
  zonas: { mdp: true, costa: true, provincia: true },
  licitaciones: { municipal: true, provincial: true, nacional: true },
};

const sinFiltros: Filtros = { sector: "todos", zona: "todas", q: "" };

describe("leadsVisibles", () => {
  const sectores = [sector("flotas", { prioridad: "alta" }), sector("salud", { prioridad: "baja" })];

  it("aplica la prioridad del sector al score y ordena de mayor a menor", () => {
    const res = leadsVisibles(
      [lead({ sectorId: "salud", scoreBase: 90 }), lead({ sectorId: "flotas", scoreBase: 80 })],
      sectores,
      todoActivo,
    );
    expect(res.map((l) => [l.sectorId, l.score])).toEqual([
      ["flotas", 85],
      ["salud", 75],
    ]);
  });

  it("oculta sectores inactivos, zonas apagadas y descartados", () => {
    const res = leadsVisibles(
      [
        lead({ empresa: "ok" }),
        lead({ empresa: "inactivo", sectorId: "salud" }),
        lead({ empresa: "zona apagada", zona: "provincia" }),
        lead({ empresa: "descartado", estado: "descartado" }),
      ],
      [sector("flotas"), sector("salud", { activo: false })],
      { ...todoActivo, zonas: { mdp: true, costa: true, provincia: false } },
    );
    expect(res.map((l) => l.empresa)).toEqual(["ok"]);
  });

  it("filtra licitaciones según el alcance elegido, sin afectar otros leads", () => {
    const res = leadsVisibles(
      [
        lead({ empresa: "nacional", alcanceLicitacion: "nacional" }),
        lead({ empresa: "provincial", alcanceLicitacion: "provincial" }),
        lead({ empresa: "sociedad nueva" }),
      ],
      sectores,
      { ...todoActivo, licitaciones: { municipal: true, provincial: true, nacional: false } },
    );
    expect(res.map((l) => l.empresa).sort()).toEqual(["provincial", "sociedad nueva"]);
  });
});

describe("filtros de la lista", () => {
  const sectores = [sector("flotas"), sector("construccion")];
  const visibles = leadsVisibles(
    [
      lead({ empresa: "Logística Atlántica", sectorId: "flotas", zona: "mdp", cuit: "30-71234567-8" }),
      lead({ empresa: "Transportes Pampa", sectorId: "flotas", zona: "provincia", localidad: "Tandil" }),
      lead({ empresa: "Obras Viales", sectorId: "construccion", zona: "provincia", localidad: "La Plata" }),
      lead({ empresa: "Constructora Batán", sectorId: "construccion", zona: "mdp" }),
    ],
    sectores,
    todoActivo,
  );

  it("combina sector y zona", () => {
    const res = aplicarFiltros(visibles, { sector: "flotas", zona: "provincia", q: "" });
    expect(res.map((l) => l.empresa)).toEqual(["Transportes Pampa"]);
  });

  it("busca sin importar acentos ni mayúsculas, y por CUIT", () => {
    expect(aplicarFiltros(visibles, { ...sinFiltros, q: "logistica" }).map((l) => l.empresa)).toEqual([
      "Logística Atlántica",
    ]);
    expect(aplicarFiltros(visibles, { ...sinFiltros, q: "TANDIL" }).map((l) => l.empresa)).toEqual([
      "Transportes Pampa",
    ]);
    expect(aplicarFiltros(visibles, { ...sinFiltros, q: "71234567" }).map((l) => l.empresa)).toEqual([
      "Logística Atlántica",
    ]);
  });

  it("los contadores de sector respetan la zona elegida y viceversa", () => {
    const enMdp = contarPorSector(visibles, { ...sinFiltros, zona: "mdp" });
    expect(Object.fromEntries(enMdp)).toEqual({ flotas: 1, construccion: 1 });

    const deConstruccion = contarPorZona(visibles, { ...sinFiltros, sector: "construccion" });
    expect(Object.fromEntries(deConstruccion)).toEqual({ provincia: 1, mdp: 1 });
  });
});

describe("leerFiltros y urlFiltros", () => {
  it("ignora zonas inválidas y toma el primer valor repetido", () => {
    expect(leerFiltros({ zona: "marte", sector: ["flotas", "salud"], q: "  remis " })).toEqual({
      sector: "flotas",
      zona: "todas",
      q: "remis",
    });
  });

  it("mantiene los otros filtros al cambiar uno", () => {
    const actual: Filtros = { sector: "flotas", zona: "mdp", q: "" };
    expect(urlFiltros(actual, { zona: "costa" })).toBe("/?sector=flotas&zona=costa");
    expect(urlFiltros(actual, { sector: "todos", zona: "todas" })).toBe("/");
  });
});

describe("calcularKpis", () => {
  it("cuenta nuevos de los últimos 7 días, alta prioridad sin contactar, seguimiento y cerrados", () => {
    const ahora = new Date("2026-10-22T12:00:00Z").getTime();
    const hace = (d: number) => new Date(ahora - d * 86_400_000);
    const visibles = leadsVisibles(
      [
        lead({ scoreBase: 90, detectadoEl: hace(1) }),
        lead({ scoreBase: 90, estado: "llamado", detectadoEl: hace(2) }),
        lead({ scoreBase: 60, estado: "reunion", detectadoEl: hace(10) }),
        lead({ scoreBase: 70, estado: "cerrado", detectadoEl: hace(20) }),
      ],
      [sector("flotas")],
      todoActivo,
    );
    expect(calcularKpis(visibles, ahora)).toEqual({
      nuevos: 2,
      altaSinContactar: 1,
      enSeguimiento: 2,
      cerrados: 1,
    });
  });
});
