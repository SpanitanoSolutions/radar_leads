"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CampoDenuncia, EtapaSiniestro } from "@/db/schema";
import {
  actualizarTramite as actualizarTramiteAgente,
  cargarSiniestro as cargarSiniestroAgente,
  enviarDenuncia as enviarDenunciaAgente,
  enviarReclamo as enviarReclamoAgente,
  guardarDenuncia as guardarDenunciaAgente,
  mandarRecordatorio as mandarRecordatorioAgente,
  marcarDocumento as marcarDocumentoAgente,
} from "@/agentes/siniestros";
import { requerirSesion } from "@/lib/auth";
import { ETAPAS } from "@/lib/siniestros";

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

export async function enviarDenuncia(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const resultado = await enviarDenunciaAgente(id);
  volver(id, resultado.ok ? "denuncia-enviada" : "envio-error");
}

export async function mandarRecordatorio(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const resultado = await mandarRecordatorioAgente(id);
  volver(id, resultado.ok ? "recordatorio-enviado" : resultado.error === "sin-contacto" ? "sin-contacto" : "envio-error");
}

export async function enviarReclamo(formData: FormData) {
  await requerirSesion();
  const id = idDe(formData);
  const resultado = await enviarReclamoAgente(id);
  volver(id, resultado.ok ? "reclamo-enviado" : "envio-error");
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

export async function cargarSiniestro(formData: FormData) {
  await requerirSesion();
  const polizaId = idDe(formData, "polizaId");
  const compania = formData.get("compania");
  const fecha = fechaDe(formData, "fecha");
  const tipo = formData.get("tipo");
  const descripcion = formData.get("descripcion");
  if (typeof compania !== "string" || !compania.trim() || !fecha || typeof tipo !== "string" || typeof descripcion !== "string" || !descripcion.trim()) {
    throw new Error("Completá la empresa, la póliza, el tipo, la fecha y la descripción.");
  }
  const lugar = formData.get("lugar");
  const relato = formData.get("relato");
  const avisoDe = formData.get("avisoDe");
  const id = await cargarSiniestroAgente({
    polizaId,
    compania: compania.trim(),
    tipo,
    descripcion: descripcion.trim(),
    fecha,
    lugar: typeof lugar === "string" ? lugar.trim() || null : null,
    relato: typeof relato === "string" ? relato.trim() || null : null,
    avisoDe: typeof avisoDe === "string" ? avisoDe.trim() || null : null,
  });
  volver(id, "siniestro-cargado");
}
