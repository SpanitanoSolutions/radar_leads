import { describe, expect, it } from "vitest";
import { detectarFormato, FORMATOS_CARTERA, mapeoDeFormato, motivosDeFormato } from "./formatos-cartera";
import { CAMPOS_CARTERA, conOtrosDatos, leerTablaCsv, normalizarEncabezado, sugerirMapeo, validarCartera } from "./importacion";
import { pesosConCentavos } from "./formato";
import { RAMOS_CARTERA } from "./ramos";

// Encabezados tal como los exporta cada compañía; los datos son inventados.

const MAPFRE = [
  "PRODUCTOR,SECCIÓN,PÓLIZA,TIPO FACT.,NRO.TW,SOLICITUD,ANUALIDAD,RAMO,FECHA VIG.,FORMA DE COBRO,CANT. SINIESTROS,TOMADOR,DOMICILIO,LOCALIDAD,COD. POSTAL,TELÉFONO,FEC.NAC.BENEF,END.ÚLT.FACT.,PREMIO ÚLT.FACT.,SUMA ASEG.ÚLT.FACT.,END.FACT.ANT.,PREMIO FACT.ANT.,SUMA ASEG.FACT.ANT.,NRO. DOCUMENTO",
  "10001,AUTOMOTORES,11000001,MENSUAL,1100000104,,14,AUTOMOVILES INDIVIDUAL SCORING,23/10/2026,TC,0,PEREZ JUAN CARLOS,CALLE FALSA 123 ,MAR DEL PLATA,7600,02235550001,16/02/1977 12:00:00 a.m.,9,80308.76,-54000.00,8,8019272.00,-113000.00,25000111",
  "10001,COMBINADO FAMILIAR,4000002,,400000218,,01,POLIZA MAS,23/01/2027,TC,0,GOMEZ ANA MARIA,CALLE FALSA 456    ,SIERRA DE LOS PADRES,7601,2235550002,27/11/1980 12:00:00 a.m.,1,191442.40,760763800.00,0,18061979.00,717701800.00,28000222",
  "10001,VIDA OBLIGATORIO,84000,ANUAL,8400007,,01,OBLIGATORIO DECRETO 1567/74,01/11/2026,CR,17, LIMPIEZA EJEMPLO S.A.,CALLE FALSA 789 ,MAR DEL PLATA,7600,000000000,,0,0.00,0.00,0,0.00,0.00,30710000006",
  "10001,SEGURO TECNICO,140000,ANUAL,14000013,,04,EQUIPOS DE CONTRATISTA,17/02/2027,DD,0, CLUB EJEMPLO SA,CALLE FALSA 1011 ,MAR DEL PLATA,7602,0223155550004,,0,0.00,0.00,0,0.00,0.00,30720000004",
].join("\r\n");

// Con la fila vacía de arriba, la primera columna vacía y la fila de totales al final.
const SANCOR = [
  ",,,,,,,,,,,,,,,,,,",
  ",Ramo,Producto,Referencia,Póliza,,Certificado,Fecha Inicio Vigencia,Fecha Fin Vigencia,Productor,Organizador,Cliente,Denominación,Prima,Premio,,Grupo Estadístico,Nro. Asoc.,Suma Asegurada",
  ',200,864,30000001,31000001,,1,13/12/2025,13/12/2026,1 - PRODUCTORA EJEMPLO,2 - ORGANIZADOR EJEMPLO,25000111,PEREZ JUAN CARLOS,"1,108,610.00","1,459,576.00",,,7000001,"11,433,000.00"',
  ',600,16,90000002,13000002,,1,08/07/2026,08/07/2027,1 - PRODUCTORA EJEMPLO,2 - ORGANIZADOR EJEMPLO,J30-70000000-8,FUNDACION EJEMPLO,,,,1170 - AP Deportistas,7000002,"4,000,000.00"',
  ',600,16,90000002,13000002,,2,08/07/2026,08/07/2027,1 - PRODUCTORA EJEMPLO,2 - ORGANIZADOR EJEMPLO,J30-70000000-8,FUNDACION EJEMPLO,,,,1170 - AP Deportistas,7000002,"4,000,000.00"',
  ',600,16,90000002,13000002,,0,08/07/2026,08/07/2027,1 - PRODUCTORA EJEMPLO,2 - ORGANIZADOR EJEMPLO,J30-70000000-8,FUNDACION EJEMPLO,"2,106,225.17","2,773,670.95",,1170 - AP Deportistas,7000002,0.00',
  ',700,24,1000003,2000003,,0,06/03/2026,06/03/2027,1 - PRODUCTORA EJEMPLO,2 - ORGANIZADOR EJEMPLO,D0000031000444,GOMEZ ANA MARIA,"48,279.62","64,800.02",,,7000003,"500,000.00"',
  ',1800,40,1000004,4000004,,0,29/10/2026,29/10/2027,1 - PRODUCTORA EJEMPLO,2 - ORGANIZADOR EJEMPLO,C0000001999888,LOPEZ MARIA ELENA,"36,635.98","49,516.16",,,7000004,"115,638,226.00"',
  ",,,,692807266,,,,,,,,,,,,,,",
].join("\r\n");

/** Una fila de MAPFRE con algunas columnas cambiadas ("PREMIO ÚLT.FACT." → "100000.50"). */
function cambiarMapfre(fila: string, cambios: Record<string, string>): string {
  const columnas = MAPFRE.split("\r\n")[0].split(",");
  const celdas = fila.split(",");
  for (const [columna, valor] of Object.entries(cambios)) celdas[columnas.indexOf(columna)] = valor;
  return celdas.join(",");
}

describe("Mapfre: cartera vigente", () => {
  it("reconoce el formato y relaciona las columnas", async () => {
    const t = await leerTablaCsv(MAPFRE, "Cartera vigente Mapfre 2026 - HOJA 1.csv");
    const formato = detectarFormato(t.encabezados);
    expect(formato?.compania).toBe("Mapfre");
    const mapeo = mapeoDeFormato(t.encabezados, formato!);
    const relacion = Object.fromEntries(t.encabezados.map((e, i) => [e, mapeo[i]]).filter(([, c]) => c));
    expect(relacion).toEqual({
      PRODUCTOR: "otro",
      SECCIÓN: "ramo",
      PÓLIZA: "numero",
      "TIPO FACT.": "otro",
      "NRO.TW": "otro",
      SOLICITUD: "otro",
      ANUALIDAD: "otro",
      RAMO: "producto",
      "FECHA VIG.": "vigenciaHasta",
      "FORMA DE COBRO": "formaPago",
      "CANT. SINIESTROS": "otro",
      TOMADOR: "nombre",
      DOMICILIO: "domicilio",
      LOCALIDAD: "localidad",
      "COD. POSTAL": "codigoPostal",
      TELÉFONO: "telefono",
      "FEC.NAC.BENEF": "fechaNacimiento",
      "END.ÚLT.FACT.": "otro",
      "PREMIO ÚLT.FACT.": "otro",
      "SUMA ASEG.ÚLT.FACT.": "sumaAsegurada",
      "END.FACT.ANT.": "otro",
      "PREMIO FACT.ANT.": "otro",
      "SUMA ASEG.FACT.ANT.": "otro",
      "NRO. DOCUMENTO": "documento",
    });
    // No se deja afuera ninguna columna.
    const motivos = motivosDeFormato(t.encabezados, formato!);
    expect(t.encabezados.filter((_, i) => motivos[i])).toEqual([]);
  });

  it("valida las filas con la compañía del formato", async () => {
    const t = await leerTablaCsv(MAPFRE);
    const formato = detectarFormato(t.encabezados)!;
    const v = validarCartera(t, mapeoDeFormato(t.encabezados, formato), { ramos: formato.ramos, compania: formato.compania, formato });
    expect(v.filas.map((f) => [f.ramo, f.compania, f.vigenciaHasta, f.finDelPeriodo, f.telefono, f.producto, f.sumaAsegurada, f.prima])).toEqual([
      // "FECHA VIG." es el fin del mes facturado, no el vencimiento: sigue vigente mientras esté en la cartera.
      // En autos, la suma de la última factura es el ajuste del endoso. Prima anual: el premio mensual por 12.
      ["Auto", "Mapfre", null, "2026-10-23", "02235550001", "AUTOMOVILES INDIVIDUAL SCORING", null, 963705.12],
      // Sin facturación informada, combinado se supone trimestral (a confirmar).
      ["Hogar", "Mapfre", null, "2027-01-23", "2235550002", "POLIZA MAS", 760763800, 765769.6],
      // Anual: la fecha sí es el vencimiento. Todavía sin premio facturado.
      ["Vida", "Mapfre", "2026-11-01", null, null, "OBLIGATORIO DECRETO 1567/74", null, null],
      // Ramo que UNIQO no conoce: se importa igual, como vino.
      ["SEGURO TECNICO", "Mapfre", "2027-02-17", null, "0223155550004", "EQUIPOS DE CONTRATISTA", null, null],
    ]);
    expect(v.filas[0]).toMatchObject({ fechaNacimiento: "1977-02-16", codigoPostal: "7600", formaPago: "TC" });
    expect(v.filas[0].datosCompania).toEqual([
      { etiqueta: "Fin del período facturado", valor: "23/10/2026" },
      { etiqueta: "Código de productor", valor: "10001" },
      { etiqueta: "Facturación", valor: "MENSUAL" },
      { etiqueta: "N° TronWeb", valor: "1100000104" },
      { etiqueta: "Anualidad", valor: "14" },
      { etiqueta: "Siniestros informados por Mapfre", valor: "0" },
      { etiqueta: "Endoso de la última factura", valor: "9" },
      { etiqueta: "Premio de la última factura", valor: pesosConCentavos(80308.76) },
      { etiqueta: "Endoso de la factura anterior", valor: "8" },
      // "8019272.00": Mapfre la manda sin la coma decimal.
      { etiqueta: "Premio de la factura anterior", valor: pesosConCentavos(80192.72) },
      { etiqueta: "Suma de la factura anterior", valor: pesosConCentavos(-113000) },
      { etiqueta: "Cómo se calculó la prima anual", valor: `${pesosConCentavos(80308.76)} × 12 (premio de la última factura, con impuestos)` },
      { etiqueta: "Ajuste de suma de la última factura", valor: pesosConCentavos(-54000) },
    ]);
    // Sin facturas todavía: ni endoso ni premio en cero.
    expect(v.filas[2].datosCompania.map((d) => d.etiqueta)).toEqual([
      "Código de productor",
      "Facturación",
      "N° TronWeb",
      "Anualidad",
      "Siniestros informados por Mapfre",
      // El teléfono "000000000" no se pierde: queda tal como vino.
      "Teléfono (como vino)",
    ]);
    expect(v.filas[2]).toMatchObject({ tipo: "empresa", nombre: "LIMPIEZA EJEMPLO S.A.", documento: "30-71000000-6" });
    expect(v.problemas).toContainEqual({
      fila: 4,
      mensaje: 'El teléfono "000000000" no parece válido: se guarda como vino, en los datos de la póliza.',
      tipo: "advertencia",
    });
    expect(v.ramosDesconocidos).toEqual(["SEGURO TECNICO"]);
    expect(v.filas).toHaveLength(v.totalFilas);
  });

  it("lee el premio de la factura anterior aunque venga sin la coma decimal", async () => {
    const [encabezado, auto, hogar] = MAPFRE.split("\r\n");
    const conPremios = (fila: string, ultimo: string, anterior: string) =>
      cambiarMapfre(fila, { "PREMIO ÚLT.FACT.": ultimo, "PREMIO FACT.ANT.": anterior });
    const t = await leerTablaCsv(
      [
        encabezado,
        conPremios(hogar, "191442.40", "18061979.00"), // $ 180.619,79
        conPremios(auto, "75847.93", "734524.00"), // $ 73.452,40: se perdió también el cero final
        conPremios(auto.replace("11000001", "11000009"), "0.00", "1072702.00"), // sin última factura: se compara con los otros autos
        conPremios(hogar.replace("4000002", "4000009"), "0.00", "15740438.50"), // ya trae centavos: se toma como viene
      ].join("\r\n"),
    );
    const formato = detectarFormato(t.encabezados)!;
    const v = validarCartera(t, mapeoDeFormato(t.encabezados, formato), { compania: formato.compania, formato });
    const anterior = v.filas.map((f) => f.datosCompania.find((d) => d.etiqueta === "Premio de la factura anterior")?.valor);
    expect(anterior).toEqual([
      pesosConCentavos(180619.79),
      pesosConCentavos(73452.4),
      `${pesosConCentavos(107270.2)} (a confirmar)`,
      pesosConCentavos(15740438.5),
    ]);
    // Los autos son mensuales: el segundo, sin última factura, toma la anterior y avisa que hay que revisarla.
    // Los de hogar no informan la facturación: se suponen trimestrales.
    expect(v.filas.map((f) => f.prima)).toEqual([765769.6, 910175.16, 1287242.4, 62961754]);
    expect(v.problemas.filter((p) => p.mensaje.startsWith("La prima anual")).map((p) => p.fila)).toEqual([4]);
    expect(v.problemas).toContainEqual({
      fila: 4,
      mensaje: "La prima anual se calculó con un premio que Mapfre manda sin la coma decimal y no se pudo comparar con otra factura: revisala.",
      tipo: "advertencia",
    });
  });

  it("calcula la prima anual con la facturación: ×12 mensual, ×2 semestral, ×1 anual", async () => {
    const [encabezado, auto] = MAPFRE.split("\r\n");
    const poliza = (numero: string, facturacion: string, seccion = "AUTOMOTORES") =>
      cambiarMapfre(auto.replace("11000001", numero), { "TIPO FACT.": facturacion, "PREMIO ÚLT.FACT.": "100000.50", SECCIÓN: seccion });
    const t = await leerTablaCsv(
      [
        encabezado,
        poliza("1", "MENSUAL"),
        poliza("2", "SEMESTRAL"),
        poliza("3", "ANUAL"),
        poliza("4", "Trimestral"),
        poliza("5", ""), // sin facturación: un auto se supone mensual
        poliza("6", "", "INTEGRAL DE COMERCIO"), // y un integral, trimestral
        poliza("7", "CADA TANTO"), // dice algo que no se entiende: no se supone nada
      ].join("\r\n"),
    );
    const formato = detectarFormato(t.encabezados)!;
    const v = validarCartera(t, mapeoDeFormato(t.encabezados, formato), { compania: formato.compania, formato });
    expect(v.filas.map((f) => f.prima)).toEqual([1200006, 200001, 100000.5, 400002, 1200006, 400002, null]);
    const como = (i: number) => v.filas[i].datosCompania.find((d) => d.etiqueta === "Cómo se calculó la prima anual")?.valor;
    expect(como(1)).toBe(`${pesosConCentavos(100000.5)} × 2 (premio de la última factura, con impuestos)`);
    expect(como(4)).toBe(`${pesosConCentavos(100000.5)} × 12 (premio de la última factura, con impuestos; facturación mensual supuesta) (a confirmar)`);
    expect(como(5)).toBe(`${pesosConCentavos(100000.5)} × 4 (premio de la última factura, con impuestos; facturación trimestral supuesta) (a confirmar)`);
    // Suponer la facturación se marca en la póliza, sin llenar de avisos la importación.
    expect(v.problemas.filter((p) => p.mensaje.startsWith("La prima anual"))).toEqual([]);
  });

  it("sin el formato, los sinónimos no confunden PRODUCTOR con el ramo", async () => {
    const t = await leerTablaCsv(MAPFRE);
    const mapeo = sugerirMapeo(t.encabezados, CAMPOS_CARTERA);
    expect(mapeo[t.encabezados.indexOf("PRODUCTOR")]).toBe("");
    expect(mapeo[t.encabezados.indexOf("SECCIÓN")]).toBe("ramo");
    expect(mapeo[t.encabezados.indexOf("FECHA VIG.")]).toBe("vigenciaHasta");
    expect(mapeo[t.encabezados.indexOf("FORMA DE COBRO")]).toBe("formaPago");
  });
});

describe("Sancor: detalle de cartera", () => {
  it("encuentra el encabezado debajo de la fila vacía y reconoce el formato", async () => {
    const t = await leerTablaCsv(SANCOR, "Reporte (1) - Detalle.csv");
    expect(t.separador).toBe(",");
    expect(t.filaInicial).toBe(3);
    expect(t.encabezados[1]).toBe("Ramo");
    const formato = detectarFormato(t.encabezados);
    expect(formato?.compania).toBe("Sancor");
    expect(mapeoDeFormato(t.encabezados, formato!).filter(Boolean)).toEqual([
      "ramo",
      "producto",
      "otro",
      "numero",
      "certificado",
      "vigenciaDesde",
      "vigenciaHasta",
      "otro",
      "otro",
      "documento",
      "nombre",
      "prima",
      "premio",
      "otro",
      "otro",
      "sumaAsegurada",
    ]);
  });

  it("lee los documentos con letra, une los certificados sin perder su detalle y no toma los totales como póliza", async () => {
    const t = await leerTablaCsv(SANCOR);
    const formato = detectarFormato(t.encabezados)!;
    const v = validarCartera(t, mapeoDeFormato(t.encabezados, formato), { ramos: formato.ramos, compania: formato.compania, formato });
    // 7 filas: 4 pólizas, 2 certificados de la de AP y la fila de totales. Cuadra.
    expect([v.totalFilas, v.filas.length, v.unidas, v.noSonPolizas]).toEqual([7, 4, 2, 1]);
    expect(v.filas.map((f) => [f.fila, f.ramo, f.documento, f.numero, f.producto, f.prima, f.premio, f.sumaAsegurada])).toEqual([
      [3, "Auto", "25.000.111", "31000001", "864", 1108610, 1459576, 11433000],
      [4, "AP", "30-70000000-8", "13000002", "16", 2106225.17, 2773670.95, 8000000],
      // El código de ramo 700 no se conoce: se importa igual.
      [7, "700", "31.000.444", "2000003", "24", 48279.62, 64800.02, 500000],
      [8, "Hogar", "1.999.888", "4000004", "40", 36635.98, 49516.16, 115638226],
    ]);
    expect(v.filas[1].datosCompania).toEqual([
      { etiqueta: "Referencia", valor: "90000002" },
      { etiqueta: "Productor", valor: "1 - PRODUCTORA EJEMPLO" },
      { etiqueta: "Organizador", valor: "2 - ORGANIZADOR EJEMPLO" },
      { etiqueta: "Grupo estadístico", valor: "1170 - AP Deportistas" },
      { etiqueta: "N° de asociado en Sancor", valor: "7000002" },
      { etiqueta: "Certificados", valor: "3" },
      {
        etiqueta: "Detalle por certificado",
        valor: `N° 1: suma ${pesosConCentavos(4000000)} · N° 2: suma ${pesosConCentavos(4000000)} · N° 0: prima ${pesosConCentavos(2106225.17)}, premio ${pesosConCentavos(2773670.95)}`,
      },
    ]);
    expect(v.filas[1]).toMatchObject({ tipo: "empresa", compania: "Sancor", vigenciaDesde: "2026-07-08", vigenciaHasta: "2027-07-08" });
    expect(v.problemas).toEqual([
      { fila: 7, mensaje: 'Ramo "700" sin reconocer: se importa así. Elegí abajo a cuál corresponde.', tipo: "error" },
      { fila: 9, mensaje: "No tiene asegurado, documento, ramo ni vencimiento: parece una fila de totales o una nota.", tipo: "omitida" },
    ]);
    expect(v.ramosDesconocidos).toEqual(["700"]);
  });
});

describe("columnas de cada formato", () => {
  it("cada columna de los archivos reales tiene una decisión: se importa o se explica por qué no", async () => {
    for (const csv of [MAPFRE, SANCOR]) {
      const t = await leerTablaCsv(csv);
      const formato = detectarFormato(t.encabezados)!;
      const mapeo = mapeoDeFormato(t.encabezados, formato);
      const motivos = motivosDeFormato(t.encabezados, formato);
      const sinDecidir = t.encabezados.filter((e, i) => e && !mapeo[i] && !motivos[i]);
      expect(sinDecidir, formato.compania).toEqual([]);
    }
  });

  it("los formatos solo usan datos y ramos que existen", () => {
    const campos = new Set<string>(CAMPOS_CARTERA.map((c) => c.id));
    for (const f of FORMATOS_CARTERA) {
      expect(Object.values(f.columnas).every((c) => campos.has(c))).toBe(true);
      expect(Object.values(f.ramos ?? {}).every((r) => RAMOS_CARTERA.some((x) => x.id === r))).toBe(true);
      const decididas = [...Object.keys(f.columnas), ...Object.keys(f.otros), ...Object.keys(f.omitidas)];
      for (const e of [...decididas, ...f.huella]) expect(normalizarEncabezado(e)).toBe(e);
      expect(new Set(decididas).size).toBe(decididas.length); // cada columna, una sola decisión
    }
  });
});

describe("conOtrosDatos", () => {
  it("guarda como otro dato las columnas sin relacionar que traen algo", async () => {
    const t = await leerTablaCsv(["Asegurado;DNI;Ramo;Vence;Observaciones;Notas;", "Gómez Lucía;31455872;Auto;08/11/2026;Cliente referido;;"].join("\n"));
    const mapeo = sugerirMapeo(t.encabezados, CAMPOS_CARTERA);
    expect(conOtrosDatos(t, mapeo).slice(4)).toEqual(["otro", "", ""]); // "Notas" vacía y la columna sin nombre quedan afuera
    const v = validarCartera(t, conOtrosDatos(t, mapeo), { compania: "Mapfre" });
    expect(v.filas[0].datosCompania).toEqual([{ etiqueta: "Observaciones", valor: "Cliente referido" }]);
  });
});

describe("detectarFormato", () => {
  it("no reconoce una planilla propia", () => {
    expect(detectarFormato(["Asegurado", "DNI", "Ramo", "Vencimiento"])).toBeNull();
  });
});
