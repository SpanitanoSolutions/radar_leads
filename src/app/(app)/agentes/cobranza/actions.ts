"use server";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { confirmarCobro } from "@/agentes/cobros";
import {
  actualizarCasos,
  actualizarContacto,
  cambiarNoContactar,
  casosDeCuotas,
  despuesDeEnviarMensaje,
  reactivarCaso,
  registrarEventos,
} from "@/agentes/cobranza/casos";
import { enviarMensaje } from "@/agentes/envio";
import { requerirSesion } from "@/lib/auth";
import { cuentaComoIntento, leerReferencia } from "@/lib/cobranza";
import { diaEnArgentina, diaYMes, sumarDias } from "@/lib/fechas";
import { leerFecha } from "@/lib/importacion";

const AGENTES = ["cobranza", "validador"];

function entero(valor: FormDataEntryValue | null, que = "Dato"): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${que} inválido`);
  return id;
}

/** Vuelve a la pantalla de la que vino la acción (el tablero o un caso), con el aviso. */
function volver(formData: FormData, aviso: string): never {
  revalidatePath("/", "layout");
  const destino = String(formData.get("volver") ?? "");
  const base = /^\/agentes\/cobranza(\/\d+)?(\?[\w=&-]*)?$/.test(destino) ? destino : "/agentes/cobranza?tab=aprobar";
  redirect(`${base}${base.includes("?") ? "&" : "?"}aviso=${aviso}`);
}

async function mensaje(id: number) {
  const [m] = await db.select().from(schema.mensajes).where(eq(schema.mensajes.id, id));
  if (!m || !AGENTES.includes(m.agente)) throw new Error("Mensaje inexistente");
  return m;
}

async function caso(formData: FormData) {
  const [k] = await db.select().from(schema.cobranzaCasos).where(eq(schema.cobranzaCasos.id, entero(formData.get("casoId"), "Caso")));
  if (!k) throw new Error("Caso inexistente");
  return k;
}

/** Los casos a los que corresponde un borrador o una llamada. */
async function casosDelMensaje(m: { id: number; referencia: string | null }) {
  const ligados = await db
    .select({ casoId: schema.cobranzaEventos.casoId })
    .from(schema.cobranzaEventos)
    .where(sql`${schema.cobranzaEventos.datos} ->> 'mensajeId' = ${String(m.id)}`);
  if (ligados.length) return db.select().from(schema.cobranzaCasos).where(inArray(schema.cobranzaCasos.id, [...new Set(ligados.map((l) => l.casoId))]));
  const ref = leerReferencia(m.referencia);
  return ref ? casosDeCuotas([ref.cuotaId]) : [];
}

// ---------- Para aprobar ----------

export async function aprobarMensaje(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(entero(formData.get("id"), "Mensaje"));
  const texto = formData.get("texto");
  const r = await enviarMensaje(m.id, { texto: typeof texto === "string" ? texto : undefined });
  if (!r.ok) {
    console.error(`No se pudo enviar el mensaje ${m.id}:`, r.error);
    volver(formData, "mensaje-error");
  }
  const [enviado] = await db.select().from(schema.mensajes).where(eq(schema.mensajes.id, m.id));
  const ref = leerReferencia(m.referencia);
  await despuesDeEnviarMensaje(enviado, ref ? cuentaComoIntento(ref.tipo) : false);
  volver(formData, "mensaje-enviado");
}

/** "Aprobar y enviar N mensajes": todos los que esperan, menos las llamadas. */
export async function aprobarTodos(formData: FormData) {
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
      const [enviado] = await db.select().from(schema.mensajes).where(eq(schema.mensajes.id, m.id));
      const ref = leerReferencia(m.referencia);
      await despuesDeEnviarMensaje(enviado, ref ? cuentaComoIntento(ref.tipo) : false);
    } catch (error) {
      errores++;
      console.error(`Falló el envío o la línea de tiempo del mensaje ${m.id}:`, error);
    }
  }
  volver(formData, `envios-lote-${enviados}-errores-${errores}`);
}

export async function omitirMensaje(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(entero(formData.get("id"), "Mensaje"));
  await db.update(schema.mensajes).set({ estado: "omitido" }).where(eq(schema.mensajes.id, m.id));
  const lista = await casosDelMensaje(m);
  await registrarEventos(lista.map((k) => ({ casoId: k.id, tipo: "nota" as const, resumen: "Omitiste el mensaje: no salió nada.", datos: { mensajeId: m.id } })));
  volver(formData, "mensaje-omitido");
}

export async function posponerMensaje(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(entero(formData.get("id"), "Mensaje"));
  await db
    .update(schema.mensajes)
    .set({ mostrarDesde: sumarDias(diaEnArgentina(new Date()), 1) })
    .where(eq(schema.mensajes.id, m.id));
  volver(formData, "pospuesto");
}

// ---------- Llamadas ----------

export async function registrarPromesa(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(entero(formData.get("id"), "Mensaje"));
  const fecha = leerFecha(String(formData.get("fecha") ?? ""));
  if (!fecha || "error" in fecha) volver(formData, "promesa-sin-fecha");
  const ahora = new Date();
  await db.update(schema.mensajes).set({ estado: "hecho", enviadoEl: ahora }).where(eq(schema.mensajes.id, m.id));
  for (const k of await casosDelMensaje(m)) {
    await actualizarCasos(
      [k.id],
      { estado: "promesa", promesaEl: fecha.iso, motivo: "Promesa de pago", intentos: k.intentos + 1, ultimoContactoEl: ahora },
      { tipo: "promesa", canal: "telefono", resumen: `Lo llamaste: prometió pagar el ${diaYMes(fecha.iso)}.`, datos: { mensajeId: m.id } },
    );
  }
  volver(formData, "promesa-registrada");
}

export async function llameNoAtendio(formData: FormData) {
  await requerirSesion();
  const m = await mensaje(entero(formData.get("id"), "Mensaje"));
  const ahora = new Date();
  await db.update(schema.mensajes).set({ mostrarDesde: sumarDias(diaEnArgentina(ahora), 1) }).where(eq(schema.mensajes.id, m.id));
  for (const k of await casosDelMensaje(m)) {
    await actualizarCasos(
      [k.id],
      { intentos: k.intentos + 1, ultimoContactoEl: ahora, ...(k.estado === "pendiente" ? { estado: "sin_respuesta" as const } : {}) },
      { tipo: "sin_respuesta", canal: "telefono", resumen: `Lo llamaste y no atendió. Intento ${k.intentos + 1}.`, datos: { mensajeId: m.id } },
    );
  }
  volver(formData, "llamada-anotada");
}

// ---------- Acciones del caso ----------

export async function marcarComoPagado(formData: FormData) {
  await requerirSesion();
  const k = await caso(formData);
  if (k.estado === "pagado") volver(formData, "cuota-cerrada");
  await confirmarCobro(k.cuotaId, { medio: "Marcado como pagado en Cobranza", origen: "manual" });
  volver(formData, "caso-pagado");
}

export async function reactivarRecibo(formData: FormData) {
  await requerirSesion();
  const k = await caso(formData);
  const r = await reactivarCaso(k.id);
  volver(formData, r === "ok" ? "caso-reactivado" : r === "baja" ? "caso-baja" : "caso-no-reactivable");
}

export async function cambiarMarcaNoContactar(formData: FormData) {
  await requerirSesion();
  const k = await caso(formData);
  const marcar = formData.get("marcar") === "1";
  await cambiarNoContactar(k.aseguradoId, marcar);
  volver(formData, marcar ? "marcado-no-contactar" : "desmarcado-no-contactar");
}

const limpio = (v: FormDataEntryValue | null) => String(v ?? "").trim().slice(0, 200) || null;

export async function guardarContactoCaso(formData: FormData) {
  await requerirSesion();
  const k = await caso(formData);
  const email = limpio(formData.get("email"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) volver(formData, "contacto-invalido");
  await actualizarContacto(k.id, { telefono: limpio(formData.get("telefono")), email });
  volver(formData, "contacto-guardado");
}
