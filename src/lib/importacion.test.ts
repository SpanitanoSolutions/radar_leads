import { describe, expect, it } from "vitest";
import {
  CAMPOS_CARTERA,
  companiaCanonica,
  cuitValido,
  detectarSeparador,
  filasParaCorregir,
  leerDocumento,
  leerFecha,
  leerMonto,
  leerMontoSinComa,
  leerTablaCsv,
  resumirCartera,
  sugerirMapeo,
  validarCartera,
} from "./importacion";

const CSV = [
  "Asegurado;CUIT_DNI;Ramo;Cia;Poliza;Patente;Fin Vigencia;Prima;Tel;Mail;Cod Productor",
  "TRANSPORTES DEL ATLANTICO SRL;30715882146;AUTOMOTORES FLOTA;MAPFRE ARGENTINA;4412-0098811;AB123CD;05/11/2026;3.200.000,00;2234951180;administracion@ejemplo.com.ar;4471",
  ";;;;;;;;;;",
  "Gómez, Lucía;27-31455872-4;Automotor;Mapfre;4410-3321908;AF221QR;08/11/2026;960000;223 512-4471;;4471",
  "Pereyra, Martín;20-28761334-9;Auto;La Segunda;22-778190;AB554TT;31/02/2026;820.000;;;4471",
  "Sin Cuit SA;30-1234;Integral de comercio;Sancor;61-1;;10/01/2027;100;;;4471",
  "Ibáñez, Carolina;27-29874512-6;COMB FLIAR 2;Sancor;61-H-44019;;25/04/2027;420.000,00;;cibanez@;4471",
  "Sosa, Ricardo;20-17654321-8;Moto;La Segunda;22-M-90314;A123BCD;;310000;;;4471",
].join("\r\n");

async function tabla() {
  return leerTablaCsv(CSV, "cartera_mapfre.csv");
}

describe("lectura del archivo", () => {
  it("detecta el separador", () => {
    expect(detectarSeparador("Asegurado;CUIT;Ramo")).toBe(";");
    expect(detectarSeparador('Asegurado,"Gómez; Lucía",Ramo')).toBe(",");
    expect(detectarSeparador("a\tb\tc")).toBe("\t");
  });

  it("lee el CSV separado por punto y coma y saltea las filas vacías", async () => {
    const t = await tabla();
    expect(t.separador).toBe(";");
    expect(t.encabezados).toHaveLength(11);
    expect(t.filas).toHaveLength(7); // la vacía se conserva para numerar bien
    expect(t.filaInicial).toBe(2);
  });

  it("saltea el título de arriba y numera las filas como en el archivo", async () => {
    const t = await leerTablaCsv(["Cartera al 28/10/2026", "Asegurado,DNI,Ramo,Vence", "Gómez Lucía,31455872,Auto,08/11/2026"].join("\n"));
    expect(t.separador).toBe(",");
    expect(t.encabezados).toEqual(["Asegurado", "DNI", "Ramo", "Vence"]);
    expect(t.filaInicial).toBe(3);
    expect(validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA), { compania: "Sancor" }).filas[0].fila).toBe(3);
  });
});

describe("sugerirMapeo", () => {
  it("reconoce encabezados raros, sin importar mayúsculas, tildes ni sinónimos", async () => {
    const t = await tabla();
    expect(sugerirMapeo(t.encabezados, CAMPOS_CARTERA)).toEqual([
      "nombre",
      "documento",
      "ramo",
      "compania",
      "numero",
      "bien",
      "vigenciaHasta",
      "prima",
      "telefono",
      "email",
      "",
    ]);
    expect(sugerirMapeo(["RAZÓN SOCIAL", "Cliente", "Nro. de Póliza", "Fecha de vencimiento", "Inicio vigencia"], CAMPOS_CARTERA)).toEqual([
      "nombre",
      "",
      "numero",
      "vigenciaHasta",
      "vigenciaDesde",
    ]);
  });
});

describe("validarCartera", () => {
  it("explica cada problema en castellano y no importa las filas con errores", async () => {
    const t = await tabla();
    const v = validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA));
    expect(v.totalFilas).toBe(6);
    expect(v.filas.map((f) => f.fila)).toEqual([2, 4]);
    expect(v.problemas.filter((p) => p.tipo === "error")).toEqual([
      { fila: 5, mensaje: 'La fecha "31/02/2026" no existe.', tipo: "error" },
      { fila: 6, mensaje: 'El CUIT "30-1234" está incompleto.', tipo: "error" },
      { fila: 7, mensaje: 'Ramo "COMB FLIAR 2" sin reconocer.', tipo: "error" },
      { fila: 8, mensaje: "Falta el fin de vigencia.", tipo: "error" },
    ]);
    expect(v.problemas).toContainEqual({ fila: 7, mensaje: 'El email "cibanez@" no parece válido: queda sin cargar.', tipo: "advertencia" });
    expect(v.ramosDesconocidos).toEqual(["COMB FLIAR 2"]);
  });

  it("normaliza documento, ramo, compañía, fecha y monto", async () => {
    const t = await tabla();
    const [transporte, gomez] = validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA)).filas;
    expect(transporte).toMatchObject({
      tipo: "empresa",
      documento: "30-71588214-6",
      documentoDigitos: "30715882146",
      ramo: "Flota",
      compania: "Mapfre",
      vigenciaHasta: "2026-11-05",
      prima: 3200000,
    });
    expect(gomez).toMatchObject({ tipo: "persona", documento: "27-31455872-4", ramo: "Auto", email: null });
  });

  it("acepta el ramo que elige el productor para los que no reconoce", async () => {
    const t = await tabla();
    const v = validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA), { ramos: { "COMB FLIAR 2": "Hogar" } });
    expect(v.filas.find((f) => f.fila === 7)?.ramo).toBe("Hogar");
    expect(v.ramosDesconocidos).toEqual([]);
  });

  it("usa la compañía del archivo cuando no viene en una columna", async () => {
    const t = await leerTablaCsv(["Asegurado;DNI;Ramo;Vence", "Gómez Lucía;31455872;Auto;08/11/2026"].join("\n"));
    const mapeo = sugerirMapeo(t.encabezados, CAMPOS_CARTERA);
    expect(validarCartera(t, mapeo, { compania: "SANCOR SEGUROS" }).filas[0].compania).toBe("Sancor");
    expect(validarCartera(t, mapeo).faltanObligatorios).toEqual(["Compañía"]);
  });

  it("no importa una fila sin compañía, ni teléfonos que no son teléfonos", async () => {
    const t = await leerTablaCsv(
      [
        "Asegurado;DNI;Ramo;Vence;Compañía;Teléfono;Suma asegurada",
        "Gómez Lucía;31455872;Auto;08/11/2026;Mapfre;000000000;14.500.000,00",
        "Pereyra Martín;28761334;Auto;08/11/2026;;223 512-4471;0,00",
      ].join("\n"),
    );
    const v = validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA));
    expect(v.filas).toHaveLength(1);
    expect(v.filas[0]).toMatchObject({ telefono: null, sumaAsegurada: 14500000 });
    expect(v.problemas).toEqual([
      { fila: 2, mensaje: 'El teléfono "000000000" no parece válido: queda sin cargar.', tipo: "advertencia" },
      { fila: 3, mensaje: "Falta la compañía.", tipo: "error" },
    ]);
  });

  it("une los certificados de una póliza y avisa las filas repetidas", async () => {
    const t = await leerTablaCsv(
      [
        "Asegurado;CUIT;Ramo;Poliza;Certificado;Vence;Prima",
        "Transportes SA;30-71588214-6;Flota;F-1;1;05/11/2026;100.000",
        "Transportes SA;30-71588214-6;Flota;F-1;2;05/11/2026;50.000",
        "Transportes SA;30-71588214-6;Flota;F-1;2;05/11/2026;50.000",
      ].join("\n"),
    );
    const v = validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA), { compania: "Federación Patronal" });
    expect(v.filas).toHaveLength(1);
    expect(v.filas[0].prima).toBe(150000);
    expect(v.problemas.filter((p) => p.tipo === "advertencia" && p.mensaje.startsWith("Repite"))).toEqual([
      { fila: 4, mensaje: "Repite la póliza de la fila 3: se toma esta.", tipo: "advertencia" },
    ]);
  });

  it("avisa qué datos obligatorios no tienen columna", async () => {
    const t = await tabla();
    const v = validarCartera(t, ["nombre", "documento", "", "", "", "", "", "", "", "", ""]);
    expect(v.faltanObligatorios).toEqual(["Fin de vigencia", "Ramo", "Compañía"]);
    expect(v.filas).toEqual([]);
  });

  it("resume nuevos y existentes y arma las filas para corregir", async () => {
    const t = await tabla();
    const v = validarCartera(t, sugerirMapeo(t.encabezados, CAMPOS_CARTERA));
    expect(resumirCartera(v, new Set(["30715882146"]), "2026-10-27")).toEqual({
      asegurados: 2,
      nuevos: 1,
      actualizados: 1,
      polizas: 2,
      vencen30: 2,
      filasConErrores: 4,
    });
    const corregir = filasParaCorregir(t, v.problemas);
    expect(corregir[0].at(-1)).toBe("Problema");
    expect(corregir).toHaveLength(5);
  });
});

describe("valores", () => {
  it("montos en formato argentino y otros", () => {
    expect(leerMonto("1.234.567,89")).toBe(1234567.89);
    expect(leerMonto("$ 3.200.000,00")).toBe(3200000);
    expect(leerMonto("72.500")).toBe(72500);
    expect(leerMonto("1,234,567.89")).toBe(1234567.89);
    expect(leerMonto("960000")).toBe(960000);
    expect(leerMonto("12,5")).toBe(12.5);
    expect(leerMonto("mucho")).toBeNull();
  });

  it("montos que llegaron sin la coma decimal, comparados con otro de la misma póliza", () => {
    expect(leerMontoSinComa("18061979.00", 191442.4)).toEqual({ monto: 180619.79, corregido: true });
    // Con la coma se perdió el cero final de los centavos: no alcanza con dividir por 100.
    expect(leerMontoSinComa("734524.00", 75847.93)).toEqual({ monto: 73452.4, corregido: true });
    expect(leerMontoSinComa("80000.00", 82000)).toEqual({ monto: 80000, corregido: true });
    // Sin referencia, los dos últimos números son los centavos (lo más común).
    expect(leerMontoSinComa("18061979.00")).toEqual({ monto: 180619.79, corregido: true });
    // Si ya trae centavos, viene bien.
    expect(leerMontoSinComa("80308.76", 1000)).toEqual({ monto: 80308.76, corregido: false });
    expect(leerMontoSinComa("0.00", 1000)).toBeNull();
    expect(leerMontoSinComa("", 1000)).toBeNull();
  });

  it("fechas dd/mm/aaaa, ISO y número de Excel; avisa las que no existen", () => {
    expect(leerFecha("05/11/2026")).toEqual({ iso: "2026-11-05" });
    expect(leerFecha("5-11-26")).toEqual({ iso: "2026-11-05" });
    expect(leerFecha("2026-11-05")).toEqual({ iso: "2026-11-05" });
    expect(leerFecha("46331")).toEqual({ iso: "2026-11-05" });
    expect(leerFecha("29/02/2028")).toEqual({ iso: "2028-02-29" });
    expect(leerFecha("29/02/2026")).toEqual({ error: 'la fecha "29/02/2026" no existe' });
    expect(leerFecha("pronto")).toEqual({ error: 'no entendí la fecha "pronto"' });
    expect(leerFecha("")).toBeNull();
  });

  it("CUIT con y sin guiones, DNI con puntos", () => {
    expect(leerDocumento("30-71588214-6")).toEqual({ digitos: "30715882146", texto: "30-71588214-6", tipo: "cuit" });
    expect(leerDocumento("30715882146")).toEqual({ digitos: "30715882146", texto: "30-71588214-6", tipo: "cuit" });
    expect(leerDocumento("31.455.872")).toEqual({ digitos: "31455872", texto: "31.455.872", tipo: "dni" });
    expect(leerDocumento("30-1234")).toEqual({ error: 'el CUIT "30-1234" está incompleto' });
    // Con la letra y los ceros con que completan algunas compañías.
    expect(leerDocumento("D0000031000444")).toEqual({ digitos: "31000444", texto: "31.000.444", tipo: "dni" });
    expect(leerDocumento("C0000001999888")).toEqual({ digitos: "1999888", texto: "1.999.888", tipo: "dni" });
    expect(leerDocumento("J30-70000000-8")).toEqual({ digitos: "30700000008", texto: "30-70000000-8", tipo: "cuit" });
    expect(leerDocumento("")).toBeNull();
  });

  it("verifica el dígito del CUIT", () => {
    expect(cuitValido("30715882146")).toBe(false);
    expect(cuitValido("20172162984")).toBe(true);
  });

  it("lleva las compañías a su nombre corto", () => {
    expect(companiaCanonica("MAPFRE ARGENTINA")).toBe("Mapfre");
    expect(companiaCanonica("Federacion Patronal Seguros SA")).toBe("Federación Patronal");
    expect(companiaCanonica("ASEGURADORA DEL SUR")).toBe("Aseguradora Del Sur");
  });
});
