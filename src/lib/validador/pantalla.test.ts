import { describe, expect, it } from "vitest";
import {
  agruparPorAsegurado,
  calendarioDelMes,
  conEstados,
  desdePagadas,
  etiquetaDias,
  filtrar,
  haceDias,
  leerFiltros,
  leerMes,
  leerOrden,
  mesVecino,
  ORDEN_DE,
  ordenarCuotas,
  pasoParaCobranza,
  porVencimiento,
  tarjetasInicio,
  textoEstado,
  totalesPagadas,
  ultimasFuentes,
  type CuotaValidador,
} from "./pantalla";

const HOY = "2026-10-29"; // jueves
const SIN_GRACIA = () => ({ diasPrimera: 0, diasSiguientes: 0 });

let siguiente = 1;
const cuota = (extra: Partial<CuotaValidador> = {}): CuotaValidador => ({
  id: siguiente++,
  polizaId: 1,
  aseguradoId: 1,
  asegurado: "Acosta, Valeria",
  compania: "Sancor",
  ramo: "Auto",
  poliza: "88-322019",
  item: null,
  endoso: null,
  cupon: null,
  numero: 4,
  cantidadCuotas: 12,
  monto: 1000,
  moneda: "ARS",
  vencimiento: HOY,
  medio: "Débito automático",
  pagada: false,
  cancelada: false,
  pagadaEl: null,
  fechaPago: null,
  origenConfirmacion: null,
  ultimaRevision: null,
  canceladaEl: null,
  motivoCancelacion: null,
  ...extra,
});

describe("tarjetasInicio", () => {
  it("monitoreadas son las impagas: pendientes más vencidas; las pagadas hoy se cuentan aparte", () => {
    const cuotas = conEstados(
      [
        cuota(),
        cuota({ vencimiento: "2026-11-20" }),
        cuota({ vencimiento: "2026-10-20" }),
        cuota({ pagada: true, pagadaEl: new Date("2026-10-29T15:00:00Z") }),
        cuota({ pagada: true, pagadaEl: new Date("2026-10-28T15:00:00Z") }),
        cuota({ cancelada: true }),
      ],
      HOY,
      SIN_GRACIA,
    );
    expect(tarjetasInicio(cuotas, HOY)).toEqual({ monitoreadas: 3, confirmadasHoy: 1, pendientes: 2, vencidas: 1 });
  });

  it("con gracia, la vencida por fecha sigue pendiente (en gracia)", () => {
    const [c] = conEstados([cuota({ vencimiento: "2026-10-25", numero: 1 })], HOY, () => ({ diasPrimera: 15, diasSiguientes: 0 }));
    expect(c).toMatchObject({ estado: "por_vencer", enGracia: true });
    expect(textoEstado(c).texto).toBe("En gracia");
    expect(etiquetaDias(c).texto).toBe("en gracia, venció hace 4 d");
  });
});

describe("etiquetaDias y haceDias", () => {
  it("Hoy, en 3 d y vencida hace 5 d", () => {
    expect(etiquetaDias({ estado: "por_vencer", diasParaVencer: 0 }).texto).toBe("Hoy");
    expect(etiquetaDias({ estado: "por_vencer", diasParaVencer: 3 })).toEqual({ texto: "en 3 d", tono: "ambar" });
    expect(etiquetaDias({ estado: "pendiente", diasParaVencer: 12 })).toEqual({ texto: "en 12 d", tono: "gris" });
    expect(etiquetaDias({ estado: "vencida", diasParaVencer: -5 })).toEqual({ texto: "vencida hace 5 d", tono: "rojo" });
  });

  it("la última revisión cuenta días en Argentina", () => {
    expect(haceDias(null, HOY)).toBe("nunca");
    expect(haceDias(new Date("2026-10-29T02:00:00Z"), HOY)).toBe("ayer"); // 23 h del 28 en Argentina
    expect(haceDias(new Date("2026-09-13T15:00:00Z"), HOY)).toBe("hace 46 d");
  });
});

describe("filtrar", () => {
  const lista = [
    cuota({ asegurado: "Acosta, Valeria", poliza: "88-322019", compania: "SANCOR" }),
    cuota({ asegurado: "Benítez, Martín", poliza: "22-778190", compania: "La Segunda", ramo: "Moto", cupon: "C-551", vencimiento: "2026-11-10" }),
  ];

  it("busca por asegurado, póliza o cupón sin acentos ni mayúsculas", () => {
    expect(filtrar(lista, leerFiltros({ q: "benitez" })).map((c) => c.poliza)).toEqual(["22-778190"]);
    expect(filtrar(lista, leerFiltros({ q: "322019" })).map((c) => c.poliza)).toEqual(["88-322019"]);
    expect(filtrar(lista, leerFiltros({ q: "c-551" })).map((c) => c.poliza)).toEqual(["22-778190"]);
  });

  it("la compañía se compara por su nombre canónico", () => {
    expect(filtrar(lista, leerFiltros({ cia: "Sancor" })).map((c) => c.poliza)).toEqual(["88-322019"]);
  });

  it("ramo, medio y rango de fechas (las fechas inválidas se ignoran)", () => {
    expect(filtrar(lista, leerFiltros({ ramo: "Moto" }))).toHaveLength(1);
    expect(filtrar(lista, leerFiltros({ desde: "2026-11-01" })).map((c) => c.poliza)).toEqual(["22-778190"]);
    expect(filtrar(lista, leerFiltros({ hasta: "2026-10-31" })).map((c) => c.poliza)).toEqual(["88-322019"]);
    expect(filtrar(lista, leerFiltros({ desde: "31/10/2026" }))).toHaveLength(2);
  });
});

describe("agruparPorAsegurado", () => {
  it("junta las cuotas de cada asegurado y no suma pesos con dólares", () => {
    const grupos = agruparPorAsegurado(
      [
        cuota({ aseguradoId: 2, asegurado: "Benítez, Martín", vencimiento: "2026-11-05" }),
        cuota({ aseguradoId: 1, monto: 1500 }),
        cuota({ aseguradoId: 1, monto: 300, moneda: "USD", compania: "SANCOR", vencimiento: "2026-11-02" }),
      ],
      porVencimiento,
    );
    expect(grupos.map((g) => g.asegurado)).toEqual(["Acosta, Valeria", "Benítez, Martín"]);
    expect(grupos[0].total.montos).toEqual([
      { moneda: "ARS", monto: 1500 },
      { moneda: "USD", monto: 300 },
    ]);
    expect(grupos[0].companias).toEqual(["Sancor"]);
  });
});

describe("pagadas", () => {
  it("los doce meses arrancan el primero del mes, once meses atrás", () => {
    expect(desdePagadas(HOY)).toBe("2025-11-01");
    expect(desdePagadas("2026-01-15")).toBe("2025-02-01");
  });

  it("Este mes y Anteriores, por moneda", () => {
    const t = totalesPagadas(
      [
        cuota({ pagada: true, fechaPago: "2026-10-03", monto: 100 }),
        cuota({ pagada: true, fechaPago: "2026-10-20", monto: 50, moneda: "USD", aseguradoId: 2 }),
        cuota({ pagada: true, fechaPago: "2026-09-30", monto: 70 }),
      ],
      HOY,
    );
    expect(t.mes).toEqual({ montos: [{ moneda: "ARS", monto: 100 }, { moneda: "USD", monto: 50 }], pagos: 2, asegurados: 2 });
    expect(t.anteriores).toMatchObject({ pagos: 1, asegurados: 1 });
  });
});

describe("calendario", () => {
  it("semanas de lunes a domingo, con lo que vence cada día por moneda", () => {
    const semanas = calendarioDelMes([cuota({ vencimiento: "2026-11-02", monto: 10 }), cuota({ vencimiento: "2026-11-02", monto: 5, moneda: "USD" }), cuota({ vencimiento: "2026-12-01" })], "2026-11");
    expect(semanas[0][0]).toMatchObject({ dia: "2026-10-26", delMes: false });
    expect(semanas[0][6].dia).toBe("2026-11-01");
    expect(semanas[1][0]).toMatchObject({ dia: "2026-11-02", delMes: true, total: { pagos: 2 } });
    expect(semanas.at(-1)!.at(-1)!.dia).toBe("2026-12-06");
    expect(semanas.flat().filter((d) => d.total.pagos > 0)).toHaveLength(1);
  });

  it("el mes de la URL, o el de hoy; y los meses vecinos cruzan el año", () => {
    expect(leerMes("2026-13", HOY)).toBe("2026-10");
    expect(leerMes("2027-01", HOY)).toBe("2027-01");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
  });
});

describe("ordenarCuotas", () => {
  it("ordena por la columna y el sentido; los montos, por moneda primero", () => {
    const cuotas = conEstados(
      [cuota({ monto: 10, moneda: "USD" }), cuota({ monto: 500 }), cuota({ monto: 20, vencimiento: "2026-10-01" })],
      HOY,
      SIN_GRACIA,
    );
    expect(ordenarCuotas(cuotas, "monto", "asc").map((c) => `${c.moneda} ${c.monto}`)).toEqual(["ARS 20", "ARS 500", "USD 10"]);
    expect(ordenarCuotas(cuotas, "estado", "asc")[0].estado).toBe("vencida");
    expect(leerOrden("nada", "asc", ORDEN_DE.pagadas)).toEqual({ columna: "pago", sentido: "desc" });
    expect(leerOrden("monto", undefined, ORDEN_DE.pagadas)).toEqual({ columna: "monto", sentido: "asc" });
  });
});

describe("ultimasFuentes", () => {
  it("se queda con la última fuente de cada compañía, sin importar cómo se escribe", () => {
    const ids = ultimasFuentes([
      { id: 1, compania: "Sancor", creadoEl: new Date("2026-10-27T11:00:00Z") },
      { id: 2, compania: "SANCOR", creadoEl: new Date("2026-10-28T11:00:00Z") },
      { id: 3, compania: "La Segunda", creadoEl: new Date("2026-10-27T11:00:00Z") },
      { id: 4, compania: "La Segunda", creadoEl: new Date("2026-10-27T11:00:00Z") },
    ]);
    expect([...ids].sort()).toEqual([2, 4]);
  });
});

describe("pasoParaCobranza", () => {
  it("antes del vencimiento, el recordatorio; el día, el de hoy vence; después, el de vencida", () => {
    expect(pasoParaCobranza("2026-11-02", HOY)).toBe(1);
    expect(pasoParaCobranza(HOY, HOY)).toBe(2);
    expect(pasoParaCobranza("2026-10-20", HOY)).toBe(3);
  });
});
