import { describe, expect, it } from "vitest";
import type { Asegurado, Poliza } from "@/db/schema";
import {
  alertasDe,
  filtrarAsegurados,
  gruposDeVencimiento,
  iniciales,
  leerFiltrosAsegurados,
  paginar,
  resumirAsegurado,
  saludoPara,
  subtituloAsegurado,
  textoAvisoVencimiento,
  urlAsegurados,
  type AseguradoConPolizas,
  type FiltrosAsegurados,
} from "./asegurados";

const HOY = "2026-10-27";
let id = 1;

function poliza(ramo: string, vence: string | null, extra: Partial<Poliza> = {}): Poliza {
  return {
    id: id++,
    aseguradoId: 0,
    ramo,
    compania: "Mapfre",
    numero: `N-${id}`,
    bien: null,
    cobertura: null,
    vigenciaDesde: null,
    vigenciaHasta: vence,
    producto: null,
    prima: 1000,
    premio: null,
    sumaAsegurada: null,
    datosCompania: null,
    cantidadCuotas: 12,
    formaPago: null,
    sumaActualizadaAnio: null,
    importacionId: null,
    bajaEl: null,
    creadoEl: new Date(),
    actualizadoEl: new Date(),
    ...extra,
  };
}

function asegurado(nombre: string, polizas: Poliza[], extra: Partial<Asegurado> = {}): AseguradoConPolizas {
  return {
    id: id++,
    tipo: "persona",
    nombre,
    documento: "27-31455872-4",
    documentoDigitos: "27314558724",
    localidad: "Mar del Plata",
    telefono: "223 555-0000",
    email: "x@ejemplo.com.ar",
    domicilio: null,
    codigoPostal: null,
    fechaNacimiento: null,
    contactoNombre: null,
    contactoTelefono: null,
    contactoEmail: null,
    clienteDesde: 2020,
    notas: null,
    esEjemplo: false,
    importacionId: null,
    bajaEl: null,
    creadoEl: new Date(),
    actualizadoEl: new Date(),
    polizas,
    ...extra,
  };
}

const sinFiltros = leerFiltrosAsegurados({});

describe("resumirAsegurado", () => {
  it("junta ramos y compañías y toma el vencimiento más cercano de las pólizas vigentes", () => {
    const f = resumirAsegurado(
      asegurado("Gómez, Lucía", [
        poliza("Automotor", "2026-11-08", { prima: 960000 }),
        poliza("Hogar", "2026-12-01", { compania: "Sancor", prima: 400000 }),
        poliza("Vida", "2026-10-01", { prima: 99 }), // vencida: no cuenta
      ]),
      HOY,
    );
    expect(f.ramos).toEqual(["Auto", "Hogar"]);
    expect(f.companias).toEqual(["Mapfre", "Sancor"]);
    expect(f.vence).toBe("2026-11-08");
    expect(f.dias).toBe(12);
    expect(f.prima).toBe(1360000);
  });

  it("en empresas toma el teléfono del contacto de administración si no hay otro", () => {
    const f = resumirAsegurado(
      asegurado("Hotel SA", [], { tipo: "empresa", telefono: null, email: null, contactoTelefono: "223 1", contactoEmail: null }),
      HOY,
    );
    expect(f.telefono).toBe(true);
    expect(f.email).toBe(false);
  });
});

describe("alertasDe", () => {
  it("avisa vencimiento cercano, un solo ramo y contacto incompleto", () => {
    const f = resumirAsegurado(asegurado("Sosa", [poliza("Moto", "2026-10-30")], { email: null }), HOY);
    expect(alertasDe(f)).toEqual([
      { texto: "Vence en 3 d", tono: "rojo", icono: "aviso" },
      { texto: "1 solo ramo", tono: "azul", icono: "mas" },
      { texto: "Sin email", tono: "gris", icono: "telefono" },
    ]);
  });
});

describe("filtros", () => {
  const filas = [
    asegurado("Gómez, Lucía", [poliza("Auto", "2026-11-08", { numero: "4410-3321908" })]),
    asegurado("Ibáñez, Carolina", [poliza("Hogar", "2027-04-25", { compania: "Sancor" })], { documento: "27-29874512-6" }),
    asegurado("Hotel Brisas del Sur SA", [poliza("Integral", "2027-01-09"), poliza("ART", "2027-01-09")], {
      tipo: "empresa",
      localidad: "Necochea",
      documento: "30-69874120-4",
    }),
  ].map((a) => resumirAsegurado(a, HOY));
  const nombres = (f: Partial<FiltrosAsegurados>) => filtrarAsegurados(filas, { ...sinFiltros, ...f }).map((r) => r.nombre);

  it("ordena por próximo vencimiento", () => {
    expect(nombres({})).toEqual(["Gómez, Lucía", "Hotel Brisas del Sur SA", "Ibáñez, Carolina"]);
  });

  it("busca sin tildes, por documento y por número de póliza", () => {
    expect(nombres({ q: "ibanez" })).toEqual(["Ibáñez, Carolina"]);
    expect(nombres({ q: "69874120" })).toEqual(["Hotel Brisas del Sur SA"]);
    expect(nombres({ q: "4410-3321" })).toEqual(["Gómez, Lucía"]);
  });

  it("combina vista, ramo, compañía, vencimiento, localidad y tipo", () => {
    expect(nombres({ vista: "vencen" })).toEqual(["Gómez, Lucía"]);
    expect(nombres({ vista: "unramo" })).toEqual(["Gómez, Lucía", "Ibáñez, Carolina"]);
    expect(nombres({ ramo: "ART" })).toEqual(["Hotel Brisas del Sur SA"]);
    expect(nombres({ cia: "Sancor" })).toEqual(["Ibáñez, Carolina"]);
    expect(nombres({ venc: "90" })).toEqual(["Gómez, Lucía", "Hotel Brisas del Sur SA"]);
    expect(nombres({ loc: "Necochea", tipo: "empresa" })).toEqual(["Hotel Brisas del Sur SA"]);
  });

  it("lee y arma la URL con los filtros", () => {
    const f = leerFiltrosAsegurados({ vista: "vencen", q: " gomez ", venc: "15", tipo: "empresa", pagina: "2" });
    expect(f).toMatchObject({ vista: "vencen", q: "gomez", venc: "", tipo: "empresa", pagina: 2 });
    expect(urlAsegurados(f)).toBe("/asegurados?vista=vencen&q=gomez&tipo=empresa&pagina=2");
    expect(urlAsegurados(f, { ramo: "Auto" })).toBe("/asegurados?vista=vencen&q=gomez&ramo=Auto&tipo=empresa");
    expect(urlAsegurados(f, { ver: 4 })).toBe("/asegurados?vista=vencen&q=gomez&tipo=empresa&pagina=2&ver=4");
  });

  it("pagina de a 25", () => {
    const muchas = Array.from({ length: 30 }, (_, i) => i);
    expect(paginar(muchas, 2)).toEqual({ filas: [25, 26, 27, 28, 29], paginas: 2, pagina: 2 });
    expect(paginar(muchas, 9).pagina).toBe(2);
  });
});

describe("panel y ficha", () => {
  it("agrupa los vencimientos por fecha", () => {
    const g = gruposDeVencimiento(
      [poliza("Flota", "2026-11-05", { prima: 100 }), poliza("Carga", "2026-11-05", { prima: 50 }), poliza("ART", "2026-12-31")],
      HOY,
    );
    expect(g.map((x) => [x.fecha, x.dias, x.polizas.length, x.total])).toEqual([
      ["2026-11-05", 9, 2, 150],
      ["2026-12-31", 65, 1, 1000],
    ]);
  });

  it("arma iniciales y subtítulo", () => {
    expect(iniciales("Transportes Del Atlántico SRL")).toBe("TD");
    expect(iniciales("Gómez, Lucía")).toBe("GL");
    expect(
      subtituloAsegurado({ tipo: "empresa", documento: "30-71588214-6", localidad: "Mar del Plata", clienteDesde: 2019 }),
    ).toBe("Empresa · CUIT 30-71588214-6 · Mar del Plata · cliente desde 2019");
    expect(subtituloAsegurado({ tipo: "persona", documento: "27-31455872-4", localidad: null, clienteDesde: null })).toBe(
      "Persona · CUIL 27-31455872-4",
    );
  });

  it("saluda a la persona o al contacto de la empresa", () => {
    expect(saludoPara({ tipo: "persona", nombre: "Gómez, Lucía", contactoNombre: null })).toBe("Hola Lucía");
    expect(saludoPara({ tipo: "empresa", nombre: "X SA", contactoNombre: "Marcela Ruiz (administración)" })).toBe("Hola Marcela");
    expect(saludoPara({ tipo: "empresa", nombre: "X SA", contactoNombre: "Ing. Sergio Lamas" })).toBe("Hola Sergio");
  });

  it("arma el aviso de vencimiento con la firma pendiente", () => {
    expect(
      textoAvisoVencimiento({ tipo: "persona", nombre: "Gómez, Lucía", contactoNombre: null }, [
        { ramo: "Auto", compania: "Mapfre", vigenciaHasta: "2026-11-08" },
      ]),
    ).toBe(
      "Hola Lucía, ¿cómo estás? Te escribo porque el 08/11 vence tu seguro de auto con Mapfre. ¿Querés que lo renovemos así o preferís que te cotice otras opciones? Saludos, {productor}",
    );
  });
});
