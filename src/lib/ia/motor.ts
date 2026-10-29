import type { ZodType } from "zod";
import type { ConfiguracionIA } from "./configuracion";
import type { AdjuntoIA, ProveedorIA } from "./index";
import { planDeTarea, type TareaIA } from "./modelos";

export type PedidoIA<T> = {
  agente: string;
  operacion: string;
  tarea: TareaIA;
  orgId?: string | null;
  producerId?: string | null;
  system: string;
  mensaje: string;
  adjuntos?: AdjuntoIA[];
  esquema: ZodType<T>;
};

/** Por qué no hubo resultado de la IA. En todos los casos el agente sigue en modo manual. */
export type MotivoSinIA = "sin_clave" | "desactivada" | "sin_cuota" | "invalida" | "rechazada" | "error";

export type ResultadoIA<T> =
  | { ok: true; datos: T; modelo: string; costoUsd: number; intentos: number }
  | { ok: false; motivo: MotivoSinIA; costoUsd: number; intentos: number };

/** Una fila de ia_uso: métricas, nunca el prompt ni la respuesta. */
export type UsoIA = {
  agente: string;
  operacion: string;
  proveedor: string | null;
  modelo: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  duracionMs: number;
  resultado: "ok" | "invalida" | "rechazada" | "error" | "sin_cuota";
  orgId: string | null;
  producerId: string | null;
};

export type DependenciasIA = {
  /** null cuando no hay clave o el proveedor configurado no existe. */
  proveedor: ProveedorIA | null;
  nombreProveedor: string;
  configuracion: ConfiguracionIA;
  cuotaAlcanzada: boolean;
  registrarUso(uso: UsoIA): Promise<void>;
  reloj?: () => number;
};

/**
 * Llama a la IA con el modelo de la tarea y valida la salida con el esquema.
 * Si no valida y el primer intento fue con Haiku, reintenta una vez con
 * Sonnet. Cada intento queda en ia_uso, también los bloqueados por cuota.
 * Un error de la API o un rechazo no se reintentan: el SDK ya reintenta los
 * errores transitorios.
 */
export async function ejecutarConReintento<T>(pedido: PedidoIA<T>, deps: DependenciasIA): Promise<ResultadoIA<T>> {
  const reloj = deps.reloj ?? Date.now;
  const base = {
    agente: pedido.agente,
    operacion: pedido.operacion,
    proveedor: deps.nombreProveedor,
    orgId: pedido.orgId ?? null,
    producerId: pedido.producerId ?? null,
  };
  if (!deps.proveedor?.generarEstructurado) return { ok: false, motivo: "sin_clave", costoUsd: 0, intentos: 0 };
  if (!deps.configuracion.activa) return { ok: false, motivo: "desactivada", costoUsd: 0, intentos: 0 };
  if (deps.cuotaAlcanzada) {
    await deps.registrarUso({ ...base, modelo: null, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0, duracionMs: 0, resultado: "sin_cuota" });
    return { ok: false, motivo: "sin_cuota", costoUsd: 0, intentos: 0 };
  }

  const plan = planDeTarea(pedido.tarea, deps.configuracion.modelo);
  const modelos = plan.modeloReintento ? [plan.modelo, plan.modeloReintento] : [plan.modelo];
  let costoUsd = 0;
  let intentos = 0;
  for (const modelo of modelos) {
    intentos++;
    const inicio = reloj();
    let respuesta;
    try {
      respuesta = await deps.proveedor.generarEstructurado({
        system: pedido.system,
        mensaje: pedido.mensaje,
        adjuntos: pedido.adjuntos,
        modelo,
        esfuerzo: plan.esfuerzo,
        maxTokens: plan.maxTokens,
      }, pedido.esquema);
    } catch {
      await deps.registrarUso({ ...base, modelo, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0, duracionMs: reloj() - inicio, resultado: "error" });
      return { ok: false, motivo: "error", costoUsd, intentos };
    }
    costoUsd = Number((costoUsd + respuesta.costoUsd).toFixed(6));
    const uso = {
      ...base,
      modelo: respuesta.modelo,
      tokensEntrada: respuesta.tokensEntrada,
      tokensSalida: respuesta.tokensSalida,
      costoUsd: respuesta.costoUsd,
      duracionMs: reloj() - inicio,
    };
    if (respuesta.rechazada) {
      await deps.registrarUso({ ...uso, resultado: "rechazada" });
      return { ok: false, motivo: "rechazada", costoUsd, intentos };
    }
    const validacion = pedido.esquema.safeParse(respuesta.datos);
    if (validacion.success) {
      await deps.registrarUso({ ...uso, resultado: "ok" });
      return { ok: true, datos: validacion.data, modelo: respuesta.modelo, costoUsd, intentos };
    }
    await deps.registrarUso({ ...uso, resultado: "invalida" });
  }
  return { ok: false, motivo: "invalida", costoUsd, intentos };
}
