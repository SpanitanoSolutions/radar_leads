import { describe, expect, it } from "vitest";
import {
  calcularScoreBase,
  clasificarSector,
  esCuitDeEmpresa,
  formatearCuit,
  oracion,
  quitarDatosPersonales,
  ramosLicitacion,
  recortar,
  tituloPropio,
} from "./clasificacion";
import { buscarLugar, zonaDeLocalidad } from "./localidades";

describe("clasificarSector", () => {
  it("reconoce transporte y construcción aunque el objeto social liste de todo", () => {
    expect(
      clasificarSector(
        "Transporte de pasajeros: explotación de servicios de transporte automotor. Comerciales: compra, venta, importación y exportación.",
      ),
    ).toBe("flotas");
    expect(
      clasificarSector(
        "Constructora: ejecución y construcción de obras públicas o privadas, compra, venta, comercialización, distribución, importación y exportación de bienes, mercaderías, maquinarias y muebles.",
      ),
    ).toBe("construccion");
  });

  it("no se deja llevar por la lista genérica de 'compra, venta, importación y exportación'", () => {
    // Objeto social completo de una constructora publicado en el Boletín Oficial (22/10/2026).
    const objeto =
      "Constructora: ejecución y construcción de obras públicas o privadas en todas sus formas, compra, venta, comercialización, distribución, representación de materiales para la construcción. " +
      "Fideicomisos: constitución, promoción, estructuración, organización y administración de toda clase de fideicomisos. " +
      "Transporte y logística: Transporte de cargas de mercaderías propias o de terceros, en cualquiera de sus modalidades. " +
      "Comerciales, importación y exportación: compra, venta, distribución, consignación, representación, comisión, mandato, importación y exportación de bienes, mercaderías, materias primas, productos elaborados y semielaborados, maquinarias, rodados e insumos. " +
      "Carpintería y muebles: diseño, proyecto, fabricación, industrialización, armado, ensamblado, instalación, reparación, restauración, terminación, comercialización, importación y exportación de muebles de todo tipo y material. " +
      "Maderas: compra, venta, acopio, depósito, distribución, consignación, representación, comisión, importación y exportación de toda clase de maderas. " +
      "Materiales de construcción: compra, venta, distribución, consignación, representación, comisión, mandato, importación y exportación y todo tipo de tratamiento de materiales. " +
      "Gastronómicas: explotación, representación, administración y gerenciamiento comercial por sí o por terceros. " +
      "Agropecuaria, forestal y ganadera. Franquicias: creación, desarrollo, otorgamiento, adquisición, administración y explotación. " +
      "Financieras: aporte e inversión de capitales propios en sociedades o personas, constituidas o a constituirse.";
    expect(clasificarSector(objeto)).toBe("construccion");
  });

  it("un corralón (venta de materiales de construcción) es comercio", () => {
    expect(clasificarSector("Venta de materiales de construcción y ferretería")).toBe("comercio");
  });

  it("no confunde la flota del organismo que compra con la de la empresa", () => {
    expect(clasificarSector("Adquisición de neumáticos para la flota de vehículos de Organismo. REPUESTOS")).toBe(
      "comercio",
    );
    expect(clasificarSector("Servicio de recolección, transporte y disposición final de residuos")).toBe("flotas");
  });

  it("gastronomía, salud e industria; sin pistas, comercio", () => {
    expect(clasificarSector("Café Bluma")).toBe("gastronomia");
    expect(clasificarSector("Residencia para Adultos Mayores")).toBe("salud");
    expect(clasificarSector("Fabricación de prendas de uniformes")).toBe("industria");
    expect(clasificarSector("Perfilador acústico Doppler para la medición de corrientes")).toBe("comercio");
    expect(clasificarSector("")).toBe("comercio");
  });
});

describe("zonas", () => {
  it("ubica Mar del Plata, la costa y el resto de la provincia", () => {
    expect(zonaDeLocalidad("MAR DEL PLATA")).toBe("mdp");
    expect(zonaDeLocalidad("Batan")).toBe("mdp");
    expect(zonaDeLocalidad("Necochea")).toBe("costa");
    expect(zonaDeLocalidad("Santa Clara del Mar")).toBe("costa");
    expect(zonaDeLocalidad("Gral. San Martín")).toBe("provincia");
    expect(zonaDeLocalidad("Localidad desconocida")).toBe("provincia");
  });

  it("toma el primer lugar del texto e ignora calles con nombre de partido", () => {
    expect(buscarLugar("Valentini 70, Mar del Plata, Gral. Pueyrredón, Bs. As.")).toEqual({
      nombre: "Mar del Plata",
      zona: "mdp",
    });
    expect(buscarLugar("calle Balcarce 1234, San Isidro")).toEqual({ nombre: "San Isidro", zona: "provincia" });
    expect(buscarLugar("Av. Necochea y Laprida 1063, Tandil")).toEqual({ nombre: "Tandil", zona: "provincia" });
    expect(buscarLugar("Avenida Montes de Oca 1783, CABA")).toBeNull();
  });
});

describe("ramos sugeridos para una licitación", () => {
  it("caución siempre; flota si es transporte; RC, ART y todo riesgo si es obra", () => {
    expect(ramosLicitacion("comercio")).toEqual(["Caución"]);
    expect(ramosLicitacion("flotas")).toEqual(["Caución", "Flota"]);
    expect(ramosLicitacion("construccion")).toEqual(["Caución", "RC", "ART", "Todo riesgo construcción"]);
  });
});

describe("calcularScoreBase", () => {
  it("suma sector prioritario, cercanía y tamaño del contrato", () => {
    expect(calcularScoreBase("licitacion", { sector: "comercio", zona: "provincia", montoPesos: 6_000_000 })).toBe(72);
    expect(calcularScoreBase("licitacion", { sector: "construccion", zona: "mdp", montoPesos: 92_000_000 })).toBe(92);
    expect(calcularScoreBase("licitacion", { sector: "flotas", zona: "costa", montoPesos: 150_000_000 })).toBe(93);
    expect(calcularScoreBase("licitacion", { sector: "comercio", zona: "mdp", enDivisa: true })).toBe(83);
  });

  it("sociedades nuevas y transferencias parten más abajo y nunca pasan de 95", () => {
    expect(calcularScoreBase("sociedad", { sector: "flotas", zona: "mdp" })).toBe(87);
    expect(calcularScoreBase("sociedad", { sector: "comercio", zona: "provincia" })).toBe(68);
    expect(calcularScoreBase("transferencia", { sector: "salud", zona: "costa" })).toBe(73);
    expect(calcularScoreBase("licitacion", { sector: "flotas", zona: "mdp", montoPesos: 1e12 })).toBe(95);
  });
});

describe("datos de personas (Ley 25.326)", () => {
  it("solo los CUIT 30, 33 y 34 son de empresas", () => {
    expect(esCuitDeEmpresa("30-71222454-8")).toBe(true);
    expect(esCuitDeEmpresa("33-71956803-9")).toBe(true);
    expect(esCuitDeEmpresa("20-00000000-1")).toBe(false);
    expect(esCuitDeEmpresa("27000000000")).toBe(false);
  });

  it("borra DNI y CUIT/CUIL de personas y deja el CUIT de la empresa", () => {
    expect(
      quitarDatosPersonales(
        "Socio gerente DNI N° 27.918.618, CUIL 20-27918618-3, LC 4.763.704 y la firma CUIT 30-71058832-1.",
      ),
    ).toBe("Socio gerente y la firma CUIT 30-71058832-1.");
  });
});

describe("formato", () => {
  it("formatea CUIT", () => {
    expect(formatearCuit("30712224548")).toBe("30-71222454-8");
    expect(formatearCuit("30-7122")).toBeNull();
  });

  it("pasa razones sociales a mayúscula inicial respetando las siglas", () => {
    expect(tituloPropio("SENDEROS DE LA COSTA S.A.")).toBe("Senderos de la Costa S.A.");
    expect(tituloPropio("CORRALÓN DALI Sociedad Anónima")).toBe("Corralón Dali Sociedad Anónima");
    expect(tituloPropio("cilento mecanizados y repuestos s.a.s.")).toBe("Cilento Mecanizados y Repuestos S.A.S.");
    expect(tituloPropio("MEGACER SRL .")).toBe("Megacer SRL");
  });

  it("arma oraciones y recorta textos largos", () => {
    expect(oracion("CONSTRUCCIÓN DE PLATEA Y MÓDULO HABITACIONAL")).toBe("Construcción de platea y módulo habitacional");
    expect(oracion("transporte de cargas")).toBe("Transporte de cargas");
    expect(recortar("Adquisición de víveres para el alistamiento de los buques", 30)).toBe("Adquisición de víveres para…");
  });
});
