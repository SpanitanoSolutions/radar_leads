import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CampoDenuncia, EtapaSiniestro } from "@/db/schema";
import { enviarMensaje } from "@/agentes/envio";
import { contactoDe } from "@/lib/asegurados";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { nombreDePila } from "@/lib/plantillas";
import { polizaVigenteEnFecha, validarFechaHecho } from "@/lib/siniestros/validaciones";
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
    .leftJoin(schema.polizas, eq(schema.polizas.id, schema.siniestros.polizaId))
    .leftJoin(schema.asegurados, eq(schema.asegurados.id, schema.siniestros.aseguradoId))
    .where(eq(schema.siniestros.id, id));
  if (!fila) throw new Error("Siniestro inexistente");
  const nombreCompania = fila.s.compania ?? fila.p?.compania;
  const [compania] = nombreCompania ? await db.select().from(schema.companias).where(eq(schema.companias.nombre, nombreCompania)) : [];
  return { ...fila, compania };
}

async function evento(siniestroId: number, quien: string, texto: string) {
  await db.insert(schema.siniestroEventos).values({ siniestroId, quien, texto });
}

/** Manda la denuncia aprobada a la compañía (por la conexión simulada). */
export async function enviarDenuncia(id: number) {
  const { s, p, a, compania } = await siniestroCompleto(id);
  const nombreCompania = s.compania ?? p?.compania;
  if (!nombreCompania) return { ok: false as const, error: "sin-compania" };
  const nombreAsegurado = a?.nombre ?? s.afectado ?? "Asegurado";
  const cuerpo = [
    `Denuncia de siniestro · ${s.ramo ?? p?.ramo ?? ""} ${p?.numero ?? ""} · ${nombreAsegurado}`,
    "",
    ...(s.denuncia ?? []).map((c) => `${c.campo}: ${c.valor}`),
    s.relato ? `Relato: ${s.relato}` : "",
    "",
    "{productor}",
  ].join("\n");
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a?.id ?? null,
      agente: "siniestros",
      canal: "email",
      destinatario: compania?.emailSiniestros ?? `Siniestros ${nombreCompania}`,
      asunto: `Denuncia de siniestro · ${nombreAsegurado}`,
      referencia: `siniestro:${id}:denuncia`,
      texto: cuerpo,
      esEjemplo: a?.esEjemplo ?? false,
    })
    .returning({ id: schema.mensajes.id });
  const r = await enviarMensaje(m.id);
  if (!r.ok) return r;
  const docs = await db.select().from(schema.siniestroRequisitos).where(eq(schema.siniestroRequisitos.siniestroId, id));
  const ahora = new Date();
  await db
    .update(schema.siniestros)
    .set({
      denunciaEnviadaEl: ahora,
      ultimaNovedadCompaniaEl: ahora,
      etapa: docs.some((d) => d.bloqueante && !d.recibido) ? "documentacion" : "compania",
    })
    .where(eq(schema.siniestros.id, id));
  await evento(id, "Vos", `Aprobaste la denuncia y se envió a ${nombreCompania}.`);
  return r;
}

/** Le pide al asegurado lo que falta (el productor lo pidió con el botón). */
export async function mandarRecordatorio(id: number) {
  const { a } = await siniestroCompleto(id);
  if (!a) return { ok: false as const, error: "sin-asegurado" };
  const faltan = (await db.select().from(schema.siniestroRequisitos).where(eq(schema.siniestroRequisitos.siniestroId, id))).filter(
    (d) => d.bloqueante && !d.recibido,
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
  const nombreCompania = s.compania ?? p?.compania;
  if (!nombreCompania) return { ok: false as const, error: "sin-compania" };
  const nombreAsegurado = a?.nombre ?? s.afectado ?? "Asegurado";
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a?.id ?? null,
      agente: "siniestros",
      canal: "email",
      destinatario: compania?.emailSiniestros ?? `Siniestros ${nombreCompania}`,
      asunto: `Reclamo por demora · siniestro ${s.numeroCompania ?? ""}`,
      referencia: `siniestro:${id}:reclamo`,
      texto: textoReclamo(s, nombreAsegurado),
      esEjemplo: a?.esEjemplo ?? false,
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
    .update(schema.siniestroRequisitos)
    .set({ recibido, recibidoEl: recibido ? new Date() : null, modificacionManual: true, actualizadoEl: new Date() })
    .where(and(eq(schema.siniestroRequisitos.id, documentoId), eq(schema.siniestroRequisitos.siniestroId, siniestroId)));
  const [doc] = await db.select().from(schema.siniestroRequisitos).where(eq(schema.siniestroRequisitos.id, documentoId));
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
  const { s, p, a } = await siniestroCompleto(id);
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
    s.compania ?? p?.compania ?? "Compañía",
    datos.novedad || (datos.cerrar ? "Siniestro cerrado." : `El trámite pasó a ${nombreEtapa(datos.etapa).toLowerCase()}.`),
  );
  if (datos.cerrar && !s.cerrado && a) {
    await db.insert(schema.notasAsegurado).values({
      aseguradoId: a.id,
      tipo: "sistema",
      texto: `Siniestro cerrado (${s.descripcion.toLowerCase()})${datos.montoPagado ?? s.montoPagado ? ` · pagado $ ${(datos.montoPagado ?? s.montoPagado)!.toLocaleString("es-AR")}` : ""}.`,
    });
  }
}

/** "Cargar siniestro": alta manual con la documentación que pide ese tipo. */
export async function cargarSiniestro(datos: {
  polizaId: number | null;
  aseguradoId: number | null;
  compania: string | null;
  ramo: string | null;
  afectado: string | null;
  tipo: string;
  descripcion: string;
  fecha: Date;
  lugar: string | null;
  relato: string | null;
  avisoDe: string | null;
  notaInterna: string | null;
  archivos?: { nombre: string; tipo: string; tamano: number; contenido: Buffer }[];
}) {
  if (!validarFechaHecho(datos.fecha)) throw new Error("La fecha del hecho no puede ser posterior a la fecha actual.");
  const [poliza] = datos.polizaId ? await db.select().from(schema.polizas).where(eq(schema.polizas.id, datos.polizaId)) : [];
  if (datos.polizaId && !poliza) throw new Error("Póliza inexistente");
  if (poliza && datos.compania?.trim() && poliza.compania?.trim() !== datos.compania.trim()) throw new Error("La empresa no coincide con la póliza elegida");
  const aseguradoId = datos.aseguradoId ?? poliza?.aseguradoId ?? null;
  if (datos.aseguradoId && poliza && datos.aseguradoId !== poliza.aseguradoId) throw new Error("La póliza no pertenece al asegurado elegido");
  const [asegurado] = aseguradoId ? await db.select().from(schema.asegurados).where(eq(schema.asegurados.id, aseguradoId)) : [];
  if (aseguradoId && !asegurado) throw new Error("Asegurado inexistente");
  if (!asegurado && !datos.afectado) throw new Error("Indicá un asegurado o la persona/bien afectado.");
  const compania = poliza?.compania ?? datos.compania?.trim() ?? null;
  const ramo = poliza?.ramo ?? datos.ramo?.trim() ?? null;
  const denuncia = redactor.armar({ tipo: datos.tipo, fecha: datos.fecha, domicilio: datos.lugar ?? asegurado?.domicilio ?? null, bien: poliza?.bien ?? datos.afectado, relato: datos.relato, fotos: datos.archivos?.length ?? 0 });
  return db.transaction(async (tx) => {
    const [configuracion] = compania && ramo
      ? await tx.select().from(schema.siniestroConfiguracion).where(and(
          eq(schema.siniestroConfiguracion.compania, compania),
          eq(schema.siniestroConfiguracion.ramo, ramo),
          eq(schema.siniestroConfiguracion.tipo, datos.tipo),
        ))
      : [];
    const [siniestro] = await tx
      .insert(schema.siniestros)
      .values({
        polizaId: poliza?.id ?? null,
        aseguradoId: asegurado?.id ?? null,
        compania,
        ramo,
        afectado: datos.afectado,
        tipo: datos.tipo,
        descripcion: datos.descripcion,
        fecha: datos.fecha,
        lugar: datos.lugar,
        relato: datos.relato,
        avisoDe: datos.avisoDe,
        etapa: "aviso",
        denuncia,
      })
      .returning({ id: schema.siniestros.id });
    const folio = `SIN-${String(siniestro.id).padStart(6, "0")}`;
    await tx.update(schema.siniestros).set({ folio }).where(eq(schema.siniestros.id, siniestro.id));
    const requisitos = configuracion?.requisitos.length
      ? configuracion.requisitos
      : documentosPara(datos.tipo).map((nombre) => ({ nombre, bloqueante: true }));
    if (requisitos.length) await tx.insert(schema.siniestroRequisitos).values(requisitos.map((requisito) => ({
      siniestroId: siniestro.id,
      nombre: requisito.nombre,
      bloqueante: requisito.bloqueante,
      origen: configuracion ? "plantilla" : "base",
    })));
    for (const archivo of datos.archivos ?? []) {
      const [nuevoArchivo] = await tx
        .insert(schema.archivos)
        .values({ nombre: archivo.nombre, tipo: archivo.tipo, tamano: archivo.tamano, contenido: archivo.contenido })
        .returning({ id: schema.archivos.id });
      const [trabajo] = await tx
        .insert(schema.iaTrabajos)
        .values({ agente: "siniestros", operacion: "analizar_documento", entidad: "siniestro_archivo", entidadId: nuevoArchivo.id, estado: "pendiente_configuracion", datos: { archivoId: nuevoArchivo.id } })
        .returning({ id: schema.iaTrabajos.id });
      await tx.insert(schema.siniestroArchivos).values({
        siniestroId: siniestro.id,
        archivoId: nuevoArchivo.id,
        nombre: archivo.nombre,
        tipoMime: archivo.tipo,
        tamano: archivo.tamano,
        trabajoId: trabajo.id,
      });
    }
    await tx.insert(schema.siniestroEventos).values({ siniestroId: siniestro.id, quien: "Vos", texto: "Cargaste el siniestro." });
    if (poliza && !polizaVigenteEnFecha(poliza, datos.fecha)) {
      await tx.insert(schema.siniestroEventos).values({ siniestroId: siniestro.id, quien: "Sistema", texto: "Revisar vigencia: la póliza no figura vigente en la fecha informada del hecho." });
    }
    if (datos.notaInterna) await tx.insert(schema.siniestroEventos).values({ siniestroId: siniestro.id, quien: "Vos", texto: `Nota interna: ${datos.notaInterna}` });
    if (asegurado) await tx.insert(schema.notasAsegurado).values({ aseguradoId: asegurado.id, tipo: "sistema", texto: `Siniestro cargado: ${datos.descripcion.toLowerCase()}.` });
    return siniestro.id;
  });
}

export async function archivarSiniestro(id: number, archivado: boolean) {
  await db.update(schema.siniestros).set({ archivado, actualizadoEl: new Date() }).where(eq(schema.siniestros.id, id));
  await evento(id, "Vos", archivado ? "Archivaste el siniestro." : "Restauraste el siniestro del archivo.");
}
