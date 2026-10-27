"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { enviarMensaje } from "@/agentes/envio";
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

export async function aprobarMensaje(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const texto = formData.get("texto");
  const resultado = await enviarMensaje(id, { texto: typeof texto === "string" ? texto : undefined });
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
  revalidatePath("/", "layout");
  volver(formData, resultado.ok ? "mensaje-enviado" : "mensaje-error");
}

export async function omitirMensaje(formData: FormData) {
  await requerirSesion();
  await db.update(schema.mensajes).set({ estado: "omitido" }).where(eq(schema.mensajes.id, idDe(formData)));
  revalidatePath("/", "layout");
  volver(formData, "mensaje-omitido");
}
