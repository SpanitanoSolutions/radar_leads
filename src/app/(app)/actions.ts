"use server";

import { eq, sql, type AnyColumn } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { AlcanceLicitacion, EstadoLead, Prioridad, Zona } from "@/db/schema";
import { requerirSesion } from "@/lib/auth";
import { ALCANCES, ESTADOS, PRIORIDADES, RAMOS, ZONAS } from "@/lib/catalogos";
import { esMotivoDescarte, estadoImplicaContacto, motivoImplicaContacto, parsearMonto } from "@/lib/cierre";
import { diaEnArgentina, sumarDias } from "@/lib/fechas";

/** "Para después": vuelve a aparecer arriba (y en el resumen diario) dentro de dos semanas. */
const DIAS_PARA_DESPUES = 14;

const { leads } = schema;

/** Primera vez que pasó algo: si ya tenía fecha, se conserva. */
const primeraVez = (columna: AnyColumn) => sql`coalesce(${columna}, now())`;

function revalidarLead(id: number) {
  revalidatePath("/");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/resultados");
}

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
    .update(leads)
    .set({
      estado,
      actualizadoEl: new Date(),
      ...(estadoImplicaContacto(estado) && { contactadoEl: primeraVez(leads.contactadoEl) }),
      ...(estado === "reunion" && { reunionEl: primeraVez(leads.reunionEl) }),
    })
    .where(eq(leads.id, id));
  revalidarLead(id);
}

/** Desde la lista: deja el lead para dentro de dos semanas, con recordatorio. */
export async function posponerLead(formData: FormData) {
  await requerirSesion();
  const id = idDeLead(formData);
  await db
    .update(leads)
    .set({ recordatorio: sumarDias(diaEnArgentina(new Date()), DIAS_PARA_DESPUES), actualizadoEl: new Date() })
    .where(eq(leads.id, id));
  revalidarLead(id);
}

/** Marca el lead como cerrado, con lo que se vendió (todo opcional). */
export async function cerrarLead(formData: FormData) {
  await requerirSesion();
  const id = idDeLead(formData);
  const ramos = [...new Set(formData.getAll("ramo").map(String))].filter((r) => r in RAMOS);
  await db
    .update(leads)
    .set({
      estado: "cerrado",
      cierreRamos: ramos.length ? ramos : null,
      cierrePrima: parsearMonto(formData.get("prima")?.toString()),
      cierreComision: parsearMonto(formData.get("comision")?.toString()),
      motivoDescarte: null,
      contactadoEl: primeraVez(leads.contactadoEl),
      cerradoEl: primeraVez(leads.cerradoEl),
      actualizadoEl: new Date(),
    })
    .where(eq(leads.id, id));
  revalidarLead(id);
}

/** Descarta el lead con un motivo, para saber qué fuentes rinden y cuáles no. */
export async function descartarLead(formData: FormData) {
  await requerirSesion();
  const id = idDeLead(formData);
  const motivo = String(formData.get("motivo") ?? "");
  if (!esMotivoDescarte(motivo)) throw new Error("Motivo inválido");
  await db
    .update(leads)
    .set({
      estado: "descartado",
      motivoDescarte: motivo,
      actualizadoEl: new Date(),
      ...(motivoImplicaContacto(motivo) && { contactadoEl: primeraVez(leads.contactadoEl) }),
    })
    .where(eq(leads.id, id));
  revalidarLead(id);
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
