import { describe, expect, it } from "vitest";
import { leerTablaCsv } from "@/lib/importacion";
import {
  faltanEnMapeo,
  leerCuota,
  leerListado,
  leerMapeoListado,
  leerMoneda,
  mapeoDeColumnas,
  mapeoDePropuestaIA,
  plantillaParaTabla,
  proponerMapeoPorSinonimos,
  type MapeoListado,
} from "./listados";

const CSV = [
  "Listado de cobranzas - Sancor Seguros",
  "Póliza;Certificado;Cuota;Recibo;Vencimiento;Importe;Moneda;Fecha de pago;Forma de pago;Estado;Asegurado",
  "0664794781;;4/12;29933892721;29/10/2026;$ 1.915,61;$;28/10/2026;Transferencia;Cobrada;GARCIA JUAN",
  "88-322019;2;3 de 6;;05/11/2026;U$S 120,50;;;Débito CBU;Impaga;FLOTA SRL",
  ";;;;;;;;;;",
  "77100;;1/1;;01/11/2026;$ 10.000,00;$;;;COB;PEREZ ANA",
  "77101;;2/12;;01/11/2026;abc;$;;;Impaga;LOPEZ",
  "77102;;2/12;;31/02/2026;$ 5.000,00;$;;;Impaga;LOPEZ",
  ";;;;;;;;;;TOTAL $ 12.036,11",
  "77103;;2/12;;01/12/2026;$ 5.000,00;$;;;Rehabilitada;DIAZ",
  "77104;;2/12;;01/12/2026;-500,00;$;;;Impaga;DIAZ",
].join("\n");

const tabla = () => leerTablaCsv(CSV, "cobranza sancor.csv");

describe("valores de un listado", () => {
  it("entiende la cuota en sus formas", () => {
    expect(leerCuota("4/12")).toEqual({ n: 4, total: 12 });
    expect(leerCuota("Cuota 04-12")).toEqual({ n: 4, total: 12 });
    expect(leerCuota("3 de 6")).toEqual({ n: 3, total: 6 });
    expect(leerCuota("7")).toEqual({ n: 7, total: null });
    expect(leerCuota("13/12")).toBeNull();
    expect(leerCuota("abc")).toBeNull();
  });

  it("entiende la moneda", () => {
    expect(leerMoneda("$")).toBe("ARS");
    expect(leerMoneda("Pesos")).toBe("ARS");
    expect(leerMoneda("U$S")).toBe("USD");
    expect(leerMoneda("Dólares")).toBe("USD");
    expect(leerMoneda("")).toBeNull();
    expect(leerMoneda("EUR")).toBe("desconocida");
  });
});

describe("mapeo de un listado", () => {
  it("propone las columnas por sinónimos y deja afuera las que no son un dato del pago", async () => {
    const { encabezados } = await tabla();
    const mapeo = proponerMapeoPorSinonimos(encabezados);
    expect(mapeo.columnas).toEqual({
      poliza: "poliza",
      certificado: "item",
      cuota: "cuota",
      recibo: "cupon",
      vencimiento: "vencimiento",
      importe: "monto",
      moneda: "moneda",
      "fecha de pago": "fechaPago",
      "forma de pago": "medio",
      estado: "estado",
    });
    expect(faltanEnMapeo(mapeo)).toEqual([]);
  });

  it("dice qué falta para poder leerlo", () => {
    expect(faltanEnMapeo({ columnas: { importe: "monto" }, estadoPorDefecto: null })).toEqual([
      "la póliza o el cupón",
      "el vencimiento",
      "el estado (o decir que todo el listado está pago o impago)",
    ]);
    expect(faltanEnMapeo({ columnas: { recibo: "cupon", importe: "monto", vto: "vencimiento" }, estadoPorDefecto: "pagada" })).toEqual([]);
  });

  it("valida el mapeo guardado", () => {
    expect(leerMapeoListado({ huella: ["poliza"], columnas: { poliza: "poliza" } })).toMatchObject({ monedaPorDefecto: "ARS", estados: {} });
    expect(leerMapeoListado({ huella: [], columnas: {} })).toBeNull();
    expect(leerMapeoListado({ huella: ["x"], columnas: { x: "inventado" } })).toBeNull();
  });

  it("verifica lo que propone la IA: solo columnas que existen y cada campo una vez", () => {
    const mapeo = mapeoDePropuestaIA(
      {
        columnas: [
          { encabezado: "N° Póliza", campo: "poliza" },
          { encabezado: "Importe cobrado", campo: "monto" },
          { encabezado: "Importe original", campo: "monto" },
          { encabezado: "Fecha Vto.", campo: "vencimiento" },
          { encabezado: "Inventada", campo: "cupon" },
          { encabezado: "Asegurado", campo: "ninguno" },
        ],
        estadoPorDefecto: "pagada",
        monedaPorDefecto: "ARS",
        estados: [{ valor: "COB ", estado: "pagada" }, { valor: "", estado: "anulada" }],
        medios: [{ valor: "PF", medio: "pago_facil" }],
      },
      ["N° Póliza", "Asegurado", "Importe cobrado", "Importe original", "Fecha Vto."],
    );
    expect(mapeo).toEqual({
      huella: ["n poliza", "importe cobrado", "fecha vto"],
      columnas: { "n poliza": "poliza", "importe cobrado": "monto", "fecha vto": "vencimiento" },
      estadoPorDefecto: "pagada",
      monedaPorDefecto: "ARS",
      estados: { cob: "pagada" },
      medios: { pf: "pago_facil" },
    });
  });

  it("reconoce la plantilla de la compañía por su huella, la más nueva", () => {
    const mapeo = (huella: string[]): MapeoListado => mapeoDeColumnas(huella, huella.map(() => "poliza"));
    const plantillas = [
      { id: 1, compania: "Sancor", version: 1, mapeo: { ...mapeo(["poliza"]), huella: ["poliza", "importe"] } },
      { id: 2, compania: "SANCOR SEGUROS", version: 2, mapeo: { ...mapeo(["poliza"]), huella: ["poliza", "importe", "estado"] } },
      { id: 3, compania: "Mapfre", version: 5, mapeo: { ...mapeo(["poliza"]), huella: ["poliza"] } },
      { id: 4, compania: "Sancor", version: 9, mapeo: { ...mapeo(["poliza"]), huella: ["nro tw"] } },
    ];
    expect(plantillaParaTabla(["Póliza", "Importe", "Estado", "Otra"], "Sancor", plantillas)?.id).toBe(2);
    expect(plantillaParaTabla(["Póliza", "Importe"], "Sancor", plantillas)?.id).toBe(1);
    expect(plantillaParaTabla(["Recibo"], "Sancor", plantillas)).toBeNull();
  });
});

describe("leerListado", () => {
  it("lee cada fila o dice por qué no, sin perder ninguna", async () => {
    const t = await tabla();
    const mapeo = { ...proponerMapeoPorSinonimos(t.encabezados), estados: { cob: "pagada" as const } };
    const r = leerListado(t, mapeo, "Sancor Seguros");

    expect(r.filas.length + r.problemas.length + r.vacias).toBe(t.filas.length);
    expect(r.vacias).toBe(1);

    const [primera, flota, cob] = r.filas;
    expect(primera).toMatchObject({
      fila: 3,
      pago: {
        compania: "Sancor",
        poliza: "0664794781",
        item: null,
        cuotaN: 4,
        cuotaTotal: 12,
        cupon: "29933892721",
        monto: 1915.61,
        moneda: "ARS",
        vencimiento: "2026-10-29",
        fechaPago: "2026-10-28",
        medio: "transferencia",
        estadoCompania: "pagada",
      },
    });
    // La fila original se guarda entera, también lo que no es un dato del pago.
    expect(primera.original).toMatchObject({ Asegurado: "GARCIA JUAN", Importe: "$ 1.915,61" });
    expect(flota.pago).toMatchObject({ item: "2", cuotaN: 3, cuotaTotal: 6, monto: 120.5, moneda: "USD", medio: "debito_cbu", estadoCompania: "pendiente" });
    // "COB" es propio de la compañía: lo aclara la plantilla.
    expect(cob.pago).toMatchObject({ poliza: "77100", estadoCompania: "pagada" });

    expect(r.problemas).toEqual([
      { fila: 7, mensaje: 'No entendí el monto "abc".' },
      { fila: 8, mensaje: 'El vencimiento: la fecha "31/02/2026" no existe.' },
      { fila: 9, mensaje: "Es una fila de totales: no es un pago." },
      { fila: 10, mensaje: 'No entendí el estado "Rehabilitada": aclaralo en la plantilla de la compañía.' },
      { fila: 11, mensaje: "El monto es -500,00: puede ser una devolución o una nota de crédito, revisalo a mano." },
    ]);
  });

  it("sin columna de estado usa la fecha de pago o el estado del listado", async () => {
    const t = await leerTablaCsv(["Póliza;Vto;Importe;Fecha cobro", "100;01/11/2026;1.000,00;30/10/2026", "101;01/11/2026;1.000,00;"].join("\n"));
    const mapeo = proponerMapeoPorSinonimos(t.encabezados);
    expect(leerListado(t, mapeo, "Sancor").problemas).toEqual([{ fila: 3, mensaje: "No dice si está paga o impaga." }]);
    const impagas = leerListado(t, { ...mapeo, estadoPorDefecto: "pendiente" }, "Sancor");
    expect(impagas.filas.map((f) => f.pago.estadoCompania)).toEqual(["pagada", "pendiente"]);
    // Sin columna de cuota, el número queda en 0: la identifica el vencimiento.
    expect(impagas.filas[0].pago).toMatchObject({ cuotaN: 0, cuotaTotal: 0 });
  });
});
