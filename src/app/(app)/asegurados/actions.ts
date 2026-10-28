"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { borrarEjemplosDeCartera } from "@/db/ejemplos";
import { crearSolicitud, SinCompaniasCotizablesError } from "@/agentes/cotizacion/solicitudes";
import { contactoDe, esVigente, gruposDeVencimiento, textoAvisoVencimiento } from "@/lib/asegurados";
import { requerirSesion } from "@/lib/auth";
import { diaEnArgentina, diaYMes } from "@/lib/fechas";
import { oportunidadesDe } from "@/lib/oportunidades";

const TAMANO_MAXIMO = 5 * 1024 * 1024;

function entero(valor: FormDataEntryValue | null): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Dato inválido");
  return n;
}

/** Vuelve a la página desde la que se llamó (solo rutas internas). */
function volver(formData: FormData, aviso?: string): never {
  const destino = String(formData.get("volver") ?? "/asegurados");
  const url = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/asegurados";
  redirect(aviso ? `${url}${url.includes("?") ? "&" : "?"}aviso=${encodeURIComponent(aviso)}` : url);
}

function revalidarCartera() {
  revalidatePath("/", "layout");
}

async function aseguradoConPolizas(id: number) {
  const [a] = await db.select().from(schema.asegurados).where(eq(schema.asegurados.id, id));
  if (!a) throw new Error("Asegurado inexistente");
  const polizas = await db
    .select()
    .from(schema.polizas)
    .where(and(eq(schema.polizas.aseguradoId, id), isNull(schema.polizas.bajaEl)));
  return { ...a, polizas };
}

/** "Agregar a seguimiento" de una oportunidad: alterna. */
export async function alternarSeguimiento(formData: FormData) {
  await requerirSesion();
  const aseguradoId = entero(formData.get("aseguradoId"));
  const clave = String(formData.get("clave") ?? "").slice(0, 80);
  if (!clave) throw new Error("Oportunidad inválida");
  const borradas = await db
    .delete(schema.oportunidadesSeguimiento)
    .where(and(eq(schema.oportunidadesSeguimiento.aseguradoId, aseguradoId), eq(schema.oportunidadesSeguimiento.clave, clave)))
    .returning({ id: schema.oportunidadesSeguimiento.id });
  if (!borradas.length) await db.insert(schema.oportunidadesSeguimiento).values({ aseguradoId, clave });
  revalidatePath("/asegurados", "layout");
}

/**
 * Prepara el aviso de vencimiento de las pólizas que vencen primero. Queda
 * como borrador en Vencimientos: no sale hasta que lo aprobás.
 */
async function prepararAviso(aseguradoId: number): Promise<boolean> {
  const hoy = diaEnArgentina(new Date());
  const a = await aseguradoConPolizas(aseguradoId);
  const [grupo] = gruposDeVencimiento(a.polizas, hoy, 1);
  if (!grupo) return false;
  const { telefono, email } = contactoDe(a);
  if (!telefono && !email) return false;
  const referencia = `vencimiento:${a.id}:${grupo.fecha}`;
  const [existente] = await db
    .select({ id: schema.mensajes.id })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.referencia, referencia), eq(schema.mensajes.estado, "borrador")));
  if (existente) return true;
  await db.insert(schema.mensajes).values({
    aseguradoId: a.id,
    agente: "cartera",
    canal: telefono ? "whatsapp" : "email",
    destinatario: telefono ?? email,
    asunto: telefono ? null : "Vencimiento de tu seguro",
    referencia,
    motivo: `${grupo.polizas.length === 1 ? "Vence 1 póliza" : `Vencen ${grupo.polizas.length} pólizas`} el ${diaYMes(grupo.fecha)}.`,
    texto: textoAvisoVencimiento(a, grupo.polizas),
    esEjemplo: a.esEjemplo,
  });
  return true;
}

export async function avisarVencimiento(formData: FormData) {
  await requerirSesion();
  const ok = await prepararAviso(entero(formData.get("aseguradoId")));
  revalidarCartera();
  volver(formData, ok ? "aviso-preparado" : "sin-contacto");
}

/** Acción en lote desde la lista: prepara el aviso de cada asegurado elegido. */
export async function avisarVencimientoLote(ids: number[]): Promise<{ preparados: number; sinContacto: number }> {
  await requerirSesion();
  let preparados = 0;
  let sinContacto = 0;
  for (const id of ids.filter((x) => Number.isInteger(x) && x > 0).slice(0, 500)) {
    if (await prepararAviso(id)) preparados++;
    else sinContacto++;
  }
  revalidarCartera();
  return { preparados, sinContacto };
}

/** Crea una solicitud de renovación con las pólizas que vencen en esa fecha. */
export async function prepararRenovacion(formData: FormData) {
  await requerirSesion();
  const hoy = diaEnArgentina(new Date());
  const a = await aseguradoConPolizas(entero(formData.get("aseguradoId")));
  const fecha = String(formData.get("fecha") ?? "");
  const polizas = a.polizas.filter((p) => esVigente(p, hoy) && p.vigenciaHasta === fecha);
  if (!polizas.length) volver(formData);
  const ramos = [...new Set(polizas.map((p) => p.ramo))];
  let numero: number;
  try {
    numero = await crearSolicitud({
      aseguradoId: a.id,
      cliente: a.nombre,
      tipo: "renovacion",
      ramo: ramos.join(" y "),
      bien: polizas.length === 1 ? polizas[0].bien : `${polizas.length} pólizas`,
      motivo: `Vence el ${diaYMes(fecha)}`,
    });
  } catch (error) {
    if (error instanceof SinCompaniasCotizablesError) volver(formData, "cotizacion-sin-companias");
    throw error;
  }
  revalidarCartera();
  volver(formData, `solicitud-${numero}`);
}

/** "Pedir cotización" desde una oportunidad de mejora o venta cruzada. */
export async function pedirCotizacionOportunidad(formData: FormData) {
  await requerirSesion();
  const hoy = diaEnArgentina(new Date());
  const a = await aseguradoConPolizas(entero(formData.get("aseguradoId")));
  const clave = String(formData.get("clave") ?? "");
  const vigentes = a.polizas.filter((p) => esVigente(p, hoy));
  const contacto = contactoDe(a);
  const oportunidad = oportunidadesDe({ tipo: a.tipo, ...contacto, polizas: vigentes }, Number(hoy.slice(0, 4))).find(
    (o) => o.clave === clave,
  );
  if (!oportunidad?.ramo) volver(formData);
  const poliza = vigentes.find((p) => p.id === oportunidad.polizaId);
  let numero: number;
  try {
    numero = await crearSolicitud({
      aseguradoId: a.id,
      cliente: a.nombre,
      tipo: "mejora",
      ramo: oportunidad.ramo,
      bien: poliza?.bien ?? null,
      motivo: oportunidad.titulo,
    });
  } catch (error) {
    if (error instanceof SinCompaniasCotizablesError) volver(formData, "cotizacion-sin-companias");
    throw error;
  }
  revalidarCartera();
  volver(formData, `solicitud-${numero}`);
}

export async function guardarNota(formData: FormData) {
  await requerirSesion();
  const aseguradoId = entero(formData.get("aseguradoId"));
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 4000);
  if (texto) await db.insert(schema.notasAsegurado).values({ aseguradoId, texto, tipo: "nota" });
  revalidatePath(`/asegurados/${aseguradoId}`);
  volver(formData);
}

export async function subirDocumento(formData: FormData) {
  await requerirSesion();
  const aseguradoId = entero(formData.get("aseguradoId"));
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) volver(formData, "documento-vacio");
  if (archivo.size > TAMANO_MAXIMO) volver(formData, "documento-grande");
  const contenido = Buffer.from(await archivo.arrayBuffer());
  await db.transaction(async (tx) => {
    const [guardado] = await tx
      .insert(schema.archivos)
      .values({ nombre: archivo.name.slice(0, 200), tipo: archivo.type || "application/octet-stream", tamano: archivo.size, contenido })
      .returning({ id: schema.archivos.id });
    await tx.insert(schema.documentosAsegurado).values({ aseguradoId, archivoId: guardado.id });
    await tx.insert(schema.notasAsegurado).values({ aseguradoId, tipo: "sistema", texto: `Subiste el documento ${archivo.name}.` });
  });
  revalidatePath(`/asegurados/${aseguradoId}`);
  volver(formData, "documento-subido");
}

export type EstadoFormAsegurado = { error?: string };

function texto(formData: FormData, campo: string, max = 200): string | null {
  const v = String(formData.get(campo) ?? "").trim().slice(0, max);
  return v || null;
}

/** Alta o edición de un asegurado a mano. */
export async function guardarAsegurado(_previo: EstadoFormAsegurado, formData: FormData): Promise<EstadoFormAsegurado> {
  await requerirSesion();
  const id = Number(formData.get("id")) || null;
  const nombre = texto(formData, "nombre");
  const tipo = formData.get("tipo") === "empresa" ? "empresa" : "persona";
  if (!nombre) return { error: "Escribí el nombre o la razón social." };
  const documento = texto(formData, "documento", 20);
  const digitos = documento?.replace(/\D/g, "") || null;
  if (digitos && digitos.length !== 11 && (digitos.length < 7 || digitos.length > 8)) {
    return { error: "El documento tiene que ser un DNI (7 u 8 números) o un CUIT/CUIL (11 números)." };
  }
  const anio = Number(formData.get("clienteDesde"));
  const nacimiento = tipo === "persona" ? texto(formData, "fechaNacimiento", 10) : null;
  const datos = {
    tipo: tipo as "persona" | "empresa",
    nombre,
    documento,
    documentoDigitos: digitos,
    localidad: texto(formData, "localidad"),
    telefono: texto(formData, "telefono", 40),
    email: texto(formData, "email", 120),
    domicilio: texto(formData, "domicilio"),
    codigoPostal: texto(formData, "codigoPostal", 10),
    // El campo de fecha manda AAAA-MM-DD.
    fechaNacimiento: nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(nacimiento) && nacimiento >= "1900" ? nacimiento : null,
    contactoNombre: tipo === "empresa" ? texto(formData, "contactoNombre") : null,
    contactoTelefono: tipo === "empresa" ? texto(formData, "contactoTelefono", 40) : null,
    contactoEmail: tipo === "empresa" ? texto(formData, "contactoEmail", 120) : null,
    clienteDesde: Number.isInteger(anio) && anio > 1950 && anio < 2100 ? anio : null,
    notas: texto(formData, "notas", 4000),
    actualizadoEl: new Date(),
  };
  let destino: number;
  if (id) {
    await db.update(schema.asegurados).set(datos).where(eq(schema.asegurados.id, id));
    destino = id;
  } else {
    const [fila] = await db.insert(schema.asegurados).values(datos).returning({ id: schema.asegurados.id });
    destino = fila.id;
  }
  revalidarCartera();
  redirect(`/asegurados/${destino}?aviso=guardado`);
}

/** "Borrar datos de ejemplo" desde Más acciones. */
export async function borrarCarteraDeEjemplo() {
  await requerirSesion();
  await borrarEjemplosDeCartera();
  revalidarCartera();
  redirect("/asegurados?aviso=ejemplos-borrados");
}

