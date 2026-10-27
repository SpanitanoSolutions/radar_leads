import { describe, expect, it } from "vitest";
import { esSoloRC, oportunidadesDe, type AseguradoParaReglas, type PolizaParaReglas } from "./oportunidades";

let siguiente = 1;
const pol = (ramo: string, cobertura: string | null = null, extra: Partial<PolizaParaReglas> = {}): PolizaParaReglas => ({
  id: siguiente++,
  ramo,
  cobertura,
  bien: `${ramo} de prueba`,
  sumaActualizadaAnio: null,
  ...extra,
});
const persona = (...polizas: PolizaParaReglas[]): AseguradoParaReglas => ({
  tipo: "persona",
  telefono: "223 555-0000",
  email: "x@ejemplo.com.ar",
  polizas,
});
const empresa = (...polizas: PolizaParaReglas[]): AseguradoParaReglas => ({ ...persona(...polizas), tipo: "empresa" });
const titulos = (a: AseguradoParaReglas) => oportunidadesDe(a, 2026).map((o) => o.titulo);

describe("oportunidades", () => {
  it("auto o moto con solo RC: subir a terceros completo", () => {
    expect(titulos(persona(pol("Auto", "Responsabilidad civil")))).toContain("Subir a terceros completo");
    expect(titulos(persona(pol("Moto", "Responsabilidad civil")))).toContain("Subir a terceros completo");
  });

  it("auto con terceros completo: evaluar todo riesgo", () => {
    const t = titulos(persona(pol("Auto", "Terceros completo")));
    expect(t).toContain("Evaluar todo riesgo con franquicia");
    expect(t).not.toContain("Subir a terceros completo");
  });

  it("suma asegurada sin actualizar desde el año anterior", () => {
    expect(titulos(persona(pol("Hogar", "Combinado familiar", { sumaActualizadaAnio: 2025 })))).toContain(
      "Actualizar la suma asegurada",
    );
    expect(titulos(persona(pol("Hogar", "Combinado familiar", { sumaActualizadaAnio: 2026 })))).not.toContain(
      "Actualizar la suma asegurada",
    );
  });

  it("persona con auto y sin hogar: ofrecer hogar", () => {
    expect(titulos(persona(pol("Auto", "Todo riesgo")))).toContain("Hogar o combinado familiar");
    expect(titulos(persona(pol("Auto", "Todo riesgo"), pol("Hogar")))).not.toContain("Hogar o combinado familiar");
  });

  it("persona sin vida ni accidentes personales: ofrecer vida o AP", () => {
    expect(titulos(persona(pol("Hogar")))).toContain("Vida o accidentes personales");
    expect(titulos(persona(pol("Hogar"), pol("Accidentes personales")))).not.toContain("Vida o accidentes personales");
  });

  it("empresa con flota o carga y sin integral: ofrecer integral", () => {
    expect(titulos(empresa(pol("Carga"), pol("ART")))).toContain("Integral para la base operativa");
    expect(titulos(empresa(pol("Flota"), pol("Integral de comercio"), pol("ART")))).not.toContain(
      "Integral para la base operativa",
    );
  });

  it("flota sin RC: ofrecer RC general", () => {
    expect(titulos(empresa(pol("Flota"), pol("ART")))).toContain("Responsabilidad civil general");
    expect(titulos(empresa(pol("Flota"), pol("Resp. civil"), pol("ART")))).not.toContain("Responsabilidad civil general");
  });

  it("empresa sin ART: revisar ART", () => {
    expect(titulos(empresa(pol("RC")))).toContain("ART");
    expect(titulos(empresa(pol("Riesgos del trabajo")))).not.toContain("ART");
    expect(titulos(persona(pol("Hogar")))).not.toContain("ART");
  });

  it("RC profesional sin integral: ofrecer integral del consultorio", () => {
    expect(titulos(empresa(pol("RC profesional"), pol("ART")))).toContain("Integral del consultorio");
    expect(titulos(empresa(pol("RC profesional"), pol("Integral"), pol("ART")))).not.toContain("Integral del consultorio");
  });

  it("integral de comercio sin RC: ofrecer RC del local", () => {
    expect(titulos(persona(pol("Integral de comercio")))).toContain("RC del local");
    expect(titulos(persona(pol("Integral de comercio"), pol("RC")))).not.toContain("RC del local");
  });

  it("falta teléfono o email: completar contacto", () => {
    const sinNada = { ...persona(pol("Vida")), telefono: null, email: null };
    expect(titulos(sinNada)).toContain("Completar teléfono y email");
    expect(titulos({ ...persona(pol("Vida")), email: null })).toContain("Completar email");
    expect(titulos(persona(pol("Vida")))).not.toContain("Completar email");
  });

  it("las claves son estables por regla y póliza", () => {
    const p = pol("Auto", "Responsabilidad civil");
    expect(oportunidadesDe(persona(p), 2026).map((o) => o.clave)).toContain(`rc:${p.id}`);
  });

  it("una cartera completa no tiene oportunidades", () => {
    expect(oportunidadesDe(persona(pol("Auto", "Todo riesgo"), pol("Hogar"), pol("Vida")), 2026)).toEqual([]);
  });
});

describe("esSoloRC", () => {
  it("reconoce la cobertura A y las variantes de responsabilidad civil", () => {
    expect(esSoloRC("A")).toBe(true);
    expect(esSoloRC("Responsabilidad civil")).toBe(true);
    expect(esSoloRC("Terceros completo")).toBe(false);
    expect(esSoloRC(null)).toBe(false);
  });
});
