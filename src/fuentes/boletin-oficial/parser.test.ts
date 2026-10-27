import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compradorDeTransferencia,
  esConstitucion,
  esRazonSocial,
  leadsDeBoletin,
  leerEdiciones,
  localidadDeEncabezado,
  separarAvisos,
  separarSecciones,
  type Edicion,
} from "./parser";

// Fixtures: el listado de ediciones del 22/10/2026 y un extracto del texto de
// la Sección Oficial de ese día (tal como lo devuelve unpdf), con los nombres,
// DNI, CUIT/CUIL y domicilios de personas reemplazados por datos ficticios.
const fixture = (nombre: string) => readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url), "utf8");
const EXTRACTO = fixture("oficial-extracto.txt");

const EDICION: Edicion = {
  numero: 30347,
  fecha: "2026-10-22",
  urlOficial: "https://boletinoficial.gba.gob.ar/secciones/14463/ver",
};

describe("listado de ediciones", () => {
  it("lee número, fecha y PDF de la Sección Oficial de cada boletín", () => {
    expect(leerEdiciones(fixture("ediciones-anteriores.html"))).toEqual([
      { numero: 30347, fecha: "2026-10-22", urlOficial: "https://boletinoficial.gba.gob.ar/secciones/14463/ver" },
      { numero: 30346, fecha: "2026-10-21", urlOficial: "https://boletinoficial.gba.gob.ar/secciones/14460/ver" },
      { numero: 30345, fecha: "2026-10-20", urlOficial: "https://boletinoficial.gba.gob.ar/secciones/14457/ver" },
    ]);
  });
});

describe("texto del boletín", () => {
  const secciones = separarSecciones(EXTRACTO);

  it("separa las secciones y sabe en qué página empieza cada una", () => {
    expect([...secciones].map(([titulo, s]) => [titulo, s.pagina])).toEqual([
      ["TRANSFERENCIAS", 74],
      ["SOCIEDADES", 76],
      ["SOCIEDADES POR ACCIONES SIMPLIFICADAS", 101],
      ["VARIOS", 101],
    ]);
  });

  it("cada aviso recuerda la página donde empieza, aunque siga en la siguiente", () => {
    const transferencias = separarAvisos(secciones.get("TRANSFERENCIAS")!, false);
    expect(transferencias.map((a) => a.pagina)).toEqual([74, 74, 74, 76, 76]);
    const sociedades = separarAvisos(secciones.get("SOCIEDADES")!, true);
    expect(sociedades.find((a) => a.titulo === "GOBBLACK SA")?.pagina).toBe(76); // sigue en la 99
  });

  it("separa los avisos de sociedades con su razón social, aunque crucen de página", () => {
    const avisos = separarAvisos(secciones.get("SOCIEDADES")!, true);
    expect(avisos.map((a) => a.titulo)).toEqual([
      "LEGACY LEVE SA",
      "QUÍMICA E.G. SRL",
      "CLOMAR LOGISTICS SA",
      "TENAR ET SA",
      "NEWPORT 4539 MDQ SA",
      "GOBBLACK SA",
    ]);
    const gobblack = avisos.at(-1)!.texto;
    expect(gobblack).toContain("Transporte y operación de contenedores");
    expect(gobblack).not.toContain("BOLETÍN OFICIAL");
  });

  it("distingue constituciones de designaciones, cambios de sede, complementarios y disoluciones", () => {
    const avisos = [
      ...separarAvisos(secciones.get("SOCIEDADES")!, true),
      ...separarAvisos(secciones.get("SOCIEDADES POR ACCIONES SIMPLIFICADAS")!, true),
    ];
    expect(Object.fromEntries(avisos.map((a) => [a.titulo, esConstitucion(a.texto)]))).toEqual({
      "LEGACY LEVE SA": true, // "Constitución: …"
      "QUÍMICA E.G. SRL": false, // asamblea que cambia la sede ("constituye domicilio especial")
      "CLOMAR LOGISTICS SA": false, // designación de directorio
      "TENAR ET SA": false, // edicto complementario
      "NEWPORT 4539 MDQ SA": true, // edicto numerado del art. 10, sin la palabra "constitución"
      "GOBBLACK SA": true,
      "DELTA LABS SAS": false, // disolución
    });
  });

  it("lee la localidad del encabezado de una transferencia", () => {
    expect(localidadDeEncabezado("POR 5 DÍAS - Gral. San Martín. En su carácter de herederos")).toBe("Gral. San Martín");
    expect(localidadDeEncabezado("POR 5 DÍAS - San Carlos de Bolívar. Transferencia de fondo")).toBe(
      "San Carlos de Bolívar",
    );
  });

  it("reconoce razones sociales y descarta compradores que son personas", () => {
    expect(esRazonSocial("Feian SA")).toBe(true);
    expect(esRazonSocial("Farmacia Torchi SCS -en formación-")).toBe(true);
    expect(esRazonSocial("JAVETINA Sociedad de Responsabilidad Ltda.")).toBe(true);
    expect(esRazonSocial("Persona Tres")).toBe(false);
    const transferencias = separarAvisos(secciones.get("TRANSFERENCIAS")!, false);
    expect(transferencias.map((t) => compradorDeTransferencia(t.texto)?.nombre ?? null)).toEqual([
      null, // vende una sociedad de hecho a una persona
      "Feian SA",
      null, // herederos a una persona
      "Bluma Grupo Gastronómico SRL",
      null, // una SRL le vende a una persona
    ]);
  });
});

describe("leads del boletín", () => {
  const leads = leadsDeBoletin(EXTRACTO, EDICION);

  it("solo sociedades nuevas y compras de fondos de comercio por sociedades", () => {
    expect(leads.map((l) => [l.empresa, l.localidad, l.zona, l.sectorId, l.scoreBase])).toEqual([
      ["Feian SA", "Necochea", "costa", "salud", 73],
      ["Bluma Grupo Gastronómico SRL", "Escobar", "provincia", "gastronomia", 72],
      ["Legacy Leve SA", "Mar del Plata", "mdp", "construccion", 85],
      ["Newport 4539 Mdq SA", "Mar del Plata", "mdp", "construccion", 85],
      ["Gobblack SA", "Mar del Plata", "mdp", "flotas", 87],
    ]);
  });

  it("una sociedad nueva de transporte en Mar del Plata", () => {
    const gobblack = leads.find((l) => l.empresa === "Gobblack SA")!;
    expect(gobblack).toMatchObject({
      clave: "bo-pba:sociedad:gobblack-sa",
      cuit: null,
      // Pasajeros y traslados sanitarios: sin el ramo "Carga".
      rubro: "Transporte de pasajeros",
      motivo: "Sociedad nueva: transporte de pasajeros",
      fuente: "Boletín Oficial PBA",
      // El PDF se abre en la página del aviso.
      fuenteUrl: `${EDICION.urlOficial}#page=76`,
      fuenteReferencia: "Boletín Oficial N° 30347 del 22/10/2026 · Sección Oficial · Sociedades · página 76",
      fechaEvento: "2026-10-22", // fecha de publicación del edicto
      ramos: ["Flota", "RC transporte de personas", "AP", "ART"],
    });
    expect(gobblack.descripcion).toMatch(
      /^Publicó su constitución en el Boletín Oficial de la Provincia el 22\/10\/2026, con sede en Mar del Plata\. .* Objeto: Transporte de pasajeros/,
    );
  });

  it("una transferencia guarda la empresa compradora, su CUIT y el rubro del local", () => {
    expect(leads[0]).toMatchObject({
      clave: "bo-pba:transferencia:feian-sa:necochea",
      cuit: "30-71058832-1",
      rubro: "Residencia para Adultos Mayores",
      motivo: "Compró un fondo de comercio",
      ramos: ["RC profesional", "Integral", "ART"],
    });
    expect(leads[1]).toMatchObject({ cuit: "33-71956803-9", rubro: "Café Bluma" });
  });

  it("no guarda nombres, DNI ni CUIT de personas (Ley 25.326)", () => {
    const texto = JSON.stringify(leads);
    expect(texto).not.toMatch(/Persona|DNI|00\.000\.000|2[0347]-?0{8}/);
  });
});
