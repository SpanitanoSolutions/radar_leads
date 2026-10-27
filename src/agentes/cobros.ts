import "server-only";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ConfigCobranza } from "@/db/schema";
import { pesos } from "@/lib/formato";

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

async function reglaCortar(): Promise<boolean> {
  const [fila] = await db.select().from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, "cobranza"));
  const config = fila?.config as Partial<ConfigCobranza> | undefined;
  return config?.reglas?.cortarAlConfirmar ?? true;
}

/** Referencias de los mensajes de cobranza de estas cuotas ("cuota:12:paso:2"…). */
function referenciasDe(ids: number[]) {
  return or(...ids.map((id) => like(schema.mensajes.referencia, `cuota:${id}:%`)));
}

/**
 * Confirma el pago de un cobro: marca las cuotas como pagadas, el comprobante
 * como confirmado y corta la secuencia de cobranza (los borradores pendientes
 * se omiten), salvo que la regla esté desactivada.
 */
export async function confirmarCobro(cabezaId: number, opciones: { medio: string; conProblemas?: boolean }) {
  const ids = await cuotasDelCobro(cabezaId);
  if (!ids.length) throw new Error("Cuota inexistente");
  const cortar = await reglaCortar();
  const ahora = new Date();
  await db.transaction(async (tx) => {
    const pagadas = await tx
      .update(schema.cuotas)
      .set({ estado: "pagada", pagadaEl: ahora, medioPago: opciones.medio })
      .where(inArray(schema.cuotas.id, ids))
      .returning({ monto: schema.cuotas.monto, numero: schema.cuotas.numero, polizaId: schema.cuotas.polizaId });
    await tx
      .update(schema.comprobantes)
      .set({ estado: "confirmado", revisadoEl: ahora })
      .where(and(inArray(schema.comprobantes.cuotaId, ids), eq(schema.comprobantes.estado, "por_revisar")));
    if (cortar) {
      await tx
        .update(schema.seguimientosCobranza)
        .set({ estado: "terminado", ultimaNovedad: "Pagó", ultimoContacto: "Pago confirmado", ultimaNovedadEl: ahora, actualizadoEl: ahora })
        .where(inArray(schema.seguimientosCobranza.cuotaId, ids));
      await tx
        .update(schema.mensajes)
        .set({ estado: "omitido" })
        .where(and(eq(schema.mensajes.estado, "borrador"), inArray(schema.mensajes.agente, ["cobranza", "validador"]), referenciasDe(ids)));
    }
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
