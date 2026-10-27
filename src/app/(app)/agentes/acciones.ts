"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { CONFIG_COBRANZA_INICIAL } from "@/agentes/cobranza/secuencia";
import { requerirSesion } from "@/lib/auth";

const AGENTES = ["cotizacion", "validador", "siniestros", "cobranza", "conciliador"];

/** "Activar agente": deja al agente listo para trabajar (el menú empieza a mostrar sus pendientes). */
export async function activarAgente(formData: FormData) {
  await requerirSesion();
  const agente = String(formData.get("agente"));
  if (!AGENTES.includes(agente)) throw new Error("Agente desconocido");
  await db
    .insert(schema.configuracionAgentes)
    .values({ agente, configurado: true, config: agente === "cobranza" ? CONFIG_COBRANZA_INICIAL : {} })
    .onConflictDoUpdate({ target: schema.configuracionAgentes.agente, set: { configurado: true, actualizadoEl: new Date() } });
  revalidatePath("/", "layout");
}

/** Pausa el agente sin borrar sus reglas ni el historial guardado. */
export async function desactivarAgente(formData: FormData) {
  await requerirSesion();
  const agente = String(formData.get("agente"));
  if (!AGENTES.includes(agente)) throw new Error("Agente desconocido");
  await db
    .insert(schema.configuracionAgentes)
    .values({ agente, configurado: false, config: agente === "cobranza" ? CONFIG_COBRANZA_INICIAL : {} })
    .onConflictDoUpdate({ target: schema.configuracionAgentes.agente, set: { configurado: false, actualizadoEl: new Date() } });
  revalidatePath("/", "layout");
}
