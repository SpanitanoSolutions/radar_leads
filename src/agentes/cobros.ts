import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrigenConfirmacion } from "@/db/schema";
import { cerrarPorPago, pausarCaso } from "./cobranza/casos";
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

/**
 * El cobro se pagó: sus casos de Cobranza pasan a pagado (con `texto` en la
 * línea de tiempo) y los borradores pendientes se omiten.
 */
export async function cortarCobranza(tx: Transaccion, ids: number[], texto: string, ahora: Date) {
  if (!ids.length) return;
  await cerrarPorPago(tx, ids, texto, ahora);
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
 * Confirma el pago de un cobro: marca las cuotas como pagadas (el día de pago
 * es hoy, salvo que se indique otro), el comprobante como confirmado y corta
 * la cobranza (el caso pasa a pagado y los borradores pendientes se omiten).
 */
export async function confirmarCobro(cabezaId: number, opciones: { medio: string; conProblemas?: boolean; origen?: OrigenConfirmacion; fechaPago?: string }) {
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
        fechaPago: opciones.fechaPago ?? diaEnArgentina(ahora),
        origenConfirmacion: opciones.origen ?? "manual",
        ultimaRevision: ahora,
      })
      .where(inArray(schema.cuotas.id, ids))
      .returning({ monto: schema.cuotas.monto, numero: schema.cuotas.numero, polizaId: schema.cuotas.polizaId });
    await tx
      .update(schema.comprobantes)
      .set({ estado: "confirmado", revisadoEl: ahora })
      .where(and(inArray(schema.comprobantes.cuotaId, ids), eq(schema.comprobantes.estado, "por_revisar")));
    await cortarCobranza(tx, ids, `Pago confirmado: ${opciones.medio}.`, ahora);
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

/** Frena la cobranza de un cobro: promesa de pago, o pago con problemas (se escala al productor). */
export async function pausarCobranza(cabezaId: number, motivo: string, datos: { promesa?: string; contacto?: string } = {}) {
  await pausarCaso(cabezaId, motivo, datos);
}
