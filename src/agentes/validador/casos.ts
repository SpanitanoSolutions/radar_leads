import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CambioAplicable } from "@/lib/validador/procesar";
import { guardarProceso, type AlcanceValidador } from "./cartera";

// Los casos "a revisar" y los pagos no identificados de los listados y los
// conectores. La IA puede haber explicado el caso y sugerido una cuota, pero
// lo decide el productor: aplicar lo que informó la compañía a una de las
// cuotas candidatas o dejarlo como está.

const AGENTE = "validador";
const p = schema.validadorPagosDetectados;

export type DecisionCaso = { tipo: "aplicar"; cuotaId: number } | { tipo: "descartar" };

async function casoAbierto(pagoId: number) {
  const [fila] = await db
    .select({ pago: p, fuente: schema.validadorFuentes })
    .from(p)
    .innerJoin(schema.validadorFuentes, eq(schema.validadorFuentes.id, p.fuenteId))
    .where(eq(p.id, pagoId));
  if (!fila) throw new Error("El caso ya no existe.");
  if (fila.pago.revisadoEl) throw new Error("Ese caso ya se revisó.");
  return fila;
}

/**
 * Aplica lo que informó la compañía (pagada o anulada) a la cuota que eligió
 * el productor, que tiene que ser una de las candidatas. Usa el mismo camino
 * que la corrida: no pisa una cuota pagada ni una cancelada, deja la nota en
 * la ficha y corta la cobranza si el cobro quedó cerrado.
 */
export async function resolverCaso(pagoId: number, decision: DecisionCaso, alcance: AlcanceValidador): Promise<"aplicado" | "descartado"> {
  const { pago, fuente } = await casoAbierto(pagoId);
  const ahora = new Date();
  const lugar = `${fuente.compania}${pago.fila ? `, fila ${pago.fila}` : ""}`;

  if (decision.tipo === "descartar") {
    await db.update(p).set({ revisadoEl: ahora }).where(eq(p.id, pagoId));
    await db.insert(schema.actividadAgentes).values({ agente: AGENTE, referencia: `pago:${pagoId}`, texto: `Dejaste como está un caso del listado de ${lugar}.` });
    return "descartado";
  }

  const candidatas = new Set([...pago.candidatos.map((c) => c.cuotaId), ...(pago.cuotaId ? [pago.cuotaId] : [])]);
  if (!candidatas.has(decision.cuotaId)) throw new Error("Esa cuota no es una de las candidatas del caso.");
  const { datos } = pago;
  const cambio: CambioAplicable | null =
    datos.estadoCompania === "pagada"
      ? { cuotaId: decision.cuotaId, tipo: "marcar_pagada", fechaPago: datos.fechaPago, medio: datos.medio }
      : datos.estadoCompania === "anulada"
        ? { cuotaId: decision.cuotaId, tipo: "marcar_cancelada", motivo: "Anulada según la compañía (lo confirmaste en el Validador).", fecha: null }
        : null;
  if (!cambio) throw new Error("La compañía la informa impaga: no hay nada que aplicar. Podés enviarla a Cobranza.");

  const actualizadas = await guardarProceso({
    fuenteId: fuente.id,
    corridaId: null,
    compania: fuente.compania,
    tipo: fuente.tipo as "api" | "portal" | "archivo",
    resultado: { pagos: [], cambios: [cambio], revisadas: [decision.cuotaId], totales: { confirmados: 0, aRevisar: 0, noIdentificados: 0, pagadas: 0, canceladas: 0 } },
    alcance,
  });
  if (!actualizadas) throw new Error("Esa cuota ya está pagada o cancelada: no se cambió nada.");
  await db.update(p).set({ revisadoEl: ahora, cuotaId: decision.cuotaId, cambio: cambio.tipo }).where(eq(p.id, pagoId));
  await db.insert(schema.actividadAgentes).values({
    agente: AGENTE,
    referencia: `pago:${pagoId}`,
    texto: `Confirmaste un caso del listado de ${lugar}: la cuota quedó ${cambio.tipo === "marcar_pagada" ? "pagada" : "cancelada"}.`,
  });
  return "aplicado";
}

/** El caso se resolvió por otro camino (por ejemplo, se envió a Cobranza). */
export async function marcarCasoRevisado(pagoId: number) {
  await casoAbierto(pagoId);
  await db.update(p).set({ revisadoEl: new Date() }).where(eq(p.id, pagoId));
}
