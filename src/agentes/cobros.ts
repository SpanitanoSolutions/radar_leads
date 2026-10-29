import "server-only";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ConfigCobranza, OrigenConfirmacion } from "@/db/schema";
import { diaEnArgentina } from "@/lib/fechas";
import { pesos } from "@/lib/formato";

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Operaciones sobre un cobro (las cuotas del mismo asegurado, compañía y
// vencimiento). Las usan el validador y la cobranza.

/** Ids de las cuotas que se cobran junto con esta (incluida). */
export async function cuotasDelCobro(cabezaId: number): Promise<number[]> {
  const [cabeza] = await db
    .select({ vencimiento: schema.cuotas.vencimiento, aseguradoId: schema.polizas.aseguradoId, compania: schema.polizas.compania })
    .from(schema.cuotas)
    .innerJoin(schema.polizas, eq(schema.polizas.id, schema.cuotas.polizaId))
    .where(eq(schema.cuotas.id, cabezaId));
  if (!cabeza) return [];
  const filas = await db
    .select({ id: schema.cuotas.id, compania: schema.polizas.compania })
    .from(schema.cuotas)
    .innerJoin(schema.polizas, eq(schema.polizas.id, schema.cuotas.polizaId))
    .where(and(eq(schema.cuotas.vencimiento, cabeza.vencimiento), eq(schema.polizas.aseguradoId, cabeza.aseguradoId)));
  return filas.filter((f) => (f.compania ?? "") === (cabeza.compania ?? "")).map((f) => f.id);
}

async function reglaCortar(tx: Transaccion | typeof db = db): Promise<boolean> {
  const [fila] = await tx.select().from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, "cobranza"));
  const config = fila?.config as Partial<ConfigCobranza> | undefined;
  return config?.reglas?.cortarAlConfirmar ?? true;
}

/** Referencias de los mensajes de cobranza de estas cuotas ("cuota:12:paso:2"…). */
function referenciasDe(ids: number[]) {
  return or(...ids.map((id) => like(schema.mensajes.referencia, `cuota:${id}:%`)));
}

/**
 * Corta la secuencia de cobranza de estas cuotas: el seguimiento termina y
 * los borradores pendientes se omiten, salvo que la regla "cortar al
 * confirmar" esté desactivada.
 */
export async function cortarCobranza(tx: Transaccion, ids: number[], novedad: { ultimaNovedad: string; ultimoContacto: string }, ahora: Date) {
  if (!ids.length || !(await reglaCortar(tx))) return;
  await tx
    .update(schema.seguimientosCobranza)
    .set({ estado: "terminado", ...novedad, ultimaNovedadEl: ahora, actualizadoEl: ahora })
    .where(inArray(schema.seguimientosCobranza.cuotaId, ids));
  await tx
    .update(schema.mensajes)
    .set({ estado: "omitido" })
    .where(and(eq(schema.mensajes.estado, "borrador"), inArray(schema.mensajes.agente, ["cobranza", "validador"]), referenciasDe(ids)));
}

/**
 * De estas cuotas, las de los cobros que ya no tienen nada que cobrar: todas
 * sus cuotas están pagadas o canceladas. Un cobro con una cuota pendiente
 * sigue en la secuencia.
 */
export async function cuotasDeCobrosCerrados(tx: Transaccion, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const { cuotas, polizas } = schema;
  const filas = await tx
    .select({ id: cuotas.id, aseguradoId: polizas.aseguradoId, compania: polizas.compania, vencimiento: cuotas.vencimiento, estado: cuotas.estado, estadoValidacion: cuotas.estadoValidacion })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .where(sql`(${polizas.aseguradoId}, ${cuotas.vencimiento}) in (
      select p2.asegurado_id, c2.vencimiento from cuotas c2 join polizas p2 on p2.id = c2.poliza_id where c2.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    )`);
  const grupos = new Map<string, typeof filas>();
  for (const f of filas) {
    const clave = `${f.aseguradoId}|${f.compania ?? ""}|${f.vencimiento}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  const pedidas = new Set(ids);
  return [...grupos.values()]
    .filter((g) => g.some((f) => pedidas.has(f.id)) && g.every((f) => f.estado === "pagada" || f.estadoValidacion === "cancelada"))
    .flatMap((g) => g.map((f) => f.id));
}

/**
 * Confirma el pago de un cobro: marca las cuotas como pagadas, el comprobante
 * como confirmado y corta la secuencia de cobranza (los borradores pendientes
 * se omiten), salvo que la regla esté desactivada.
 */
export async function confirmarCobro(cabezaId: number, opciones: { medio: string; conProblemas?: boolean; origen?: OrigenConfirmacion }) {
  const ids = await cuotasDelCobro(cabezaId);
  if (!ids.length) throw new Error("Cuota inexistente");
  const ahora = new Date();
  await db.transaction(async (tx) => {
    const pagadas = await tx
      .update(schema.cuotas)
      .set({
        estado: "pagada",
        pagadaEl: ahora,
        medioPago: opciones.medio,
        estadoValidacion: "pagada",
        fechaPago: diaEnArgentina(ahora),
        origenConfirmacion: opciones.origen ?? "manual",
        ultimaRevision: ahora,
      })
      .where(inArray(schema.cuotas.id, ids))
      .returning({ monto: schema.cuotas.monto, numero: schema.cuotas.numero, polizaId: schema.cuotas.polizaId });
    await tx
      .update(schema.comprobantes)
      .set({ estado: "confirmado", revisadoEl: ahora })
      .where(and(inArray(schema.comprobantes.cuotaId, ids), eq(schema.comprobantes.estado, "por_revisar")));
    await cortarCobranza(tx, ids, { ultimaNovedad: "Pagó", ultimoContacto: "Pago confirmado" }, ahora);
    const [poliza] = await tx
      .select({ aseguradoId: schema.polizas.aseguradoId, ramo: schema.polizas.ramo })
      .from(schema.polizas)
      .where(eq(schema.polizas.id, pagadas[0].polizaId));
    const total = pagadas.reduce((s, c) => s + c.monto, 0);
    const texto = `Pago confirmado: cuota ${pagadas[0].numero} de ${poliza.ramo.toLowerCase()} (${pesos(total)})${
      opciones.conProblemas ? ", confirmado aunque el comprobante tenía diferencias" : ""
    }.`;
    await tx.insert(schema.notasAsegurado).values({ aseguradoId: poliza.aseguradoId, tipo: "sistema", texto });
    await tx.insert(schema.actividadAgentes).values({ agente: "validador", referencia: `cuota:${cabezaId}`, texto });
  });
}

/** Pone en pausa la secuencia de cobranza de un cobro (promesa de pago, pago con problemas). */
export async function pausarSeguimiento(cabezaId: number, motivo: string, datos: { promesa?: string; contacto?: string } = {}) {
  const ahora = new Date();
  const valores = {
    estado: "pausado" as const,
    motivoPausa: motivo,
    promesaPagoEl: datos.promesa ?? null,
    ultimaNovedad: motivo,
    ultimoContacto: datos.contacto ?? null,
    ultimaNovedadEl: ahora,
    actualizadoEl: ahora,
  };
  await db
    .insert(schema.seguimientosCobranza)
    .values({ cuotaId: cabezaId, paso: 0, ...valores })
    .onConflictDoUpdate({ target: schema.seguimientosCobranza.cuotaId, set: valores });
}
