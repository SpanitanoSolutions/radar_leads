"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { AlcanceLicitacion, EstadoLead, Prioridad, Zona } from "@/db/schema";
import { requerirSesion } from "@/lib/auth";
import { ALCANCES, ESTADOS, PRIORIDADES, ZONAS } from "@/lib/catalogos";

function idDeLead(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Lead inválido");
  return id;
}

export async function cambiarEstado(formData: FormData) {
  await requerirSesion();
  const id = idDeLead(formData);
  const estado = String(formData.get("estado")) as EstadoLead;
  if (!ESTADOS.some((e) => e.id === estado)) throw new Error("Estado inválido");
  await db
    .update(schema.leads)
    .set({ estado, actualizadoEl: new Date() })
    .where(eq(schema.leads.id, id));
  revalidatePath("/");
  revalidatePath(`/leads/${id}`);
}

export async function guardarSeguimiento(formData: FormData) {
  await requerirSesion();
  const id = idDeLead(formData);
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 5000) || null;
  const fecha = String(formData.get("recordatorio") ?? "");
  const recordatorio = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  await db
    .update(schema.leads)
    .set({ nota, recordatorio, actualizadoEl: new Date() })
    .where(eq(schema.leads.id, id));
  revalidatePath(`/leads/${id}`);
  redirect(`/leads/${id}?guardado=1`);
}

export async function guardarAjustes(formData: FormData) {
  await requerirSesion();

  const sectores = await db.select({ id: schema.sectores.id }).from(schema.sectores);
  for (const { id } of sectores) {
    const prioridad = String(formData.get(`prioridad_${id}`)) as Prioridad;
    await db
      .update(schema.sectores)
      .set({
        activo: formData.get(`activo_${id}`) === "on",
        ...(PRIORIDADES.some((p) => p.id === prioridad) ? { prioridad } : {}),
      })
      .where(eq(schema.sectores.id, id));
  }

  const zonas = Object.fromEntries(
    ZONAS.map((z) => [z.id, formData.get(`zona_${z.id}`) === "on"]),
  ) as Record<Zona, boolean>;
  const licitaciones = Object.fromEntries(
    ALCANCES.map((a) => [a.id, formData.get(`licitacion_${a.id}`) === "on"]),
  ) as Record<AlcanceLicitacion, boolean>;

  await db
    .insert(schema.ajustes)
    .values({ id: 1, zonas, licitaciones })
    .onConflictDoUpdate({
      target: schema.ajustes.id,
      set: { zonas, licitaciones, actualizadoEl: new Date() },
    });

  revalidatePath("/", "layout");
  redirect("/sectores?guardado=1");
}
