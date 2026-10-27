import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CampoDenuncia, EtapaSiniestro } from "@/db/schema";
import { enviarMensaje } from "@/agentes/envio";
import { contactoDe } from "@/lib/asegurados";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { nombreDePila } from "@/lib/plantillas";
import { documentosPara, nombreEtapa, textoReclamo, TIPOS_SINIESTRO } from "@/lib/siniestros";

/**
 * Armado de la denuncia de un siniestro.
 *
 * Hoy es determinista: arma los campos con lo que cargó el productor o lo que
 * mandó el asegurado. Acá se enchufa un modelo que lea la conversación de
 * WhatsApp y las fotos para completar la denuncia (implementá
 * RedactorDenuncia y cambiá `redactor`). La denuncia siempre se revisa y
 * aprueba antes de mandarla a la compañía.
 */
export interface RedactorDenuncia {
  armar(datos: { tipo: string; fecha: Date; domicilio: string | null; bien: string | null; relato: string | null; fotos: number }): CampoDenuncia[];
}

export const redactorConCampos: RedactorDenuncia = {
  armar(d) {
    const tipo = TIPOS_SINIESTRO.find((t) => t.id === d.tipo)?.nombre ?? "Siniestro";
    return [
      { campo: "Fecha y hora", valor: `${fechaCorta(diaEnArgentina(d.fecha))}, ${diaYHora(d.fecha).slice(6)} aprox.` },
      { campo: "Domicilio", valor: d.domicilio ?? "A completar" },
      { campo: "Bien afectado", valor: d.bien ?? "A completar" },
      { campo: "Causa", valor: tipo },
      { campo: "Fotos", valor: d.fotos ? `${d.fotos} fotos recibidas` : "Todavía no llegaron fotos" },
    ];
  },
};

export const redactor: RedactorDenuncia = redactorConCampos;

async function siniestroCompleto(id: number) {
  const [fila] = await db
    .select({ s: schema.siniestros, p: schema.polizas, a: schema.asegurados })
    .from(schema.siniestros)
    .innerJoin(schema.polizas, eq(schema.polizas.id, schema.siniestros.polizaId))
    .innerJoin(schema.asegurados, eq(schema.asegurados.id, schema.polizas.aseguradoId))
    .where(eq(schema.siniestros.id, id));
  if (!fila) throw new Error("Siniestro inexistente");
  const [compania] = fila.p.compania ? await db.select().from(schema.companias).where(eq(schema.companias.nombre, fila.p.compania)) : [];
  return { ...fila, compania };
}

async function evento(siniestroId: number, quien: string, texto: string) {
  await db.insert(schema.siniestroEventos).values({ siniestroId, quien, texto });
}

/** Manda la denuncia aprobada a la compañía (por la conexión simulada). */
export async function enviarDenuncia(id: number) {
  const { s, p, a, compania } = await siniestroCompleto(id);
  const cuerpo = [
    `Denuncia de siniestro · ${p.ramo} ${p.numero ?? ""} · ${a.nombre}`,
    "",
    ...(s.denuncia ?? []).map((c) => `${c.campo}: ${c.valor}`),
    s.relato ? `Relato: ${s.relato}` : "",
    "",
    "{productor}",
  ].join("\n");
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a.id,
      agente: "siniestros",
      canal: "email",
      destinatario: compania?.emailSiniestros ?? `Siniestros ${p.compania ?? ""}`,
      asunto: `Denuncia de siniestro · ${a.nombre}`,
      referencia: `siniestro:${id}:denuncia`,
      texto: cuerpo,
      esEjemplo: a.esEjemplo,
    })
    .returning({ id: schema.mensajes.id });
  const r = await enviarMensaje(m.id);
  if (!r.ok) return r;
  const docs = await db.select().from(schema.siniestroDocumentos).where(eq(schema.siniestroDocumentos.siniestroId, id));
  const ahora = new Date();
  await db
    .update(schema.siniestros)
    .set({
      denunciaEnviadaEl: ahora,
      ultimaNovedadCompaniaEl: ahora,
      etapa: docs.some((d) => !d.recibido) ? "documentacion" : "compania",
    })
    .where(eq(schema.siniestros.id, id));
  await evento(id, "Vos", `Aprobaste la denuncia y se envió a ${p.compania ?? "la compañía"}.`);
  return r;
}

/** Le pide al asegurado lo que falta (el productor lo pidió con el botón). */
export async function mandarRecordatorio(id: number) {
  const { a } = await siniestroCompleto(id);
  const faltan = (await db.select().from(schema.siniestroDocumentos).where(eq(schema.siniestroDocumentos.siniestroId, id))).filter(
    (d) => !d.recibido,
  );
  const { telefono, email } = contactoDe(a);
  if (!telefono && !email) return { ok: false as const, error: "sin-contacto" };
  const nombre = a.tipo === "persona" ? nombreDePila(a.nombre, false) : (a.contactoNombre?.split(/\s+/)[0] ?? "");
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a.id,
      agente: "siniestros",
      canal: telefono ? "whatsapp" : "email",
      destinatario: telefono ?? email,
      asunto: telefono ? null : "Lo que falta para tu siniestro",
      referencia: `siniestro:${id}:recordatorio`,
      texto: `Hola ${nombre}, para presentar el siniestro en la compañía todavía falta: ${faltan.map((d) => d.nombre.toLowerCase()).join(", ")}. ¿Me lo podés mandar hoy por acá? Saludos, {productor}`,
      esEjemplo: a.esEjemplo,
    })
    .returning({ id: schema.mensajes.id });
  const r = await enviarMensaje(m.id);
  if (!r.ok) return r;
  await db.update(schema.siniestros).set({ recordatorioEnviadoEl: new Date() }).where(eq(schema.siniestros.id, id));
  await evento(id, "Agente", `Le mandó a ${nombre || a.nombre} lo que falta por ${telefono ? "WhatsApp" : "email"}.`);
  return r;
}

/** Reclamo por demora al área de siniestros de la compañía. */
export async function enviarReclamo(id: number) {
  const { s, p, a, compania } = await siniestroCompleto(id);
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a.id,
      agente: "siniestros",
      canal: "email",
      destinatario: compania?.emailSiniestros ?? `Siniestros ${p.compania ?? ""}`,
      asunto: `Reclamo por demora · siniestro ${s.numeroCompania ?? ""}`,
      referencia: `siniestro:${id}:reclamo`,
      texto: textoReclamo(s, a.nombre),
      esEjemplo: a.esEjemplo,
    })
    .returning({ id: schema.mensajes.id });
  const r = await enviarMensaje(m.id);
  if (!r.ok) return r;
  await db.update(schema.siniestros).set({ reclamoEnviadoEl: new Date() }).where(eq(schema.siniestros.id, id));
  await evento(id, "Vos", "Enviaste el reclamo por demora en la respuesta de la compañía.");
  return r;
}

export async function guardarDenuncia(id: number, campos: CampoDenuncia[], relato: string | null) {
  await db.update(schema.siniestros).set({ denuncia: campos, relato }).where(eq(schema.siniestros.id, id));
  await evento(id, "Vos", "Corregiste la denuncia.");
}

export async function marcarDocumento(siniestroId: number, documentoId: number, recibido: boolean) {
  await db
    .update(schema.siniestroDocumentos)
    .set({ recibido, recibidoEl: recibido ? new Date() : null })
    .where(and(eq(schema.siniestroDocumentos.id, documentoId), eq(schema.siniestroDocumentos.siniestroId, siniestroId)));
  const [doc] = await db.select().from(schema.siniestroDocumentos).where(eq(schema.siniestroDocumentos.id, documentoId));
  if (doc) await evento(siniestroId, "Vos", `${recibido ? "Recibiste" : "Marcaste como faltante"}: ${doc.nombre.toLowerCase()}.`);
}

/** Novedad del trámite que carga el productor (mientras no haya portales conectados). */
export async function actualizarTramite(
  id: number,
  datos: {
    etapa: EtapaSiniestro;
    novedad: string | null;
    numeroCompania: string | null;
    inspeccionEl: Date | null;
    montoAprobado: number | null;
    montoPagado: number | null;
    cerrar: boolean;
    resolucion: string | null;
  },
) {
  const { s, p } = await siniestroCompleto(id);
  const ahora = new Date();
  await db
    .update(schema.siniestros)
    .set({
      etapa: datos.etapa,
      numeroCompania: datos.numeroCompania ?? s.numeroCompania,
      ultimaNovedadCompaniaEl: ahora,
      inspeccionEl: datos.inspeccionEl ?? s.inspeccionEl,
      montoAprobado: datos.montoAprobado ?? s.montoAprobado,
      montoPagado: datos.montoPagado ?? s.montoPagado,
      pagadoEl: datos.montoPagado && !s.pagadoEl ? ahora : s.pagadoEl,
      cerrado: datos.cerrar,
      cerradoEl: datos.cerrar ? (s.cerradoEl ?? ahora) : null,
      resolucion: datos.resolucion ?? s.resolucion,
    })
    .where(eq(schema.siniestros.id, id));
  await evento(
    id,
    p.compania ?? "Compañía",
    datos.novedad || (datos.cerrar ? "Siniestro cerrado." : `El trámite pasó a ${nombreEtapa(datos.etapa).toLowerCase()}.`),
  );
  if (datos.cerrar && !s.cerrado) {
    await db.insert(schema.notasAsegurado).values({
      aseguradoId: p.aseguradoId,
      tipo: "sistema",
      texto: `Siniestro cerrado (${s.descripcion.toLowerCase()})${datos.montoPagado ?? s.montoPagado ? ` · pagado $ ${(datos.montoPagado ?? s.montoPagado)!.toLocaleString("es-AR")}` : ""}.`,
    });
  }
}

/** "Cargar siniestro": alta manual con la documentación que pide ese tipo. */
export async function cargarSiniestro(datos: {
  polizaId: number;
  tipo: string;
  descripcion: string;
  fecha: Date;
  lugar: string | null;
  relato: string | null;
  avisoDe: string | null;
}) {
  const [p] = await db.select().from(schema.polizas).where(eq(schema.polizas.id, datos.polizaId));
  if (!p) throw new Error("Póliza inexistente");
  const [a] = await db.select().from(schema.asegurados).where(eq(schema.asegurados.id, p.aseguradoId));
  const denuncia = redactor.armar({ tipo: datos.tipo, fecha: datos.fecha, domicilio: datos.lugar ?? a.domicilio, bien: p.bien, relato: datos.relato, fotos: 0 });
  const [s] = await db
    .insert(schema.siniestros)
    .values({ ...datos, etapa: "aviso", denuncia })
    .returning({ id: schema.siniestros.id });
  await db.insert(schema.siniestroDocumentos).values(documentosPara(datos.tipo).map((nombre) => ({ siniestroId: s.id, nombre })));
  await evento(s.id, "Vos", "Cargaste el siniestro.");
  await db.insert(schema.notasAsegurado).values({ aseguradoId: a.id, tipo: "sistema", texto: `Siniestro cargado: ${datos.descripcion.toLowerCase()}.` });
  return s.id;
}
