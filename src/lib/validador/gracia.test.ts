import { describe, expect, it } from "vitest";
import { diasDeGracia, grillaDeGracia, leerGrillaGracia, resolverGracia, SIN_GRACIA, TODOS_LOS_RAMOS, type AlcanceGracia, type FilaGracia } from "./gracia";

const fila = (extra: Partial<FilaGracia>): FilaGracia => ({
  compania: "Sancor",
  ramo: "Auto",
  diasPrimera: 15,
  diasSiguientes: 5,
  habilitado: true,
  orgId: null,
  producerId: null,
  ...extra,
});

const ALCANCE: AlcanceGracia = { compania: "Sancor", ramo: "Auto", orgId: "org-1", producerId: "prod-1" };

describe("resolverGracia", () => {
  it("sin filas no hay gracia: no inventamos plazos", () => {
    expect(resolverGracia([], ALCANCE)).toEqual(SIN_GRACIA);
  });

  it("toma la fila de la compañía y el ramo", () => {
    expect(resolverGracia([fila({})], ALCANCE)).toEqual({ diasPrimera: 15, diasSiguientes: 5 });
  });

  it("reconoce la compañía y el ramo escritos de otra forma", () => {
    expect(resolverGracia([fila({ compania: "SANCOR COOP. DE SEGUROS", ramo: "Automotor" })], ALCANCE)).toEqual({ diasPrimera: 15, diasSiguientes: 5 });
  });

  it("ignora otra compañía, otro ramo, otra organización y otro productor", () => {
    const filas = [
      fila({ compania: "Mapfre" }),
      fila({ ramo: "Vida" }),
      fila({ orgId: "org-2" }),
      fila({ orgId: "org-1", producerId: "prod-2" }),
    ];
    expect(resolverGracia(filas, ALCANCE)).toEqual(SIN_GRACIA);
  });

  it("el ramo * vale para todos los ramos de la compañía, y el ramo exacto le gana", () => {
    const filas = [fila({ ramo: "*", diasPrimera: 10, diasSiguientes: 10 })];
    expect(resolverGracia(filas, { ...ALCANCE, ramo: "Hogar" })).toEqual({ diasPrimera: 10, diasSiguientes: 10 });
    expect(resolverGracia([...filas, fila({})], ALCANCE)).toEqual({ diasPrimera: 15, diasSiguientes: 5 });
  });

  it("en cascada: el productor pisa a la organización y la organización a la plataforma", () => {
    const filas = [fila({}), fila({ orgId: "org-1", diasPrimera: 20 }), fila({ orgId: "org-1", producerId: "prod-1", diasPrimera: 30 })];
    expect(resolverGracia(filas, ALCANCE).diasPrimera).toBe(30);
    expect(resolverGracia(filas.slice(0, 2), ALCANCE).diasPrimera).toBe(20);
  });

  it("el alcance pesa más que el ramo exacto, como en ia_configuracion", () => {
    const filas = [fila({ orgId: "org-1" }), fila({ orgId: "org-1", producerId: "prod-1", ramo: "*", diasPrimera: 3 })];
    expect(resolverGracia(filas, ALCANCE).diasPrimera).toBe(3);
  });

  it("una fila deshabilitada apaga la gracia aunque la plataforma la tenga", () => {
    const filas = [fila({}), fila({ orgId: "org-1", habilitado: false })];
    expect(resolverGracia(filas, ALCANCE)).toEqual(SIN_GRACIA);
  });

  it("con el interruptor general apagado no hay gracia", () => {
    expect(resolverGracia([fila({})], ALCANCE, false)).toEqual(SIN_GRACIA);
  });

  it("nunca devuelve días negativos", () => {
    expect(resolverGracia([fila({ diasPrimera: -3 })], ALCANCE).diasPrimera).toBe(0);
  });
});

describe("diasDeGracia", () => {
  it("la 1.ª cuota usa sus días y las siguientes los suyos", () => {
    const gracia = { diasPrimera: 15, diasSiguientes: 5 };
    expect(diasDeGracia(gracia, 1)).toBe(15);
    expect(diasDeGracia(gracia, 2)).toBe(5);
    expect(diasDeGracia(gracia, 12)).toBe(5);
  });
});

describe("grillaDeGracia", () => {
  const PLATAFORMA = { orgId: null, producerId: null };
  const filas = [
    fila({ compania: "SANCOR", ramo: TODOS_LOS_RAMOS, diasPrimera: 30, diasSiguientes: 30 }),
    fila({ compania: "Sancor", ramo: "Automotor", diasPrimera: 15, diasSiguientes: 0 }),
    fila({ compania: "Mapfre", ramo: TODOS_LOS_RAMOS, habilitado: false }),
    fila({ compania: "Zurich", ramo: TODOS_LOS_RAMOS, orgId: "org-1" }),
  ];

  it("en Todos los ramos: lo de cada compañía, y sin fila no hay gracia", () => {
    const grilla = grillaDeGracia(filas, ["La Segunda"], TODOS_LOS_RAMOS, PLATAFORMA);
    expect(grilla.map((g) => g.compania)).toEqual(["La Segunda", "Mapfre", "Sancor"]);
    expect(grilla.find((g) => g.compania === "Sancor")).toEqual({ compania: "Sancor", propia: { diasPrimera: 30, diasSiguientes: 30 }, heredada: null });
    expect(grilla.find((g) => g.compania === "La Segunda")?.propia).toBeNull();
    expect(grilla.find((g) => g.compania === "Mapfre")?.propia).toEqual({ diasPrimera: 0, diasSiguientes: 0 });
  });

  it("en un ramo: lo propio (con el nombre del ramo de la compañía) y lo que hereda", () => {
    const grilla = grillaDeGracia(filas, [], "Auto", PLATAFORMA);
    expect(grilla.find((g) => g.compania === "Sancor")).toEqual({
      compania: "Sancor",
      propia: { diasPrimera: 15, diasSiguientes: 0 },
      heredada: { diasPrimera: 30, diasSiguientes: 30 },
    });
    expect(grilla.find((g) => g.compania === "Mapfre")).toEqual({ compania: "Mapfre", propia: null, heredada: { diasPrimera: 0, diasSiguientes: 0 } });
  });
});

describe("leerGrillaGracia", () => {
  it("dos valores: guarda; los dos vacíos: borra; uno solo o inválido: error", () => {
    const r = leerGrillaGracia([
      { compania: "Sancor", primera: "15", siguientes: "0" },
      { compania: "Mapfre", primera: "", siguientes: " " },
      { compania: "Zurich", primera: "10", siguientes: "" },
      { compania: "Allianz", primera: "-1", siguientes: "5" },
      { compania: "Orbis", primera: "400", siguientes: "5" },
    ]);
    expect(r.cambios).toEqual([
      { compania: "Sancor", dias: { diasPrimera: 15, diasSiguientes: 0 } },
      { compania: "Mapfre", dias: null },
    ]);
    expect(r.errores).toHaveLength(3);
    expect(r.errores[0]).toMatch(/^Zurich: completá los dos/);
  });
});
