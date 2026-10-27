"use server";

import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { ConfigCobranza } from "@/db/schema";
import { pausarSeguimiento } from "@/agentes/cobros";
import { leerConfigCobranza, marcarPaso } from "@/agentes/cobranza";
import { PASOS_COBRANZA } from "@/agentes/cobranza/secuencia";
import { enviarMensaje } from "@/agentes/envio";
import { requerirSesion } from "@/lib/auth";
import { leerReferencia } from "@/lib/cobranza";
import { diaEnArgentina, sumarDias } from "@/lib/fechas";
import { leerFecha } from "@/lib/importacion";

const AGENTES = ["cobranza", "validador"];

function idDe(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Mensaje inválido");
  return id;
}

function volver(aviso: string, pestana = "aprobar"): never {
  revalidatePath("/", "layout");
  redirect(`/agentes/cobranza?tab=${pestana}&aviso=${aviso}`);
}

async function mensaje(id: number) {
  const [m] = await db.select().from(schema.mensajes).where(eq(schema.mensajes.id, id));
  if (!m || !AGENTES.includes(m.agente)) throw new Error("Mensaje inexistente");
  return m;
}

/** Lo que pasa en la secuencia después de que sale un mensaje. */
async function despuesDeEnviar(referencia: string | null, canal: string) {
  const ref = leerReferencia(referencia);
  if (!ref) return;
  const contacto = canal === "whatsapp" ? "WhatsApp" : "Email";
  if (typeof ref.tipo === "number") await marcarPaso(ref.cuotaId, ref.tipo, contacto);
  else if (ref.tipo === "diferencia") await pausarSeguimiento(ref.cuotaId, "Se pidió la diferencia", { contacto });
  else if (ref.tipo === "comprobante") await pausarSeguimiento(ref.cuotaId, "Se pidió otro comprobante", { contacto });
}

export async function aprobarMensaje(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(idDe(formData));
  const texto = formData.get("texto");
  const r = await enviarMensaje(m.id, { texto: typeof texto === "string" ? texto : undefined });
  if (!r.ok) {
    console.error(`No se pudo enviar el mensaje ${m.id}:`, r.error);
    volver("mensaje-error");
  }
  await despuesDeEnviar(m.referencia, m.canal);
  volver("mensaje-enviado");
}

/** "Aprobar y enviar N mensajes": todos los que esperan, menos las llamadas. */
export async function aprobarTodos() {
  await requerirSesion();
  const hoy = diaEnArgentina(new Date());
  const pendientes = await db
    .select()
    .from(schema.mensajes)
    .where(
      and(
        eq(schema.mensajes.estado, "borrador"),
        inArray(schema.mensajes.agente, AGENTES),
        inArray(schema.mensajes.canal, ["whatsapp", "email"]),
        or(isNull(schema.mensajes.mostrarDesde), lte(schema.mensajes.mostrarDesde, hoy)),
      ),
    );
  let enviados = 0;
  let errores = 0;
  for (const m of pendientes) {
    try {
      const resultado = await enviarMensaje(m.id);
      if (!resultado.ok) {
        errores++;
        console.error(`No se pudo enviar el mensaje ${m.id}:`, resultado.error);
        continue;
      }
      enviados++;
      await despuesDeEnviar(m.referencia, m.canal);
    } catch (error) {
      errores++;
      console.error(`Falló el envío o la actualización del seguimiento del mensaje ${m.id}:`, error);
    }
  }
  volver(`envios-lote-${enviados}-errores-${errores}`);
}

export async function omitirMensaje(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(idDe(formData));
  await db.update(schema.mensajes).set({ estado: "omitido" }).where(eq(schema.mensajes.id, m.id));
  const ref = leerReferencia(m.referencia);
  // El paso omitido cuenta como hecho: mañana el agente no lo vuelve a proponer.
  if (ref && typeof ref.tipo === "number") await marcarPaso(ref.cuotaId, ref.tipo, "Omitido por vos");
  volver("mensaje-omitido");
}

// ---------- Llamadas ----------

export async function registrarPromesa(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(idDe(formData));
  const fecha = leerFecha(String(formData.get("fecha") ?? ""));
  if (!fecha || "error" in fecha) volver("promesa-sin-fecha");
  const ref = leerReferencia(m.referencia);
  await db.update(schema.mensajes).set({ estado: "hecho", enviadoEl: new Date() }).where(eq(schema.mensajes.id, m.id));
  if (ref) {
    await marcarPaso(ref.cuotaId, 4, "Llamada tuya");
    await pausarSeguimiento(ref.cuotaId, "Promesa de pago", { promesa: fecha.iso, contacto: "Llamada tuya" });
  }
  volver("promesa-registrada");
}

export async function llameNoAtendio(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(idDe(formData));
  const manana = sumarDias(diaEnArgentina(new Date()), 1);
  await db.update(schema.mensajes).set({ mostrarDesde: manana }).where(eq(schema.mensajes.id, m.id));
  const ref = leerReferencia(m.referencia);
  if (ref) {
    await db
      .update(schema.seguimientosCobranza)
      .set({ ultimaNovedad: "Llamaste y no atendió", ultimoContacto: "Llamada tuya", ultimaNovedadEl: new Date(), actualizadoEl: new Date() })
      .where(eq(schema.seguimientosCobranza.cuotaId, ref.cuotaId));
  }
  volver("llamada-anotada");
}

export async function posponerMensaje(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(idDe(formData));
  await db
    .update(schema.mensajes)
    .set({ mostrarDesde: sumarDias(diaEnArgentina(new Date()), 1) })
    .where(eq(schema.mensajes.id, m.id));
  volver("pospuesto");
}

// ---------- Secuencia ----------

export async function guardarSecuencia(formData: FormData) {
  await requerirSesion();
  const actual = await leerConfigCobranza();
  const config: ConfigCobranza = {
    pasos: PASOS_COBRANZA.map((p) => {
      const plantilla = String(formData.get(`plantilla-${p.paso}`) ?? "").trim().slice(0, 1000);
      return {
        paso: p.paso,
        plantilla: p.tarea ? p.plantilla : plantilla || (actual.pasos.find((x) => x.paso === p.paso)?.plantilla ?? p.plantilla),
        // La llamada siempre la hace el productor.
        automatico: !p.tarea && formData.get(`auto-${p.paso}`) === "on",
      };
    }),
    reglas: {
      cortarAlConfirmar: formData.get("cortarAlConfirmar") === "on",
      horario: formData.get("horario") === "on",
      contactoAdministracion: formData.get("contactoAdministracion") === "on",
      avisarRespuestas: formData.get("avisarRespuestas") === "on",
    },
  };
  await db
    .insert(schema.configuracionAgentes)
    .values({ agente: "cobranza", configurado: true, config })
    .onConflictDoUpdate({ target: schema.configuracionAgentes.agente, set: { config, actualizadoEl: new Date() } });
  volver("secuencia-guardada", "secuencia");
}
