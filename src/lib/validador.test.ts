import { describe, expect, it } from "vitest";
import {
  agruparCobros,
  avisoConexionesValidador,
  chequearComprobante,
  detalleCobro,
  montosPorPlazo,
  pestanaDe,
  textoVence,
  type CuotaConPoliza,
} from "./validador";

const HOY = "2026-10-27";
let id = 1;
const cuota = (extra: Partial<CuotaConPoliza>): CuotaConPoliza => ({
  id: id++,
  numero: 10,
  monto: 1000,
  vencimiento: "2026-10-31",
  estado: "pendiente",
  pagadaEl: null,
  medioPago: null,
  polizaId: id,
  polizaNumero: `P-${id}`,
  ramo: "Flota",
  compania: "Mapfre",
  cantidadCuotas: 12,
  aseguradoId: 1,
  asegurado: "Transportes Del Atlántico SRL",
  ...extra,
});

const CUENTAS = [{ titular: "Mapfre Argentina Seguros", alias: "mapfre.cobranzas" }];
const COBRO = { monto: 674000, vencimiento: "2026-10-31", compania: "Mapfre", numerosPoliza: ["4412-0098811"] };
const comprobante = (extra = {}) => ({
  medio: "Transferencia · Banco Galicia",
  fecha: new Date("2026-10-26T16:40:00-03:00"),
  monto: 674000,
  destino: "Mapfre Argentina Seguros",
  numeroOperacion: "9902-1183",
  ...extra,
});
const chequear = (c = {}, usadas: string[] = []) =>
  chequearComprobante(comprobante(c), COBRO, { cuentas: CUENTAS, operacionesUsadas: new Set(usadas) });

describe("agruparCobros", () => {
  it("junta las cuotas del mismo asegurado, compañía y vencimiento", () => {
    const cobros = agruparCobros([
      cuota({ monto: 237000 }),
      cuota({ monto: 237000 }),
      cuota({ monto: 200000 }),
      cuota({ aseguradoId: 2, asegurado: "Gómez, Lucía", ramo: "Auto", polizaNumero: "4410-3321908", numero: 6, monto: 80000 }),
    ]);
    expect(cobros.map((c) => [c.asegurado, c.monto, c.poliza, c.cuota])).toEqual([
      ["Transportes Del Atlántico SRL", 674000, "Flota · 3 pólizas", "Cuota 10 de 12"],
      ["Gómez, Lucía", 80000, "Auto · 4410-3321908", "Cuota 6 de 12"],
    ]);
  });

  it("nombra los ramos distintos y marca pagado solo si se pagaron todas", () => {
    const [c] = agruparCobros([cuota({ ramo: "Auto", estado: "pagada" }), cuota({ ramo: "Vida" })]);
    expect(c.poliza).toBe("Auto y Vida · 2 pólizas");
    expect(c.pagada).toBe(false);
  });
});

describe("chequearComprobante", () => {
  it("un comprobante correcto pasa los cuatro chequeos", () => {
    expect(chequear().map((c) => c.resultado)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("informa la diferencia exacta del monto", () => {
    const [monto] = chequear({ monto: 640000 });
    expect(monto.resultado).toBe("mal");
    // El formato de pesos usa espacio duro entre "$" y el número.
    expect(monto.texto.replace(/ /g, " ")).toBe("Faltan $ 34.000: pagó $ 640.000 y la cuota es $ 674.000.");
  });

  it("el destino tiene que ser una cuenta de la compañía", () => {
    expect(chequear({ destino: "Alias taller.puerto.mp" })[1]).toMatchObject({
      resultado: "mal",
      texto: "El destino no es una cuenta de Mapfre. Confirmar a quién le transfirió.",
    });
    expect(chequear({ destino: "mapfre.cobranzas" })[1].resultado).toBe("ok");
  });

  it("en Rapipago revisa que el código sea de la póliza", () => {
    const c = chequear({ medio: "Rapipago", destino: "Mapfre · 4412-0098811", numeroOperacion: "RP-1" });
    expect(c[1]).toMatchObject({ resultado: "ok", texto: "El código de pago corresponde a esta póliza." });
    expect(c[3].texto).toBe("La transacción no se usó antes.");
  });

  it("si pagó después del vencimiento avisa que hay que revisar la vigencia", () => {
    expect(chequear({ fecha: new Date("2026-11-05T19:31:00-03:00") })[2]).toEqual({
      id: "fecha",
      resultado: "duda",
      texto: "Pagó 5 días después del vencimiento: revisar si la póliza sigue vigente.",
    });
  });

  it("el número de operación no se puede repetir", () => {
    expect(chequear({}, ["99021183"])[3]).toMatchObject({ resultado: "mal" });
  });
});

describe("pestañas y montos", () => {
  const base = { pagada: false, vencimiento: "2026-10-31" };
  it("pagados, por revisar, vencidos y pendientes", () => {
    expect(pestanaDe({ ...base, pagada: true }, null, HOY)).toBe("pagados");
    expect(pestanaDe(base, { chequeos: chequear({ monto: 1 }) }, HOY)).toBe("revisar");
    expect(pestanaDe(base, { chequeos: chequear() }, HOY)).toBe("pendientes");
    expect(pestanaDe({ ...base, vencimiento: "2026-10-20" }, null, HOY)).toBe("vencidos");
  });

  it("textos de vencimiento", () => {
    expect(textoVence("2026-10-27", HOY)).toEqual({ texto: "Hoy", tono: "ambar-fuerte" });
    expect(textoVence("2026-10-28", HOY)).toEqual({ texto: "En 1 día", tono: "ambar" });
    expect(textoVence("2026-11-08", HOY)).toEqual({ texto: "En 12 días", tono: "gris" });
    expect(textoVence("2026-10-19", HOY)).toEqual({ texto: "Hace 8 días", tono: "rojo" });
  });

  it("suma los montos por plazo sin contar los pagados", () => {
    const m = montosPorPlazo(
      [
        { pagada: false, vencimiento: "2026-10-27", monto: 100 },
        { pagada: false, vencimiento: "2026-11-08", monto: 50 },
        { pagada: false, vencimiento: "2026-10-19", monto: 10 },
        { pagada: true, vencimiento: "2026-10-28", monto: 999 },
      ],
      HOY,
    );
    expect(m).toEqual({ semana: { monto: 100, cuotas: 1 }, proximos: { monto: 50, cuotas: 1 }, vencidas: { monto: 10, cuotas: 1 } });
  });
});

describe("avisoConexionesValidador", () => {
  it("dice qué falta conectar", () => {
    expect(avisoConexionesValidador({ whatsapp: false, mercadopago: false, banco: false })).toMatch(/WhatsApp.*Mercado Pago/);
    expect(avisoConexionesValidador({ whatsapp: true, mercadopago: false, banco: true })).toBeNull();
  });
});

describe("detalleCobro", () => {
  const contexto = { hoy: HOY, tieneContacto: true, ultimoEnvio: null };
  it("pagado: confirmado y recibo", () => {
    const d = detalleCobro({ pagada: true, pagadaEl: new Date("2026-10-27T11:00:00-03:00"), medioPago: "Débito automático" }, null, contexto);
    expect(d.estado.texto).toBe("Hoy · débito automático");
    expect(d.acciones).toEqual(["recibo"]);
  });

  it("con comprobante: confirmar o pedir otro según los chequeos", () => {
    const sinPagar = { pagada: false, pagadaEl: null, medioPago: null };
    expect(detalleCobro(sinPagar, { chequeos: chequear() }, contexto).acciones).toEqual(["confirmar"]);
    const mal = detalleCobro(sinPagar, { chequeos: chequear({ monto: 1 }) }, contexto);
    expect(mal.estado.texto).toBe("Recibido · 1 problema");
    expect(mal.acciones).toEqual(["pedir", "confirmarIgual"]);
  });

  it("sin comprobante: avisa si no hay contacto o cuándo se mandó el recordatorio", () => {
    const sinPagar = { pagada: false, pagadaEl: null, medioPago: null };
    expect(detalleCobro(sinPagar, null, { ...contexto, tieneContacto: false }).acciones).toEqual(["completarContacto", "marcarPagada"]);
    const avisado = detalleCobro(sinPagar, null, {
      ...contexto,
      ultimoEnvio: { canal: "whatsapp", enviadoEl: new Date("2026-10-26T09:00:00-03:00") },
    });
    expect(avisado.chequeos[0].texto).toBe("Recordatorio enviado ayer por WhatsApp.");
  });
});
