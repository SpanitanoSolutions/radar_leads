import { createReadStream } from "node:fs";
import { describe, expect, it } from "vitest";
import { filasCsv } from "../csv";
import {
  adjudicacionALead,
  agruparPorProceso,
  fechaIso,
  inicioVentana,
  leerAdjudicacion,
  leerConvocatoria,
  proveedorBonaerense,
  type Adjudicacion,
  type Convocatoria,
  type Proveedor,
} from "./comprar";
import type { LeadCapturado } from "../tipos";

// Fixtures: filas reales de los CSV de datos.gob.ar (agosto de 2026). La única
// fila de persona física tiene el nombre y el CUIT reemplazados.
async function leerFixture(nombre: string) {
  const filas: Record<string, string>[] = [];
  const archivo = createReadStream(new URL(`./__fixtures__/${nombre}`, import.meta.url), "utf8");
  for await (const fila of filasCsv(archivo as AsyncIterable<string>)) filas.push(fila);
  return filas;
}

async function capturarFixtures(ahora: Date) {
  const proveedores = new Map<string, Proveedor>();
  for (const fila of await leerFixture("sipro.csv")) {
    const p = proveedorBonaerense(fila);
    if (p) proveedores.set(p.cuit, p);
  }
  const desde = inicioVentana(ahora);
  const adjudicaciones = agruparPorProceso(
    (await leerFixture("adjudicaciones.csv"))
      .map(leerAdjudicacion)
      .filter((a): a is Adjudicacion => !!a && a.fecha >= desde && proveedores.has(a.cuit)),
  );
  const convocatorias = new Map(
    (await leerFixture("convocatorias.csv")).map(leerConvocatoria).filter((c): c is [string, Convocatoria] => c !== null),
  );
  const leads = adjudicaciones
    .map((a) => adjudicacionALead(a, proveedores.get(a.cuit)!, convocatorias.get(a.proceso)))
    .filter((l): l is LeadCapturado => l !== null);
  return { proveedores, adjudicaciones, leads };
}

describe("padrón de proveedores (SiPRO)", () => {
  it("se queda con empresas de la provincia: ni CABA ni personas físicas", async () => {
    const { proveedores } = await capturarFixtures(new Date("2026-07-15T12:00:00Z"));
    expect([...proveedores.values()].map((p) => [p.razonSocial, p.localidad, p.zona])).toEqual([
      ["SENDEROS DE LA COSTA S.A.", "Mar del Plata", "mdp"],
      ["ANDARIEGA SOLUCIONES HABITACIONALES S.A.", "Burzaco", "provincia"],
      ["LAROCCA NEUMATICOS S.A.", "Castelar", "provincia"],
      ["JOSE MOZCUZZA Y CIA SA", "Mar del Plata", "mdp"],
    ]);
  });
});

describe("adjudicaciones de COMPR.AR", () => {
  it("lee fecha, monto y moneda", () => {
    expect(fechaIso("22/06/2026 11:10:57 a.m.")).toBe("2026-06-22");
    expect(fechaIso("sin fecha")).toBeNull();
  });

  it("suma las órdenes de compra de una empresa en el mismo proceso", async () => {
    const larocca = (await leerFixture("adjudicaciones.csv"))
      .map(leerAdjudicacion)
      .filter((a): a is Adjudicacion => a?.proceso === "84/89-0720-LPR24");
    expect(agruparPorProceso(larocca)).toEqual([
      expect.objectContaining({ proceso: "84/89-0720-LPR24", montoPesos: 3_180_000, fecha: "2024-08-29" }),
    ]);
  });

  it("convierte en leads las adjudicaciones recientes a empresas bonaerenses que superan el monto mínimo", async () => {
    const { leads } = await capturarFixtures(new Date("2026-07-15T12:00:00Z"));
    // Quedan afuera: la persona física, la empresa de CABA, las adjudicaciones de 2024-2025
    // (fuera de la ventana) y la de $1,1 millones (bajo el mínimo).
    expect(leads.map((l) => l.clave).sort()).toEqual([
      "comprar:21-0003-LPR26:30-60114367-0",
      "comprar:47-0042-CDI26:30-50431047-3",
      "comprar:68-0001-LPR26:30-71222454-8",
      "comprar:78-0009-LPR25:30-70833310-3",
    ]);
  });

  it("una obra en Mar del Plata: construcción, ramos de obra y score alto", async () => {
    const { leads } = await capturarFixtures(new Date("2026-07-15T12:00:00Z"));
    expect(leads.find((l) => l.cuit === "30-71222454-8")).toEqual({
      clave: "comprar:68-0001-LPR26:30-71222454-8",
      empresa: "Senderos de la Costa S.A.",
      cuit: "30-71222454-8",
      rubro: "Construcción", // la actividad que justifica el sector, no el rubro genérico del proveedor
      textoClasificacion:
        "REFACCIÓN DE CONTRAPISOS  MUROS Y TABIQUES EN SECTOR ADMINISTRATIVO - INE. SERV. PROFESIONAL Y COMERCIAL",
      localidad: "Mar del Plata",
      zona: "mdp",
      sectorId: "construccion",
      motivo: "Ganó licitación nacional: Refacción de contrapisos muros y tabiques en sector administrativo - ine",
      descripcion:
        "Adjudicataria del proceso 68-0001-LPR26 (licitacion privada) de Administración Nacional de " +
        "Laboratorios e Institutos de Salud “Dr. Carlos Malbrán, el 22/06/2026, por $ 92.137.810. " +
        "Para firmar el contrato suele exigirse seguro de caución.",
      fuente: "COMPR.AR – adjudicaciones",
      fuenteUrl: "https://datos.gob.ar/dataset/sistema-de-contrataciones-electronicas",
      alcanceLicitacion: "nacional",
      fechaEvento: "2026-06-22", // la fecha de adjudicación, no la de captura
      ramos: ["Caución", "RC", "ART", "Todo riesgo construcción"],
      scoreBase: 92,
    });
  });

  it("clasifica por lo que se licitó: neumáticos son comercio aunque digan 'flota'", async () => {
    const { leads } = await capturarFixtures(new Date("2026-07-15T12:00:00Z"));
    const porCuit = Object.fromEntries(leads.map((l) => [l.cuit, l]));
    expect(porCuit["30-60114367-0"]).toMatchObject({ sectorId: "construccion", zona: "provincia", scoreBase: 87 });
    expect(porCuit["30-70833310-3"]).toMatchObject({ sectorId: "comercio", ramos: ["Caución"], scoreBase: 75 });
    // Monto en dólares: cuenta como contrato grande.
    expect(porCuit["30-50431047-3"]).toMatchObject({ sectorId: "comercio", zona: "mdp", scoreBase: 83 });
    expect(porCuit["30-50431047-3"].descripcion).toContain("en moneda extranjera");
  });

  it("no guarda nada de personas físicas", async () => {
    const { leads } = await capturarFixtures(new Date("2026-07-15T12:00:00Z"));
    expect(JSON.stringify(leads)).not.toMatch(/PERSONA FISICA|20-00000000/i);
  });
});
