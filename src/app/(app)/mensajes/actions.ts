"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { enviarMensaje } from "@/agentes/envio";
import type { ResultadoEnvio } from "@/conexiones/tipos";
import { requerirSesion } from "@/lib/auth";

// Aprobar u omitir un borrador que preparó un agente (avisos de vencimiento y
// otros sin pasos propios). Cobranza tiene sus propias acciones porque además
// mueve la secuencia.

function idDe(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Mensaje inválido");
  return id;
}

function volver(formData: FormData, aviso: string): never {
  const destino = String(formData.get("volver") ?? "/vencimientos");
  const url = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/vencimientos";
  redirect(`${url}${url.includes("?") ? "&" : "?"}aviso=${aviso}`);
}

/** Envía el mensaje y, si es un aviso de la cartera, lo anota en la ficha del asegurado. */
async function enviarYAnotar(id: number, texto: string | undefined): Promise<ResultadoEnvio> {
  const resultado = await enviarMensaje(id, { texto });
  if (resultado.ok) {
    const [m] = await db.select().from(schema.mensajes).where(eq(schema.mensajes.id, id));
    if (m?.aseguradoId && m.agente === "cartera") {
      await db.insert(schema.notasAsegurado).values({
        aseguradoId: m.aseguradoId,
        tipo: "sistema",
        texto: `Aviso de vencimiento enviado por ${m.canal === "whatsapp" ? "WhatsApp" : "email"}.`,
      });
    }
  }
  return resultado;
}

/** Solo se omite lo que todavía es borrador: un mensaje enviado no cambia de estado. */
async function omitir(id: number) {
  await db
    .update(schema.mensajes)
    .set({ estado: "omitido" })
    .where(and(eq(schema.mensajes.id, id), eq(schema.mensajes.estado, "borrador")));
}

export async function aprobarMensaje(formData: FormData) {
  await requerirSesion();
  const texto = formData.get("texto");
  const resultado = await enviarYAnotar(idDe(formData), typeof texto === "string" ? texto : undefined);
  revalidatePath("/", "layout");
  volver(formData, resultado.ok ? "mensaje-enviado" : "mensaje-error");
}

export async function omitirMensaje(formData: FormData) {
  await requerirSesion();
  await omitir(idDe(formData));
  revalidatePath("/", "layout");
  volver(formData, "mensaje-omitido");
}

// Las mismas acciones para la ventana del aviso: responden con el resultado en
// lugar de redirigir, así la ventana muestra el éxito o el error ahí mismo.

export async function enviarAviso(id: number, texto: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requerirSesion();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Ese mensaje ya no está pendiente." };
  let resultado: ResultadoEnvio;
  try {
    resultado = await enviarYAnotar(id, texto);
  } catch {
    resultado = { ok: false, error: "Hubo un problema inesperado. Probá de nuevo en un rato." };
  }
  revalidatePath("/", "layout");
  return resultado.ok ? { ok: true } : { ok: false, error: resultado.error };
}

export async function omitirAviso(id: number): Promise<void> {
  await requerirSesion();
  if (!Number.isInteger(id) || id <= 0) return;
  await omitir(id);
  revalidatePath("/", "layout");
}
