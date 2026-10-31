import type { ZodType } from "zod";
import type { ConfiguracionIA } from "./configuracion";
import type { AdjuntoIA, HerramientaIA, LlamadaHerramientaIA, ProveedorIA, TurnoIA } from "./index";
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
  if (!deps.proveedor) return { ok: false, motivo: "sin_clave", costoUsd: 0, intentos: 0 };
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

// ---------- Conversación con herramientas ----------

/** Lo que devuelve el agente al ejecutar una herramienta. `terminar` corta la conversación. */
export type ResultadoHerramienta = { contenido: string; esError?: boolean; terminar?: boolean };

export type PedidoAgenteIA = {
  agente: string;
  operacion: string;
  orgId?: string | null;
  producerId?: string | null;
  system: string;
  herramientas: HerramientaIA[];
  /** El primer mensaje del usuario: la tarea y sus datos. */
  mensaje: string;
  /** Tope de idas y vueltas con la IA (6 por defecto). */
  maxTurnos?: number;
  /** El agente ejecuta cada herramienta con sus reglas; un error vuelve a la IA como resultado. */
  ejecutar(llamada: LlamadaHerramientaIA): Promise<ResultadoHerramienta>;
};

export type ResultadoAgenteIA =
  | { ok: true; terminado: boolean; turnos: number; herramientas: number; modelo: string; costoUsd: number }
  | { ok: false; motivo: MotivoSinIA; turnos: number; herramientas: number; costoUsd: number };

/**
 * Conversa con la IA hasta que llama a la herramienta que termina, deja de
 * pedir herramientas o llega al tope de turnos. Cada turno queda en ia_uso.
 * La cuota se mira al empezar. Nunca lanza: si la IA falla a mitad de camino,
 * devuelve `ok: false` con las herramientas que ya se ejecutaron, para que el
 * agente siga sin IA sin repetir lo hecho.
 */
export async function conversarConHerramientas(pedido: PedidoAgenteIA, deps: DependenciasIA): Promise<ResultadoAgenteIA> {
  const reloj = deps.reloj ?? Date.now;
  const base = {
    agente: pedido.agente,
    operacion: pedido.operacion,
    proveedor: deps.nombreProveedor,
    orgId: pedido.orgId ?? null,
    producerId: pedido.producerId ?? null,
  };
  const vacio = { turnos: 0, herramientas: 0, costoUsd: 0 };
  if (!deps.proveedor?.conversar) return { ok: false, motivo: "sin_clave", ...vacio };
  if (!deps.configuracion.activa) return { ok: false, motivo: "desactivada", ...vacio };
  if (deps.cuotaAlcanzada) {
    await deps.registrarUso({ ...base, modelo: null, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0, duracionMs: 0, resultado: "sin_cuota" });
    return { ok: false, motivo: "sin_cuota", ...vacio };
  }

  const plan = planDeTarea("actuar", deps.configuracion.modelo);
  const turnos: TurnoIA[] = [{ rol: "usuario", texto: pedido.mensaje }];
  const maxTurnos = pedido.maxTurnos ?? 6;
  let costoUsd = 0;
  let herramientas = 0;
  let modelo = plan.modelo;
  for (let turno = 1; turno <= maxTurnos; turno++) {
    const inicio = reloj();
    let respuesta;
    try {
      respuesta = await deps.proveedor.conversar({
        system: pedido.system,
        herramientas: pedido.herramientas,
        turnos,
        modelo: plan.modelo,
        esfuerzo: plan.esfuerzo,
        maxTokens: plan.maxTokens,
      });
    } catch {
      await deps.registrarUso({ ...base, modelo: plan.modelo, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0, duracionMs: reloj() - inicio, resultado: "error" });
      return { ok: false, motivo: "error", turnos: turno, herramientas, costoUsd };
    }
    costoUsd = Number((costoUsd + respuesta.costoUsd).toFixed(6));
    modelo = respuesta.modelo;
    await deps.registrarUso({
      ...base,
      modelo: respuesta.modelo,
      tokensEntrada: respuesta.tokensEntrada,
      tokensSalida: respuesta.tokensSalida,
      costoUsd: respuesta.costoUsd,
      duracionMs: reloj() - inicio,
      resultado: respuesta.rechazada ? "rechazada" : "ok",
    });
    if (respuesta.rechazada) return { ok: false, motivo: "rechazada", turnos: turno, herramientas, costoUsd };
    turnos.push({ rol: "asistente", contenido: respuesta.contenido });
    if (!respuesta.llamadas.length) return { ok: true, terminado: false, turnos: turno, herramientas, modelo, costoUsd };

    const resultados = [];
    let terminar = false;
    for (const llamada of respuesta.llamadas) {
      let r: ResultadoHerramienta;
      try {
        r = await pedido.ejecutar(llamada);
      } catch {
        r = { contenido: "No se pudo ejecutar la herramienta por un error interno. No la repitas.", esError: true };
      }
      herramientas++;
      terminar ||= Boolean(r.terminar);
      resultados.push({ id: llamada.id, contenido: r.contenido, esError: r.esError });
    }
    if (terminar) return { ok: true, terminado: true, turnos: turno, herramientas, modelo, costoUsd };
    turnos.push({ rol: "usuario", resultados });
  }
  return { ok: true, terminado: false, turnos: maxTurnos, herramientas, modelo, costoUsd };
}
