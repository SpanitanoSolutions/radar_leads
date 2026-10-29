import "server-only";
import { and, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import {
  COMODIN,
  filtroDeConsumo,
  inicioDelMes,
  limiteAlcanzado,
  resolverConfiguracion,
  type AlcanceIA,
  type ConfiguracionIA,
  type FiltroConsumoIA,
} from "./configuracion";
import { ProveedorClaude } from "./claude";
import { planDeTarea } from "./modelos";
import { ejecutarConReintento, type PedidoIA, type ResultadoIA, type UsoIA } from "./motor";
import { registroProveedoresIA } from "./registro";

const PROVEEDOR_POR_DEFECTO = "anthropic";

registroProveedoresIA.registrar(PROVEEDOR_POR_DEFECTO, () => new ProveedorClaude());

async function configuracionPara(alcance: AlcanceIA): Promise<ConfiguracionIA> {
  const filas = await db.select().from(schema.iaConfiguracion).where(and(
    inArray(schema.iaConfiguracion.agente, [alcance.agente, COMODIN]),
    inArray(schema.iaConfiguracion.operacion, [alcance.operacion, COMODIN]),
  ));
  return resolverConfiguracion(filas, alcance);
}

const igualONulo = (columna: AnyPgColumn, valor: string | null) => valor === null ? isNull(columna) : eq(columna, valor);

async function consumoDelMes(filtro: FiltroConsumoIA, desde: Date) {
  const condiciones: SQL[] = [gte(schema.iaUso.creadoEl, desde), igualONulo(schema.iaUso.orgId, filtro.orgId)];
  if (filtro.agente) condiciones.push(eq(schema.iaUso.agente, filtro.agente));
  if (filtro.operacion) condiciones.push(eq(schema.iaUso.operacion, filtro.operacion));
  if (filtro.porProductor) condiciones.push(igualONulo(schema.iaUso.producerId, filtro.producerId));
  const [fila] = await db.select({
    costoUsd: sql<string>`coalesce(sum(${schema.iaUso.costoUsd}), 0)`,
    tokens: sql<string>`coalesce(sum(coalesce(${schema.iaUso.tokensEntrada}, 0) + coalesce(${schema.iaUso.tokensSalida}, 0)), 0)`,
  }).from(schema.iaUso).where(and(...condiciones));
  return { costoUsd: Number(fila?.costoUsd ?? 0), tokens: Number(fila?.tokens ?? 0) };
}

async function cuotaAlcanzada(configuracion: ConfiguracionIA, alcance: AlcanceIA): Promise<boolean> {
  if (!configuracion.limites.length) return false;
  const desde = inicioDelMes(new Date());
  const consumos = await Promise.all(configuracion.limites.map(async (limite) => ({
    limite,
    consumo: await consumoDelMes(filtroDeConsumo(limite, alcance), desde),
  })));
  return limiteAlcanzado(consumos) !== null;
}

/** Si falla el registro no se pierde el resultado que ya se pagó; el error no lleva datos del pedido. */
async function registrarUso(uso: UsoIA) {
  try {
    await db.insert(schema.iaUso).values(uso);
  } catch {
    console.error(`No se pudo registrar el uso de IA de ${uso.agente}/${uso.operacion}.`);
  }
}

function alcanceDe(pedido: { agente: string; operacion: string; orgId?: string | null; producerId?: string | null }): AlcanceIA {
  return { agente: pedido.agente, operacion: pedido.operacion, orgId: pedido.orgId ?? null, producerId: pedido.producerId ?? null };
}

/** Para mostrar en la UI si la IA está disponible para una operación. */
export async function estadoIA(pedido: { agente: string; operacion: string; orgId?: string | null; producerId?: string | null }) {
  if (!process.env.ANTHROPIC_API_KEY) return { habilitada: false, motivo: "sin_clave" as const };
  const alcance = alcanceDe(pedido);
  const configuracion = await configuracionPara(alcance);
  if (!configuracion.activa) return { habilitada: false, motivo: "desactivada" as const };
  if (await cuotaAlcanzada(configuracion, alcance)) return { habilitada: false, motivo: "sin_cuota" as const };
  return { habilitada: true, motivo: "activa" as const };
}

/**
 * Única puerta de los agentes a la IA: elige el modelo de la tarea, aplica
 * activación y cuota, valida la salida con zod y registra cada intento en
 * ia_uso. Nunca lanza por la IA: devuelve `ok: false` con el motivo y el
 * agente sigue en modo manual.
 */
export async function ejecutarIA<T>(pedido: PedidoIA<T>): Promise<ResultadoIA<T>> {
  const alcance = alcanceDe(pedido);
  const configuracion = await configuracionPara(alcance);
  const nombreProveedor = configuracion.proveedor ?? PROVEEDOR_POR_DEFECTO;
  const proveedor = process.env.ANTHROPIC_API_KEY
    ? registroProveedoresIA.resolver({ proveedor: nombreProveedor, modelo: planDeTarea(pedido.tarea, configuracion.modelo).modelo })
    : null;
  return ejecutarConReintento(pedido, {
    proveedor,
    nombreProveedor,
    configuracion,
    cuotaAlcanzada: proveedor && configuracion.activa ? await cuotaAlcanzada(configuracion, alcance) : false,
    registrarUso,
  });
}
