"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { CampoDenuncia, EtapaSiniestro } from "@/db/schema";
import {
  agregarArchivosSiniestro as agregarArchivosSiniestroAgente,
  actualizarTramite as actualizarTramiteAgente,
  cargarSiniestro as cargarSiniestroAgente,
  editarSiniestro as editarSiniestroAgente,
  eliminarArchivoSiniestro as eliminarArchivoSiniestroAgente,
  enviarDenuncia as enviarDenunciaAgente,
  enviarReclamo as enviarReclamoAgente,
  guardarDenuncia as guardarDenunciaAgente,
  mandarRecordatorio as mandarRecordatorioAgente,
  marcarDocumento as marcarDocumentoAgente,
  archivarSiniestro as archivarSiniestroAgente,
} from "@/agentes/siniestros";
import { requerirSesion } from "@/lib/auth";
import { ETAPAS, TIPOS_SINIESTRO } from "@/lib/siniestros";
import { db, schema } from "@/db";
import { validarFechaHecho } from "@/lib/siniestros/validaciones";

const TIPOS_ARCHIVO_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/csv",
]);
const EXTENSIONES_ARCHIVO_PERMITIDAS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif",
  ".doc", ".docx", ".xls", ".xlsx", ".odt", ".ods", ".rtf", ".txt", ".csv",
]);
const TIPOS_POR_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

function archivoPermitido(archivo: File) {
  if (TIPOS_ARCHIVO_PERMITIDOS.has(archivo.type)) return true;
  const extension = archivo.name.toLocaleLowerCase("es-AR").match(/\.[^.]+$/)?.[0];
  return (!archivo.type || archivo.type === "application/octet-stream")
    && Boolean(extension && EXTENSIONES_ARCHIVO_PERMITIDAS.has(extension));
}

async function leerArchivos(archivosFormulario: File[]) {
  return Promise.all(archivosFormulario.map(async (archivo) => {
    const extension = archivo.name.toLocaleLowerCase("es-AR").match(/\.[^.]+$/)?.[0];
    const tipo = !archivo.type || archivo.type === "application/octet-stream"
      ? TIPOS_POR_EXTENSION[extension ?? ""] ?? (archivo.type || "application/octet-stream")
      : archivo.type;
    return {
      nombre: archivo.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180),
      tipo,
      tamano: archivo.size,
      contenido: Buffer.from(await archivo.arrayBuffer()),
    };
  }));
}

function idDe(formData: FormData, campo = "id"): number {
  const id = Number(formData.get(campo));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Siniestro inválido");
  return id;
}

function fechaDe(formData: FormData, campo: string): Date | null {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) throw new Error("Fecha inválida");
  const fecha = new Date(`${valor}:00-03:00`);
  if (Number.isNaN(fecha.getTime())) throw new Error("Fecha inválida");
  return fecha;
}

function numeroDe(formData: FormData, campo: string): number | null {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) throw new Error("Monto inválido");
  return numero;
}

function volver(id: number | null, aviso: string, tab = "abiertos"): never {
  revalidatePath("/", "layout");
  const seleccion = id ? `&id=${id}` : "";
  redirect(`/agentes/siniestros?tab=${tab}${seleccion}&aviso=${aviso}`);
}

function pestanaDe(formData: FormData) {
  const tab = formData.get("tab");
  return tab === "cerrados" || tab === "archivados" ? tab : "abiertos";
}

export async function enviarDenuncia(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const resultado = await enviarDenunciaAgente(id);
  volver(id, resultado.ok ? "denuncia-enviada" : resultado.error === "sin-compania" ? "sin-compania" : "envio-error");
}

export async function mandarRecordatorio(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const resultado = await mandarRecordatorioAgente(id);
  volver(id, resultado.ok ? "recordatorio-enviado" : resultado.error === "sin-contacto" || resultado.error === "sin-asegurado" ? "sin-contacto" : "envio-error");
}

export async function enviarReclamo(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const resultado = await enviarReclamoAgente(id);
  volver(id, resultado.ok ? "reclamo-enviado" : resultado.error === "sin-compania" ? "sin-compania" : "envio-error");
}

export async function guardarDenuncia(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const campos = formData.getAll("campo");
  const valores = formData.getAll("valor");
  const denuncia: CampoDenuncia[] = campos.flatMap((campo, indice) => {
    const valor = valores[indice];
    return typeof campo === "string" && typeof valor === "string" ? [{ campo: campo.trim(), valor: valor.trim() }] : [];
  });
  const relato = formData.get("relato");
  await guardarDenunciaAgente(id, denuncia, typeof relato === "string" ? relato.trim() || null : null);
  volver(id, "denuncia-guardada");
}

export async function marcarDocumento(formData: FormData) {
  await requerirSesion();
  const siniestroId = idDe(formData, "siniestroId");
  const documentoId = idDe(formData, "documentoId");
  const recibido = formData.get("recibido") === "true";
  await marcarDocumentoAgente(siniestroId, documentoId, recibido);
  volver(siniestroId, recibido ? "documento-recibido" : "documento-actualizado");
}

export async function actualizarTramite(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const etapa = formData.get("etapa");
  if (typeof etapa !== "string" || !ETAPAS.some((e) => e.id === etapa)) throw new Error("Etapa inválida");
  const inspeccionEl = fechaDe(formData, "inspeccionEl");
  const novedad = formData.get("novedad");
  const numeroCompania = formData.get("numeroCompania");
  const resolucion = formData.get("resolucion");
  await actualizarTramiteAgente(id, {
    etapa: etapa as EtapaSiniestro,
    novedad: typeof novedad === "string" ? novedad.trim() || null : null,
    numeroCompania: typeof numeroCompania === "string" ? numeroCompania.trim() || null : null,
    inspeccionEl,
    montoAprobado: numeroDe(formData, "montoAprobado"),
    montoPagado: numeroDe(formData, "montoPagado"),
    cerrar: formData.get("cerrar") === "on",
    resolucion: typeof resolucion === "string" ? resolucion.trim() || null : null,
  });
  volver(id, "tramite-actualizado", formData.get("cerrar") === "on" ? "cerrados" : "abiertos");
}

export async function editarSiniestro(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const polizaValor = formData.get("polizaId");
  const aseguradoValor = formData.get("aseguradoId");
  const polizaId = typeof polizaValor === "string" && polizaValor ? Number(polizaValor) : null;
  const aseguradoId = typeof aseguradoValor === "string" && aseguradoValor ? Number(aseguradoValor) : null;
  if ((polizaId !== null && (!Number.isInteger(polizaId) || polizaId <= 0)) || (aseguradoId !== null && (!Number.isInteger(aseguradoId) || aseguradoId <= 0))) {
    throw new Error("Elegí un asegurado o póliza válidos.");
  }
  const compania = formData.get("compania");
  const ramo = formData.get("ramo");
  const afectado = formData.get("afectado");
  const fecha = fechaDe(formData, "fecha");
  const tipo = formData.get("tipo");
  const descripcion = formData.get("descripcion");
  if (fecha && !validarFechaHecho(fecha)) throw new Error("La fecha del hecho no puede ser posterior a la fecha actual.");
  if (!fecha || typeof tipo !== "string" || !TIPOS_SINIESTRO.some((item) => item.id === tipo) || typeof descripcion !== "string" || !descripcion.trim()) {
    throw new Error("Completá el tipo, la fecha y la descripción del siniestro.");
  }
  const lugar = formData.get("lugar");
  const relato = formData.get("relato");
  const avisoDe = formData.get("avisoDe");
  await editarSiniestroAgente(id, {
    polizaId,
    aseguradoId,
    compania: typeof compania === "string" ? compania.trim().slice(0, 120) || null : null,
    ramo: typeof ramo === "string" ? ramo.trim().slice(0, 100) || null : null,
    afectado: typeof afectado === "string" ? afectado.trim().slice(0, 180) || null : null,
    tipo,
    descripcion: descripcion.trim().slice(0, 250),
    fecha,
    lugar: typeof lugar === "string" ? lugar.trim().slice(0, 250) || null : null,
    relato: typeof relato === "string" ? relato.trim().slice(0, 4000) || null : null,
    avisoDe: typeof avisoDe === "string" ? avisoDe.trim().slice(0, 160) || null : null,
  });
  volver(id, "siniestro-editado", pestanaDe(formData));
}

export async function archivarSiniestro(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const archivado = formData.get("archivado") === "true";
  await archivarSiniestroAgente(id, archivado);
  volver(id, archivado ? "siniestro-archivado" : "siniestro-restaurado", archivado ? "archivados" : "abiertos");
}

export async function cargarSiniestro(formData: FormData) {
  await requerirSesion();
  const polizaValor = formData.get("polizaId");
  const aseguradoValor = formData.get("aseguradoId");
  const polizaId = typeof polizaValor === "string" && polizaValor ? Number(polizaValor) : null;
  const aseguradoId = typeof aseguradoValor === "string" && aseguradoValor ? Number(aseguradoValor) : null;
  if ((polizaId !== null && (!Number.isInteger(polizaId) || polizaId <= 0)) || (aseguradoId !== null && (!Number.isInteger(aseguradoId) || aseguradoId <= 0))) {
    throw new Error("Elegí un asegurado o póliza válidos.");
  }
  const compania = formData.get("compania");
  const ramo = formData.get("ramo");
  const afectado = formData.get("afectado");
  const fecha = fechaDe(formData, "fecha");
  const tipo = formData.get("tipo");
  const descripcion = formData.get("descripcion");
  if (fecha && !validarFechaHecho(fecha)) throw new Error("La fecha del hecho no puede ser posterior a la fecha actual.");
  if (!fecha || typeof tipo !== "string" || !TIPOS_SINIESTRO.some((item) => item.id === tipo) || typeof descripcion !== "string" || !descripcion.trim()) {
    throw new Error("Completá el tipo, la fecha y la descripción del siniestro.");
  }
  const lugar = formData.get("lugar");
  const relato = formData.get("relato");
  const avisoDe = formData.get("avisoDe");
  const notaInterna = formData.get("notaInterna");
  const archivosFormulario = formData.getAll("archivos").filter((item): item is File => item instanceof File && item.size > 0);
  const tamanoTotal = archivosFormulario.reduce((total, archivo) => total + archivo.size, 0);
  if (archivosFormulario.length > 20) throw new Error("Adjuntá hasta 20 archivos por expediente.");
  if (tamanoTotal > 25 * 1024 * 1024) throw new Error("Los archivos no pueden superar 25 MB en total.");
  if (archivosFormulario.some((archivo) => !archivoPermitido(archivo))) throw new Error("Adjuntá un formato de archivo compatible.");
  const archivos = await leerArchivos(archivosFormulario);
  const id = await cargarSiniestroAgente({
    polizaId,
    aseguradoId,
    compania: typeof compania === "string" ? compania.trim().slice(0, 120) || null : null,
    ramo: typeof ramo === "string" ? ramo.trim().slice(0, 100) || null : null,
    afectado: typeof afectado === "string" ? afectado.trim().slice(0, 180) || null : null,
    tipo,
    descripcion: descripcion.trim().slice(0, 250),
    fecha,
    lugar: typeof lugar === "string" ? lugar.trim().slice(0, 250) || null : null,
    relato: typeof relato === "string" ? relato.trim().slice(0, 4000) || null : null,
    avisoDe: typeof avisoDe === "string" ? avisoDe.trim().slice(0, 160) || null : null,
    notaInterna: typeof notaInterna === "string" ? notaInterna.trim().slice(0, 2000) || null : null,
    archivos,
  });
  volver(id, "siniestro-cargado");
}

export async function agregarArchivosSiniestro(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const requisitoValor = formData.get("requisitoId");
  const requisitoId = typeof requisitoValor === "string" && requisitoValor ? Number(requisitoValor) : null;
  const archivosFormulario = formData.getAll("archivos").filter((item): item is File => item instanceof File && item.size > 0);
  const tab = pestanaDe(formData);
  if (requisitoId !== null && (!Number.isInteger(requisitoId) || requisitoId <= 0)) volver(id, "requisito-inexistente", tab);
  if (!archivosFormulario.length) volver(id, "archivos-sin-seleccionar", tab);
  if (archivosFormulario.some((archivo) => !archivoPermitido(archivo))) volver(id, "archivo-invalido", tab);
  const tamanoTotal = archivosFormulario.reduce((total, archivo) => total + archivo.size, 0);
  if (archivosFormulario.length > 20 || tamanoTotal > 25 * 1024 * 1024) volver(id, "archivos-limite", tab);
  const archivos = await leerArchivos(archivosFormulario);
  const resultado = await agregarArchivosSiniestroAgente(id, archivos, requisitoId);
  if (resultado === "inexistente") volver(id, "siniestro-inexistente", tab);
  if (resultado === "requisito-inexistente") volver(id, "requisito-inexistente", tab);
  if (resultado === "limite") volver(id, "archivos-limite", tab);
  volver(id, "archivos-cargados", tab);
}

export async function eliminarArchivoSiniestro(formData: FormData) {
  await requerirSesion();
  const siniestroId = idDe(formData, "siniestroId");
  const siniestroArchivoId = idDe(formData, "siniestroArchivoId");
  const tab = pestanaDe(formData);
  const resultado = await eliminarArchivoSiniestroAgente(siniestroId, siniestroArchivoId);
  if (resultado === "inexistente") volver(siniestroId, "siniestro-inexistente", tab);
  if (resultado === "archivo-inexistente") volver(siniestroId, "archivo-inexistente", tab);
  if (resultado === "denuncia-enviada") volver(siniestroId, "archivo-denuncia-enviada", tab);
  volver(siniestroId, "archivo-eliminado", tab);
}

export async function guardarConfiguracionSiniestro(formData: FormData) {
  await requerirSesion();
  const compania = String(formData.get("compania") ?? "").trim();
  const ramo = String(formData.get("ramo") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  if (!compania || !ramo || !TIPOS_SINIESTRO.some((item) => item.id === tipo)) throw new Error("Completá compañía, ramo y tipo de siniestro.");
  const leerPlazo = (campo: string) => {
    const valor = String(formData.get(campo) ?? "").trim();
    if (!valor) return null;
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < 1 || numero > 365) throw new Error("Los plazos deben estar entre 1 y 365 días.");
    return numero;
  };
  const requisitos = String(formData.get("requisitos") ?? "")
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => ({ bloqueante: !linea.startsWith("?"), nombre: linea.replace(/^\?\s*/, "").slice(0, 180) }))
    .filter((item) => item.nombre);
  const ordenDossier = String(formData.get("ordenDossier") ?? "")
    .split(/\r?\n/)
    .map((linea) => linea.trim().slice(0, 120))
    .filter(Boolean);
  await db.insert(schema.siniestroConfiguracion).values({
    compania,
    ramo,
    tipo,
    requisitos,
    ordenDossier,
    plazoAvisoDias: leerPlazo("plazoAvisoDias"),
    diasSinNovedades: leerPlazo("diasSinNovedades"),
    vozAgente: String(formData.get("vozAgente") ?? "").trim().slice(0, 250) || null,
    actualizadoEl: new Date(),
  }).onConflictDoUpdate({
    target: [schema.siniestroConfiguracion.compania, schema.siniestroConfiguracion.ramo, schema.siniestroConfiguracion.tipo],
    set: {
      requisitos,
      ordenDossier,
      plazoAvisoDias: leerPlazo("plazoAvisoDias"),
      diasSinNovedades: leerPlazo("diasSinNovedades"),
      vozAgente: String(formData.get("vozAgente") ?? "").trim().slice(0, 250) || null,
      actualizadoEl: new Date(),
    },
  });
  revalidatePath("/agentes/siniestros");
  revalidatePath("/agentes/siniestros/configuracion");
  redirect("/agentes/siniestros/configuracion?aviso=guardado");
}

export async function registrarGastoSiniestro(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const tipo = String(formData.get("tipo") ?? "").trim().slice(0, 80);
  const descripcion = String(formData.get("descripcion") ?? "").trim().slice(0, 250);
  const fecha = String(formData.get("fecha") ?? "");
  const monto = numeroDe(formData, "monto");
  if (!tipo || !descripcion || !monto || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Completá el tipo, el detalle, el monto y la fecha del gasto.");
  const fechaValida = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(fechaValida.getTime()) || fechaValida.toISOString().slice(0, 10) !== fecha) throw new Error("La fecha del gasto no es válida.");
  await db.insert(schema.siniestroGastos).values({ siniestroId: id, tipo, descripcion, monto, fecha });
  await db.insert(schema.siniestroEventos).values({ siniestroId: id, quien: "Vos", texto: `Registraste un gasto de ${monto.toLocaleString("es-AR")} pesos: ${descripcion}.` });
  volver(id, "gasto-registrado");
}

export async function crearInformeSiniestro(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const tipo = String(formData.get("tipo") ?? "resumen");
  if (!["resumen", "constancia", "denuncia"].includes(tipo)) throw new Error("Tipo de informe inválido.");
  const [siniestro] = await db.select().from(schema.siniestros).where(eq(schema.siniestros.id, id));
  if (!siniestro) throw new Error("Siniestro inexistente.");
  const [asegurado] = siniestro.aseguradoId ? await db.select().from(schema.asegurados).where(eq(schema.asegurados.id, siniestro.aseguradoId)) : [];
  await db.insert(schema.siniestroInformes).values({
    siniestroId: id,
    tipo,
    contenido: {
      folio: siniestro.folio ?? `SIN-${String(siniestro.id).padStart(6, "0")}`,
      asegurado: asegurado?.nombre ?? siniestro.afectado ?? "Sin vincular",
      compania: siniestro.compania,
      ramo: siniestro.ramo,
      descripcion: siniestro.descripcion,
      fecha: siniestro.fecha.toISOString(),
      lugar: siniestro.lugar,
      relato: siniestro.relato,
      estado: siniestro.etapa,
      denuncia: siniestro.denuncia ?? [],
    },
  });
  await db.insert(schema.siniestroEventos).values({ siniestroId: id, quien: "Vos", texto: `Preparaste un borrador de ${tipo === "constancia" ? "constancia" : tipo === "denuncia" ? "denuncia" : "resumen del siniestro"}.` });
  volver(id, "informe-creado");
}
