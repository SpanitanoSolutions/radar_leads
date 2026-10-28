import "server-only";
import { and, eq, inArray } from "drizzle-orm";
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
  const denuncia = redactor.armar({ tipo: datos.tipo, fecha: datos.fecha, domicilio: datos.lugar ?? asegurado?.domicilio ?? null, bien: poliza?.bien ?? datos.afectado, relato: datos.relato, fotos: datos.archivos?.filter((archivo) => archivo.tipo.startsWith("image/")).length ?? 0 });
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

/** Actualiza los datos principales sin modificar el borrador de denuncia ni los adjuntos. */
export async function editarSiniestro(id: number, datos: {
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

  await db.transaction(async (tx) => {
    const [existente] = await tx.select({ id: schema.siniestros.id }).from(schema.siniestros).where(eq(schema.siniestros.id, id));
    if (!existente) throw new Error("Siniestro inexistente");
    await tx.update(schema.siniestros).set({
      polizaId: poliza?.id ?? null,
      aseguradoId: asegurado?.id ?? null,
      compania: poliza?.compania ?? datos.compania?.trim() ?? null,
      ramo: poliza?.ramo ?? datos.ramo?.trim() ?? null,
      afectado: datos.afectado,
      tipo: datos.tipo,
      descripcion: datos.descripcion,
      fecha: datos.fecha,
      lugar: datos.lugar,
      relato: datos.relato,
      avisoDe: datos.avisoDe,
      actualizadoEl: new Date(),
    }).where(eq(schema.siniestros.id, id));
    await tx.insert(schema.siniestroEventos).values({ siniestroId: id, quien: "Vos", texto: "Editaste los datos principales del siniestro." });
  });
}

/** Agrega archivos al expediente y marca el requisito que esos archivos respaldan, si se indicó. */
function esRequisitoDeFotos(nombre: string) {
  const normalizado = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /foto|imagen/i.test(normalizado);
}

function esArchivoImagen(archivo: { tipo?: string; tipoMime?: string; nombre: string }) {
  return (archivo.tipo ?? archivo.tipoMime ?? "").startsWith("image/")
    || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(archivo.nombre);
}

export async function agregarArchivosSiniestro(
  id: number,
  archivos: { nombre: string; tipo: string; tamano: number; contenido: Buffer }[],
  requisitoId: number | null = null,
) {
  return db.transaction(async (tx) => {
    const [existente] = await tx.select({
      id: schema.siniestros.id,
      denuncia: schema.siniestros.denuncia,
      denunciaEnviadaEl: schema.siniestros.denunciaEnviadaEl,
    }).from(schema.siniestros).where(eq(schema.siniestros.id, id));
    if (!existente) return "inexistente" as const;
    const requisitos = await tx.select().from(schema.siniestroRequisitos)
      .where(eq(schema.siniestroRequisitos.siniestroId, id));
    const requisitoElegido = requisitoId === null
      ? null
      : requisitos.find((requisito) => requisito.id === requisitoId) ?? null;
    if (requisitoId !== null && !requisitoElegido) return "requisito-inexistente" as const;
    const actuales = await tx.select({ tamano: schema.siniestroArchivos.tamano, tipoMime: schema.siniestroArchivos.tipoMime, nombre: schema.siniestroArchivos.nombre })
      .from(schema.siniestroArchivos)
      .where(eq(schema.siniestroArchivos.siniestroId, id));
    const cantidadTotal = actuales.length + archivos.length;
    const tamanoTotal = actuales.reduce((total, archivo) => total + archivo.tamano, 0)
      + archivos.reduce((total, archivo) => total + archivo.tamano, 0);
    if (cantidadTotal > 20 || tamanoTotal > 25 * 1024 * 1024) return "limite" as const;

    const archivosSubidos: { id: number; nombre: string; tipo: string }[] = [];
    for (const archivo of archivos) {
      const [nuevoArchivo] = await tx.insert(schema.archivos)
        .values({ nombre: archivo.nombre, tipo: archivo.tipo, tamano: archivo.tamano, contenido: archivo.contenido })
        .returning({ id: schema.archivos.id });
      archivosSubidos.push({ id: nuevoArchivo.id, nombre: archivo.nombre, tipo: archivo.tipo });
      const [trabajo] = await tx.insert(schema.iaTrabajos)
        .values({ agente: "siniestros", operacion: "analizar_documento", entidad: "siniestro_archivo", entidadId: nuevoArchivo.id, estado: "pendiente_configuracion", datos: { archivoId: nuevoArchivo.id } })
        .returning({ id: schema.iaTrabajos.id });
      await tx.insert(schema.siniestroArchivos).values({
        siniestroId: id,
        archivoId: nuevoArchivo.id,
        nombre: archivo.nombre,
        tipoMime: archivo.tipo,
        tamano: archivo.tamano,
        trabajoId: trabajo.id,
      });
    }
    const requisitoDeFotos = requisitos.filter((requisito) => esRequisitoDeFotos(requisito.nombre));
    const imagenesNuevas = archivosSubidos.filter(esArchivoImagen);
    const requisitoAutomatico = !requisitoElegido && requisitoDeFotos.length === 1 && imagenesNuevas.length > 0
      ? requisitoDeFotos[0]
      : null;
    const requisitoVinculado = requisitoElegido ?? requisitoAutomatico;
    const archivosVinculados = requisitoElegido
      ? archivosSubidos
      : requisitoAutomatico
        ? imagenesNuevas
        : [];
    const ahora = new Date();
    if (requisitoVinculado && archivosVinculados.length > 0) {
      const esFotos = esRequisitoDeFotos(requisitoVinculado.nombre);
      await tx.update(schema.siniestroRequisitos).set({
        recibido: true,
        recibidoEl: ahora,
        archivoId: archivosVinculados[0].id,
        cantidad: esFotos ? (requisitoVinculado.cantidad ?? 0) + archivosVinculados.length : requisitoVinculado.cantidad,
        actualizadoEl: ahora,
      }).where(and(
        eq(schema.siniestroRequisitos.id, requisitoVinculado.id),
        eq(schema.siniestroRequisitos.siniestroId, id),
      ));
    }
    const totalImagenes = actuales.filter(esArchivoImagen).length + imagenesNuevas.length;
    const denunciaActualizada = !existente.denunciaEnviadaEl && totalImagenes > 0 && existente.denuncia
      ? existente.denuncia.map((campo) => campo.campo.toLocaleLowerCase("es-AR") === "fotos" && campo.valor === "Todavía no llegaron fotos"
        ? { ...campo, valor: `${totalImagenes} ${totalImagenes === 1 ? "foto recibida" : "fotos recibidas"}` }
        : campo)
      : existente.denuncia;
    await tx.update(schema.siniestros).set({ actualizadoEl: ahora, denuncia: denunciaActualizada }).where(eq(schema.siniestros.id, id));
    const vinculo = requisitoVinculado && archivosVinculados.length > 0
      ? ` Marcaste «${requisitoVinculado.nombre}» como recibido con ${archivosVinculados.length} ${archivosVinculados.length === 1 ? "archivo" : "archivos"}.`
      : "";
    await tx.insert(schema.siniestroEventos).values({
      siniestroId: id,
      quien: "Vos",
      texto: `Agregaste ${archivos.length} ${archivos.length === 1 ? "archivo" : "archivos"} al expediente.${vinculo}`,
    });
    return "ok" as const;
  });
}

/** Quita un archivo del expediente antes de enviar la denuncia. */
export async function eliminarArchivoSiniestro(siniestroId: number, siniestroArchivoId: number) {
  return db.transaction(async (tx) => {
    const [siniestro] = await tx.select({
      id: schema.siniestros.id,
      denuncia: schema.siniestros.denuncia,
      denunciaEnviadaEl: schema.siniestros.denunciaEnviadaEl,
    }).from(schema.siniestros).where(eq(schema.siniestros.id, siniestroId));
    if (!siniestro) return "inexistente" as const;
    if (siniestro.denunciaEnviadaEl) return "denuncia-enviada" as const;

    const [vinculo] = await tx.select().from(schema.siniestroArchivos).where(and(
      eq(schema.siniestroArchivos.id, siniestroArchivoId),
      eq(schema.siniestroArchivos.siniestroId, siniestroId),
    ));
    if (!vinculo) return "archivo-inexistente" as const;

    const adjuntos = await tx.select({
      id: schema.siniestroArchivos.id,
      archivoId: schema.siniestroArchivos.archivoId,
      tipoMime: schema.siniestroArchivos.tipoMime,
      nombre: schema.siniestroArchivos.nombre,
    }).from(schema.siniestroArchivos).where(eq(schema.siniestroArchivos.siniestroId, siniestroId));
    const restantes = adjuntos.filter((archivo) => archivo.id !== siniestroArchivoId);
    const imagenesRestantes = restantes.filter(esArchivoImagen);
    const imagenesActuales = adjuntos.filter(esArchivoImagen).length;
    const ahora = new Date();

    await tx.delete(schema.siniestroArchivos).where(eq(schema.siniestroArchivos.id, siniestroArchivoId));

    const requisitos = await tx.select().from(schema.siniestroRequisitos)
      .where(eq(schema.siniestroRequisitos.siniestroId, siniestroId));
    const requisitosFotos = requisitos.filter((requisito) => esRequisitoDeFotos(requisito.nombre));
    const requisitosVinculados = requisitos.filter((requisito) => requisito.archivoId === vinculo.archivoId);
    const recalculados = new Set<number>();
    for (const requisito of requisitosVinculados) {
      const esFotos = esRequisitoDeFotos(requisito.nombre);
      const conservaFotos = esFotos && imagenesRestantes.length > 0;
      await tx.update(schema.siniestroRequisitos).set({
        recibido: conservaFotos,
        recibidoEl: conservaFotos ? ahora : null,
        archivoId: conservaFotos ? imagenesRestantes[0].archivoId : null,
        cantidad: esFotos ? imagenesRestantes.length || null : null,
        modificacionManual: false,
        actualizadoEl: ahora,
      }).where(eq(schema.siniestroRequisitos.id, requisito.id));
      recalculados.add(requisito.id);
    }
    if (esArchivoImagen(vinculo) && requisitosFotos.length === 1) {
      const requisitoFotos = requisitosFotos[0];
      if (!recalculados.has(requisitoFotos.id)) {
        const conservaFotos = imagenesRestantes.length > 0;
        await tx.update(schema.siniestroRequisitos).set({
          recibido: conservaFotos,
          recibidoEl: conservaFotos ? ahora : null,
          archivoId: conservaFotos ? imagenesRestantes[0].archivoId : null,
          cantidad: imagenesRestantes.length || null,
          modificacionManual: false,
          actualizadoEl: ahora,
        }).where(eq(schema.siniestroRequisitos.id, requisitoFotos.id));
      }
    }
    await tx.update(schema.siniestroDocumentos).set({
      recibido: false,
      recibidoEl: null,
      archivoId: null,
      cantidad: null,
    }).where(and(
      eq(schema.siniestroDocumentos.siniestroId, siniestroId),
      eq(schema.siniestroDocumentos.archivoId, vinculo.archivoId),
    ));

    const campoFotos = siniestro.denuncia?.find((campo) => campo.campo.toLocaleLowerCase("es-AR") === "fotos");
    const resumenAnterior = imagenesActuales
      ? `${imagenesActuales} ${imagenesActuales === 1 ? "foto recibida" : "fotos recibidas"}`
      : "Todavía no llegaron fotos";
    const resumenNuevo = imagenesRestantes.length
      ? `${imagenesRestantes.length} ${imagenesRestantes.length === 1 ? "foto recibida" : "fotos recibidas"}`
      : "Todavía no llegaron fotos";
    const denuncia = siniestro.denuncia?.map((campo) => campo === campoFotos && campo.valor === resumenAnterior
      ? { ...campo, valor: resumenNuevo }
      : campo) ?? null;
    await tx.update(schema.siniestros).set({ denuncia, actualizadoEl: ahora }).where(eq(schema.siniestros.id, siniestroId));

    const [otroAdjunto] = await tx.select({ id: schema.siniestroArchivos.id })
      .from(schema.siniestroArchivos).where(eq(schema.siniestroArchivos.archivoId, vinculo.archivoId)).limit(1);
    const [otroRequisito] = await tx.select({ id: schema.siniestroRequisitos.id })
      .from(schema.siniestroRequisitos).where(eq(schema.siniestroRequisitos.archivoId, vinculo.archivoId)).limit(1);
    const [otroDocumento] = await tx.select({ id: schema.siniestroDocumentos.id })
      .from(schema.siniestroDocumentos).where(eq(schema.siniestroDocumentos.archivoId, vinculo.archivoId)).limit(1);
    if (!otroAdjunto && !otroRequisito && !otroDocumento) {
      await tx.delete(schema.iaTrabajos).where(and(
        eq(schema.iaTrabajos.agente, "siniestros"),
        eq(schema.iaTrabajos.entidad, "siniestro_archivo"),
        eq(schema.iaTrabajos.entidadId, vinculo.archivoId),
      ));
      await tx.delete(schema.archivos).where(eq(schema.archivos.id, vinculo.archivoId));
    }

    await tx.insert(schema.siniestroEventos).values({
      siniestroId,
      quien: "Vos",
      texto: `Eliminaste «${vinculo.nombre}» del expediente antes de enviar la denuncia.`,
    });
    return "ok" as const;
  });
}

/** Repara los checklists antiguos: las imágenes ya adjuntas cumplen un requisito único de fotos. */
export async function sincronizarRequisitosDeFotos(siniestroIds: number[]) {
  if (!siniestroIds.length) return false;
  return db.transaction(async (tx) => {
    const requisitos = await tx.select().from(schema.siniestroRequisitos)
      .where(inArray(schema.siniestroRequisitos.siniestroId, siniestroIds));
    const archivos = await tx.select({ siniestroId: schema.siniestroArchivos.siniestroId, archivoId: schema.siniestroArchivos.archivoId, tipoMime: schema.siniestroArchivos.tipoMime, nombre: schema.siniestroArchivos.nombre })
      .from(schema.siniestroArchivos).where(inArray(schema.siniestroArchivos.siniestroId, siniestroIds));
    const siniestros = await tx.select({ id: schema.siniestros.id, denuncia: schema.siniestros.denuncia, denunciaEnviadaEl: schema.siniestros.denunciaEnviadaEl })
      .from(schema.siniestros).where(inArray(schema.siniestros.id, siniestroIds));
    const requisitosPorSiniestro = new Map<number, typeof requisitos>();
    const archivosPorSiniestro = new Map<number, typeof archivos>();
    for (const requisito of requisitos) requisitosPorSiniestro.set(requisito.siniestroId, [...(requisitosPorSiniestro.get(requisito.siniestroId) ?? []), requisito]);
    for (const archivo of archivos) archivosPorSiniestro.set(archivo.siniestroId, [...(archivosPorSiniestro.get(archivo.siniestroId) ?? []), archivo]);
    let cambio = false;
    for (const siniestro of siniestros) {
      const requisitosFotos = (requisitosPorSiniestro.get(siniestro.id) ?? []).filter((requisito) => esRequisitoDeFotos(requisito.nombre));
      const fotos = (archivosPorSiniestro.get(siniestro.id) ?? []).filter(esArchivoImagen);
      const requisito = requisitosFotos.length === 1 ? requisitosFotos[0] : null;
      if (!requisito || requisito.recibido || requisito.modificacionManual || !fotos.length) continue;
      const ahora = new Date();
      await tx.update(schema.siniestroRequisitos).set({
        recibido: true,
        recibidoEl: ahora,
        archivoId: fotos[0].archivoId,
        cantidad: fotos.length,
        actualizadoEl: ahora,
      }).where(eq(schema.siniestroRequisitos.id, requisito.id));
      if (!siniestro.denunciaEnviadaEl && siniestro.denuncia) {
        const denuncia = siniestro.denuncia.map((campo) => campo.campo.toLocaleLowerCase("es-AR") === "fotos" && campo.valor === "Todavía no llegaron fotos"
          ? { ...campo, valor: `${fotos.length} ${fotos.length === 1 ? "foto recibida" : "fotos recibidas"}` }
          : campo);
        await tx.update(schema.siniestros).set({ denuncia }).where(eq(schema.siniestros.id, siniestro.id));
      }
      cambio = true;
    }
    return cambio;
  });
}

export async function archivarSiniestro(id: number, archivado: boolean) {
  await db.update(schema.siniestros).set({ archivado, actualizadoEl: new Date() }).where(eq(schema.siniestros.id, id));
  await evento(id, "Vos", archivado ? "Archivaste el siniestro." : "Restauraste el siniestro del archivo.");
}
