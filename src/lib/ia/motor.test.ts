import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ConfiguracionIA } from "./configuracion";
import type { ProveedorIA, RespuestaEstructuradaIA, SolicitudIA } from "./index";
import { MODELO_HAIKU, MODELO_SONNET } from "./modelos";
import { ejecutarConReintento, type DependenciasIA, type PedidoIA, type UsoIA } from "./motor";

const ESQUEMA = z.object({ poliza: z.string(), monto: z.number().positive() });

const PEDIDO: PedidoIA<z.infer<typeof ESQUEMA>> = {
  agente: "validador",
  operacion: "extraer_comprobante",
  tarea: "extraer",
  orgId: "org-1",
  system: "Extraé el pago.",
  mensaje: "Comprobante",
  esquema: ESQUEMA,
};

const ACTIVA: ConfiguracionIA = { activa: true, proveedor: null, modelo: null, limites: [] };

/** Devuelve las respuestas en orden y anota con qué modelo se pidió cada una. */
function proveedorFalso(respuestas: (Partial<RespuestaEstructuradaIA> | Error)[]) {
  const pedidos: SolicitudIA[] = [];
  const proveedor: ProveedorIA = {
    async generar() {
      throw new Error("no se usa");
    },
    async generarEstructurado(solicitud) {
      pedidos.push(solicitud);
      const respuesta = respuestas[pedidos.length - 1];
      if (respuesta instanceof Error) throw respuesta;
      return { texto: "", datos: null, rechazada: false, modelo: solicitud.modelo ?? "", tokensEntrada: 100, tokensSalida: 20, costoUsd: 0.001, ...respuesta };
    },
  };
  return { proveedor, pedidos };
}

function dependencias(extra: Partial<DependenciasIA>) {
  const usos: UsoIA[] = [];
  const deps: DependenciasIA = {
    proveedor: null,
    nombreProveedor: "anthropic",
    configuracion: ACTIVA,
    cuotaAlcanzada: false,
    registrarUso: async (uso) => {
      usos.push(uso);
    },
    reloj: () => 0,
    ...extra,
  };
  return { deps, usos };
}

describe("ejecutarConReintento", () => {
  it("devuelve los datos validados y registra el uso", async () => {
    const { proveedor, pedidos } = proveedorFalso([{ datos: { poliza: "AU-1", monto: 1915.61 } }]);
    const { deps, usos } = dependencias({ proveedor });
    const resultado = await ejecutarConReintento(PEDIDO, deps);
    expect(resultado).toEqual({ ok: true, datos: { poliza: "AU-1", monto: 1915.61 }, modelo: MODELO_HAIKU, costoUsd: 0.001, intentos: 1 });
    expect(pedidos[0]).toMatchObject({ modelo: MODELO_HAIKU, esfuerzo: "medium", maxTokens: 16_000 });
    expect(usos).toEqual([expect.objectContaining({ agente: "validador", operacion: "extraer_comprobante", modelo: MODELO_HAIKU, resultado: "ok", orgId: "org-1", producerId: null })]);
  });

  it("si Haiku no valida, reintenta con Sonnet y registra los dos intentos", async () => {
    const { proveedor, pedidos } = proveedorFalso([{ datos: { poliza: "AU-1", monto: -3 } }, { datos: { poliza: "AU-1", monto: 3 }, costoUsd: 0.01 }]);
    const { deps, usos } = dependencias({ proveedor });
    const resultado = await ejecutarConReintento(PEDIDO, deps);
    expect(resultado).toMatchObject({ ok: true, modelo: MODELO_SONNET, intentos: 2, costoUsd: 0.011 });
    expect(pedidos.map((pedido) => pedido.modelo)).toEqual([MODELO_HAIKU, MODELO_SONNET]);
    expect(usos.map((uso) => uso.resultado)).toEqual(["invalida", "ok"]);
  });

  it("si tampoco valida con Sonnet, queda inválida", async () => {
    const { proveedor } = proveedorFalso([{ datos: null }, { datos: { poliza: 7 } }]);
    const { deps, usos } = dependencias({ proveedor });
    expect(await ejecutarConReintento(PEDIDO, deps)).toEqual({ ok: false, motivo: "invalida", costoUsd: 0.002, intentos: 2 });
    expect(usos.map((uso) => uso.resultado)).toEqual(["invalida", "invalida"]);
  });

  it("una tarea de Sonnet no se reintenta", async () => {
    const { proveedor, pedidos } = proveedorFalso([{ datos: {} }]);
    const { deps } = dependencias({ proveedor });
    expect(await ejecutarConReintento({ ...PEDIDO, tarea: "explicar" }, deps)).toMatchObject({ ok: false, motivo: "invalida", intentos: 1 });
    expect(pedidos).toHaveLength(1);
  });

  it("un rechazo no se reintenta", async () => {
    const { proveedor, pedidos } = proveedorFalso([{ rechazada: true }]);
    const { deps, usos } = dependencias({ proveedor });
    expect(await ejecutarConReintento(PEDIDO, deps)).toMatchObject({ ok: false, motivo: "rechazada" });
    expect(pedidos).toHaveLength(1);
    expect(usos[0].resultado).toBe("rechazada");
  });

  it("un error de la API corta y queda registrado sin costo", async () => {
    const { proveedor } = proveedorFalso([new Error("529 overloaded")]);
    const { deps, usos } = dependencias({ proveedor });
    expect(await ejecutarConReintento(PEDIDO, deps)).toEqual({ ok: false, motivo: "error", costoUsd: 0, intentos: 1 });
    expect(usos).toEqual([expect.objectContaining({ resultado: "error", costoUsd: 0, modelo: MODELO_HAIKU })]);
  });

  it("sin clave o con la IA apagada no llama ni registra", async () => {
    const { proveedor, pedidos } = proveedorFalso([]);
    const sinClave = dependencias({});
    expect(await ejecutarConReintento(PEDIDO, sinClave.deps)).toMatchObject({ ok: false, motivo: "sin_clave" });
    const apagada = dependencias({ proveedor, configuracion: { ...ACTIVA, activa: false } });
    expect(await ejecutarConReintento(PEDIDO, apagada.deps)).toMatchObject({ ok: false, motivo: "desactivada" });
    expect(pedidos).toHaveLength(0);
    expect([...sinClave.usos, ...apagada.usos]).toHaveLength(0);
  });

  it("con la cuota agotada no llama, pero deja constancia del bloqueo", async () => {
    const { proveedor, pedidos } = proveedorFalso([]);
    const { deps, usos } = dependencias({ proveedor, cuotaAlcanzada: true });
    expect(await ejecutarConReintento(PEDIDO, deps)).toMatchObject({ ok: false, motivo: "sin_cuota" });
    expect(pedidos).toHaveLength(0);
    expect(usos).toEqual([expect.objectContaining({ resultado: "sin_cuota", modelo: null, costoUsd: 0 })]);
  });

  it("usa el modelo configurado", async () => {
    const { proveedor, pedidos } = proveedorFalso([{ datos: { poliza: "AU-1", monto: 1 } }]);
    const { deps } = dependencias({ proveedor, configuracion: { ...ACTIVA, modelo: MODELO_SONNET } });
    await ejecutarConReintento(PEDIDO, deps);
    expect(pedidos[0].modelo).toBe(MODELO_SONNET);
  });
});
