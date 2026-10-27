"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { crearSolicitud } from "@/agentes/cotizacion/solicitudes";
import type { EstadoCotizacion } from "@/lib/cotizacion";
import { requerirSesion } from "@/lib/auth";

const ESTADOS: EstadoCotizacion[] = ["atencion", "esperando", "lista", "enviada", "ganada", "perdida"];

function mensajeDe(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function volver(aviso: string, query = ""): never {
  revalidatePath("/", "layout");
  redirect(`/agentes/cotizacion${query}&aviso=${encodeURIComponent(aviso)}`);
}

function queryDeFiltros(formData: FormData): string {
  const filtros = new URLSearchParams({ tab: "solicitudes" });
  for (const [clave, campo] of [["q", "filtroQ"], ["estado", "filtroEstado"], ["ramo", "filtroRamo"], ["origen", "filtroOrigen"]]) {
    const valor = mensajeDe(formData, campo);
    if (valor) filtros.set(clave, valor);
  }
  return `?${filtros.toString()}`;
}

export async function actualizarSolicitud(formData: FormData) {
  await requerirSesion();
  const query = queryDeFiltros(formData);
  const id = Number(mensajeDe(formData, "id"));
  const estado = mensajeDe(formData, "estado");
  const nota = mensajeDe(formData, "nota").slice(0, 500);
  if (!Number.isInteger(id) || id <= 0 || !ESTADOS.includes(estado as EstadoCotizacion)) volver("solicitud-invalida", query);
  let solicitud: typeof schema.solicitudesCotizacion.$inferSelect | undefined;
  try {
    [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, id));
    if (solicitud) {
      await db.update(schema.solicitudesCotizacion).set({ estado: estado as EstadoCotizacion, nota: nota || null, actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, id));
      await db.insert(schema.actividadAgentes).values({
        agente: "cotizacion",
        referencia: `solicitud:${solicitud.numero}`,
        texto: `Actualizaste la solicitud ${solicitud.numero} de ${solicitud.cliente}: ${estado.replaceAll("_", " ")}.${nota ? ` ${nota}` : ""}`,
      });
    }
  } catch (error) {
    console.error("No se pudo actualizar la solicitud de cotización:", error);
    volver("error-operacion", query);
  }
  if (!solicitud) volver("solicitud-inexistente", query);
  volver("solicitud-actualizada", query);
}

export async function nuevaSolicitud(formData: FormData) {
  await requerirSesion();
  const vinculo = mensajeDe(formData, "vinculo");
  const [tipoVinculo, idTexto] = vinculo.split(":");
  const id = Number(idTexto);
  const ramo = mensajeDe(formData, "ramo").slice(0, 100);
  const tipo = mensajeDe(formData, "tipo");
  const bien = mensajeDe(formData, "bien").slice(0, 250);
  const motivo = mensajeDe(formData, "motivo").slice(0, 500);
  if (!Number.isInteger(id) || id <= 0 || !ramo || !["renovacion", "mejora", "nueva"].includes(tipo)) {
    volver("solicitud-incompleta", "?tab=solicitudes");
  }
  if (tipoVinculo !== "asegurado" && tipoVinculo !== "lead") volver("solicitud-vinculo-invalido", "?tab=solicitudes");

  let numero: number | null = null;
  let aviso = "error-operacion";
  try {
    if (tipoVinculo === "asegurado") {
      const [asegurado] = await db.select({ id: schema.asegurados.id, cliente: schema.asegurados.nombre }).from(schema.asegurados).where(eq(schema.asegurados.id, id));
      if (!asegurado) aviso = "asegurado-inexistente";
      else numero = await crearSolicitud({ aseguradoId: id, cliente: asegurado.cliente, tipo: tipo as "renovacion" | "mejora" | "nueva", ramo, bien: bien || null, motivo: motivo || null });
    } else {
      const [lead] = await db.select({ id: schema.leads.id, cliente: schema.leads.empresa }).from(schema.leads).where(eq(schema.leads.id, id));
      if (!lead) aviso = "lead-inexistente";
      else numero = await crearSolicitud({ leadId: id, cliente: lead.cliente, tipo: tipo as "renovacion" | "mejora" | "nueva", ramo, bien: bien || null, motivo: motivo || null });
    }
  } catch (error) {
    console.error("No se pudo crear la solicitud de cotización:", error);
  }
  if (numero === null) volver(aviso, "?tab=solicitudes");
  revalidatePath("/agentes/cotizacion");
  volver(`solicitud-${numero}`, "?tab=solicitudes");
}
