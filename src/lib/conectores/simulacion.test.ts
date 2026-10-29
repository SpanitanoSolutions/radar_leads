import { describe, expect, it } from "vitest";
import {
  cancelacionesDe,
  carteraDeEjemplo,
  cotizacionSimulada,
  cuotasDe,
  generador,
  pdfSimple,
  prefijoDe,
  requisitosDe,
  sumarMeses,
} from "./simulacion";
import type { SolicitudCotizacionConector } from "./tipos";

const HOY = "2026-10-29";

describe("generador", () => {
  it("la misma semilla da la misma secuencia", () => {
    const a = generador(42);
    const b = generador(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(generador(43)()).not.toBe(generador(42)());
  });
});

describe("prefijoDe", () => {
  it("usa las iniciales, o tres letras si es una sola palabra", () => {
    expect(prefijoDe("Federación Patronal")).toBe("FP");
    expect(prefijoDe("San Cristóbal")).toBe("SC");
    expect(prefijoDe("Sancor")).toBe("SAN");
    expect(prefijoDe("La Segunda")).toBe("SEG");
  });
});

describe("sumarMeses", () => {
  it("cruza años en las dos direcciones", () => {
    expect(sumarMeses("2026-11-10", 3)).toBe("2027-02-10");
    expect(sumarMeses("2026-02-10", -3)).toBe("2025-11-10");
  });
});

describe("carteraDeEjemplo", () => {
  const cartera = carteraDeEjemplo("Sancor", HOY);

  it("es la misma para la misma compañía y el mismo día", () => {
    expect(carteraDeEjemplo("Sancor", HOY)).toEqual(cartera);
    expect(carteraDeEjemplo("Rivadavia", HOY)[0].numero).not.toBe(cartera[0].numero);
  });

  it("tiene una flota con tres ítems, un endoso y una póliza en dólares", () => {
    const flota = cartera.filter((poliza) => poliza.ramo === "Flota");
    expect(flota.map((item) => item.item)).toEqual(["Ítem 1", "Ítem 2", "Ítem 3"]);
    expect(new Set(flota.map((item) => item.numero)).size).toBe(1);
    expect(flota[2].endoso).toBe("1");
    expect(cartera.some((poliza) => poliza.moneda === "USD")).toBe(true);
  });
});

describe("cuotasDe", () => {
  const cartera = carteraDeEjemplo("Sancor", HOY);

  it("paga las vencidas, deja impaga la última y pendientes las que vienen", () => {
    const auto = cartera.find((poliza) => poliza.cuotaTotal === 6)!;
    const { cuotas, anuladaEl } = cuotasDe("Sancor", auto, HOY);
    expect(cuotas.map((cuota) => cuota.vencimiento)).toEqual(["2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(cuotas.map((cuota) => cuota.estadoCompania)).toEqual(["pagada", "pagada", "pagada", "vencida", "pendiente", "pendiente"]);
    expect(cuotas.filter((cuota) => cuota.fechaPago).every((cuota) => cuota.medio === "pago_facil" && cuota.fechaPago! <= HOY)).toBe(true);
    expect(cuotas[3]).toMatchObject({ cuotaN: 4, cuotaTotal: 6, fechaPago: null, medio: null });
    expect(anuladaEl).toBeNull();
  });

  it("anula a los 30 días de la primera cuota impaga", () => {
    const hogar = cartera.find((poliza) => poliza.anulaPorFaltaDePago)!;
    const { cuotas, anuladaEl } = cuotasDe("Sancor", hogar, HOY);
    expect(anuladaEl).toBe("2026-10-10");
    const cuenta = (estado: string) => cuotas.filter((cuota) => cuota.estadoCompania === estado).length;
    expect([cuenta("pagada"), cuenta("vencida"), cuenta("anulada")]).toEqual([5, 2, 5]);
    expect(cancelacionesDe("Sancor", cartera, HOY)).toEqual([{ compania: "Sancor", poliza: hogar.numero, item: null, fecha: "2026-10-10", motivo: "falta_de_pago" }]);
  });

  it("el débito automático se cobra el día del vencimiento", () => {
    const debito = cartera.find((poliza) => poliza.medio === "debito_tarjeta")!;
    const pagadas = cuotasDe("Sancor", debito, HOY).cuotas.filter((cuota) => cuota.estadoCompania === "pagada");
    expect(pagadas.length).toBeGreaterThan(0);
    expect(pagadas.every((cuota) => cuota.fechaPago === cuota.vencimiento)).toBe(true);
  });
});

describe("requisitosDe", () => {
  it("lo que dice \"si la tiene\" es opcional", () => {
    const requisitos = requisitosDe("agua");
    expect(requisitos.at(-1)).toEqual({ codigo: "agua-5", nombre: "Factura o foto de compra de lo dañado", obligatorio: false });
    expect(requisitos.slice(0, -1).every((requisito) => requisito.obligatorio)).toBe(true);
  });
});

describe("cotizacionSimulada", () => {
  const solicitud: SolicitudCotizacionConector = {
    referencia: "SOL-12",
    ramo: "Auto",
    tipo: "nueva",
    riesgo: { marca: "Toyota", modelo: "Etios", anio: 2021 },
    codigoPostal: "7600",
    sumaAsegurada: 18_000_000,
    moneda: "ARS",
    vigenciaDesde: "2026-11-01",
  };

  it("cotiza las coberturas pedidas con impuestos y una validez de 15 días", () => {
    const respuesta = cotizacionSimulada("Sancor", solicitud, ["C", "D"], "SAN-COT-1", HOY);
    if (respuesta.estado !== "cotizada") throw new Error("debería cotizar");
    expect(respuesta.coberturas.map((cobertura) => cobertura.codigo)).toEqual(["C", "D"]);
    expect(respuesta.premio).toBe(Math.round(respuesta.primaNeta * 1.31 * 100) / 100);
    expect(respuesta.primaNeta).toBeGreaterThan(18_000_000 * 0.025);
    expect(respuesta).toMatchObject({ moneda: "ARS", vigencia: { desde: "2026-11-01", hasta: "2027-11-01" }, validaHasta: "2026-11-13" });
  });

  it("rechaza coberturas que la compañía no ofrece para el ramo", () => {
    expect(cotizacionSimulada("Sancor", solicitud, ["INC"], "SAN-COT-2", HOY)).toMatchObject({ estado: "rechazada" });
  });
});

describe("pdfSimple", () => {
  it("arma un PDF con la tabla de referencias en su lugar", () => {
    const pdf = pdfSimple("Constancia de denuncia (simulado) — Sancor").toString("latin1");
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    expect(pdf).toContain("(Constancia de denuncia \\(simulado\\)  Sancor) Tj");
  });
});
