"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { guardarInterruptorIACotizacion, sugerirEstrategiaSeguimiento, type SugerenciaEstrategia } from "@/agentes/cotizacion/ia";
import { requerirSesion } from "@/lib/auth";
import { interpretarEstrategiaSeguimiento } from "@/lib/cotizacion";
import { validarTipoSeguro } from "@/lib/cotizacion/tipos-seguro";
import { leerXlsx } from "@/lib/xlsx";
import { celdasCsv } from "@/fuentes/csv";
import { normalizar } from "@/fuentes/clasificacion";

function texto(form: FormData, clave: string, limite = 1000): string {
  const valor = form.get(clave);
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

export async function guardarConfiguracionCotizacion(formData: FormData) {
  await requerirSesion();
  const estrategiaSeguimiento = texto(formData, "estrategiaSeguimiento", 1000);
  if (!interpretarEstrategiaSeguimiento(estrategiaSeguimiento)) redirect("/agentes/cotizacion/configuracion?aviso=estrategia-invalida");
  const intervaloHoras = Number(texto(formData, "intervaloHoras"));
  const maxSeguimientos = Number(texto(formData, "maxSeguimientos"));
  if (![24, 48, 72].includes(intervaloHoras) || !Number.isInteger(maxSeguimientos) || maxSeguimientos < 1 || maxSeguimientos > 6) {
    redirect("/agentes/cotizacion/configuracion?aviso=configuracion-invalida");
  }
  await db.insert(schema.cotizacionConfig).values({
    id: 1,
    persona: texto(formData, "persona", 60) || "Verónica",
    nombreAgente: texto(formData, "nombreAgente", 60) || "Verónica",
    personalidad: texto(formData, "personalidad", 1000),
    intervaloHoras,
    estrategiaSeguimiento,
    maxSeguimientos,
    paisFeriados: "AR",
    idioma: "es-AR",
    plantillaAsunto: texto(formData, "plantillaAsunto", 300),
    plantillaCuerpo: texto(formData, "plantillaCuerpo", 5000),
    instruccionesCuerpo: texto(formData, "instruccionesCuerpo", 2000),
    cuentaSaliente: texto(formData, "cuentaSaliente", 254) || null,
    cotizarAutomaticamente: formData.get("cotizarAutomaticamente") === "on",
    agenteActivo: formData.get("agenteActivo") === "on",
  }).onConflictDoUpdate({
    target: schema.cotizacionConfig.id,
    set: {
      persona: texto(formData, "persona", 60) || "Verónica",
      nombreAgente: texto(formData, "nombreAgente", 60) || "Verónica",
      personalidad: texto(formData, "personalidad", 1000),
      intervaloHoras,
      estrategiaSeguimiento,
      maxSeguimientos,
      plantillaAsunto: texto(formData, "plantillaAsunto", 300),
      plantillaCuerpo: texto(formData, "plantillaCuerpo", 5000),
      instruccionesCuerpo: texto(formData, "instruccionesCuerpo", 2000),
      cuentaSaliente: texto(formData, "cuentaSaliente", 254) || null,
      cotizarAutomaticamente: formData.get("cotizarAutomaticamente") === "on",
      agenteActivo: formData.get("agenteActivo") === "on",
      actualizadoEl: new Date(),
    },
  });
  // El checklist del inicio da por elegida la voz cuando se guarda alguna vez, aunque quede la que viene.
  await db.insert(schema.configuracionAgentes).values({ agente: "cotizacion", config: { vozElegida: true } }).onConflictDoUpdate({
    target: schema.configuracionAgentes.agente,
    set: { config: sql`${schema.configuracionAgentes.config} || '{"vozElegida": true}'::jsonb`, actualizadoEl: new Date() },
  });
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=guardado");
}

/**
 * Agrega o edita una aseguradora por su nombre. El canal viejo (`canal`) ya no
 * decide nada: cómo se conecta cada compañía está en Configuración → Conexiones
 * con las compañías. Una nueva queda con "correo" y al editar no se toca.
 */
export async function guardarAseguradoraCotizacion(formData: FormData) {
  await requerirSesion();
  const nombre = texto(formData, "nombre", 120);
  const ramos = texto(formData, "ramos", 500).split(",").map((ramo) => ramo.trim()).filter(Boolean);
  const email = texto(formData, "email", 254);
  if (!nombre || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    redirect("/agentes/cotizacion/configuracion?aviso=aseguradora-invalida");
  }
  const contactos = email ? [{ nombre: texto(formData, "contacto", 120), email, rol: texto(formData, "rol", 80) }] : [];
  await db.insert(schema.cotizacionAseguradoras).values({
    nombre, canal: "correo", ramos, contactos,
    codigoProductor: texto(formData, "codigoProductor", 100) || null,
    asunto: texto(formData, "asunto", 300) || null,
    instrucciones: texto(formData, "instrucciones", 1000) || null,
    activa: formData.get("activa") === "on",
    actualizadoEl: new Date(),
  }).onConflictDoUpdate({
    target: schema.cotizacionAseguradoras.nombre,
    set: {
      ramos, contactos,
      codigoProductor: texto(formData, "codigoProductor", 100) || null,
      asunto: texto(formData, "asunto", 300) || null,
      instrucciones: texto(formData, "instrucciones", 1000) || null,
      activa: formData.get("activa") === "on", actualizadoEl: new Date(),
    },
  });
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=aseguradora-guardada");
}

export async function guardarPaqueteCotizacion(formData: FormData) {
  await requerirSesion();
  const aseguradoraId = Number(texto(formData, "aseguradoraId"));
  const ramo = texto(formData, "ramo", 100);
  const nombre = texto(formData, "nombre", 120);
  const asegurado = Number(texto(formData, "sumaAsegurada"));
  if (!Number.isInteger(aseguradoraId) || aseguradoraId <= 0 || !ramo || !nombre || (texto(formData, "sumaAsegurada") && (!Number.isFinite(asegurado) || asegurado < 0))) {
    redirect("/agentes/cotizacion/configuracion?aviso=paquete-invalido");
  }
  await db.insert(schema.cotizacionPaquetes).values({
    aseguradoraId, ramo, nombre, condiciones: texto(formData, "condiciones", 1000) || null,
    deducible: texto(formData, "deducible", 200) || null,
    sumaAsegurada: texto(formData, "sumaAsegurada") ? asegurado : null,
  }).onConflictDoNothing();
  revalidatePath("/agentes/cotizacion");
  revalidatePath("/agentes/cotizacion/configuracion");
  redirect("/agentes/cotizacion/configuracion?aviso=paquete-guardado");
}

export async function importarAseguradorasCotizacion(formData: FormData) {
  await requerirSesion();
  const archivo = formData.get("archivoAseguradoras");
  if (!(archivo instanceof File) || archivo.size === 0 || archivo.size > 5 * 1024 * 1024) redirect("/agentes/cotizacion/configuracion?aviso=archivo-catalogo-invalido");
  // Fuera del try: redirect() lanza un error propio de Next que el catch atraparía.
  if (!/\.(xlsx|csv)$/i.test(archivo.name)) redirect("/agentes/cotizacion/configuracion?aviso=archivo-catalogo-invalido");
  let filas: string[][];
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (/\.xlsx$/i.test(archivo.name)) filas = await leerXlsx(bytes);
    else {
      const contenido = new TextDecoder("utf-8").decode(bytes);
      const separador = contenido.split("\n", 1)[0].includes(";") ? ";" : ",";
      const generador = celdasCsv([contenido], separador);
      filas = [];
      for await (const fila of generador) filas.push(fila);
    }
  } catch {
    redirect("/agentes/cotizacion/configuracion?aviso=archivo-catalogo-invalido");
  }
  // El encabezado es la primera fila con datos (un Excel puede empezar más abajo).
  while (filas.length && !filas[0].some((celda) => celda.trim())) filas.shift();
  if (filas.length < 2) redirect("/agentes/cotizacion/configuracion?aviso=archivo-catalogo-invalido");
  const encabezados = filas[0].map((valor) => normalizar(valor));
  const indice = (...nombres: string[]) => encabezados.findIndex((encabezado) => nombres.includes(encabezado));
  const colNombre = indice("aseguradora", "compania", "nombre");
  const colRamos = indice("ramos", "ramo");
  if (colNombre < 0 || colRamos < 0) redirect("/agentes/cotizacion/configuracion?aviso=encabezados-catalogo-invalidos");
  // Una columna Canal (de un archivo viejo) se ignora: cómo se conecta cada compañía está en Conexiones con las compañías.
  const filasValidas = filas.slice(1).map((fila) => ({
    nombre: (fila[colNombre] ?? "").trim().slice(0, 120),
    ramos: (fila[colRamos] ?? "").split(/[;,|]/).map((ramo) => ramo.trim()).filter(Boolean),
  })).filter((fila) => fila.nombre);
  if (!filasValidas.length || filasValidas.some((fila) => !fila.ramos.length)) {
    redirect("/agentes/cotizacion/configuracion?aviso=datos-catalogo-invalidos");
  }
  await db.transaction(async (tx) => {
    for (const aseguradora of filasValidas) {
      await tx.insert(schema.cotizacionAseguradoras).values({
        nombre: aseguradora.nombre, ramos: aseguradora.ramos, canal: "correo", activa: true,
      }).onConflictDoUpdate({
        target: schema.cotizacionAseguradoras.nombre,
        set: { ramos: aseguradora.ramos, activa: true, actualizadoEl: new Date() },
      });
    }
  });
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=importacion-catalogo-ok");
}

export async function guardarFeatureCotizacionIA(formData: FormData) {
  await requerirSesion();
  if (!process.env.ANTHROPIC_API_KEY) redirect("/agentes/cotizacion/configuracion?aviso=ia-sin-clave");
  await guardarInterruptorIACotizacion(formData.get("iaActiva") === "on");
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=ia-guardada");
}

/** Alta o edición de un tipo de seguro. El ramo no se repite ni se renombra. */
export async function guardarTipoSeguroCotizacion(formData: FormData) {
  await requerirSesion();
  const idTexto = texto(formData, "id");
  const id = idTexto ? Number(idTexto) : null;
  if (id !== null && (!Number.isInteger(id) || id <= 0)) redirect("/agentes/cotizacion/configuracion?aviso=tipo-invalido#tipos");
  const existentes = await db.select({ id: schema.cotizacionTiposSeguro.id, ramo: schema.cotizacionTiposSeguro.ramo }).from(schema.cotizacionTiposSeguro);
  if (id !== null && !existentes.some((tipo) => tipo.id === id)) redirect("/agentes/cotizacion/configuracion?aviso=tipo-invalido#tipos");
  const validado = validarTipoSeguro({ id, ramo: texto(formData, "ramo", 200), descripcion: texto(formData, "descripcion", 1000), subTipos: texto(formData, "subTipos", 3000) }, existentes);
  if (!validado.ok) redirect(`/agentes/cotizacion/configuracion?aviso=${validado.error === "ramo-repetido" ? "tipo-repetido" : "tipo-invalido"}#tipos`);
  const { ramo, descripcion, subTipos } = validado.tipo;
  if (id !== null) await db.update(schema.cotizacionTiposSeguro).set({ descripcion, subTipos }).where(eq(schema.cotizacionTiposSeguro.id, id));
  else await db.insert(schema.cotizacionTiposSeguro).values({ ramo, descripcion, subTipos, activo: true });
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=tipo-guardado#tipos");
}

/** La baja de un tipo de seguro lo desactiva: deja de ofrecerse en la nueva solicitud y nada más cambia. */
export async function cambiarTipoSeguroCotizacion(formData: FormData) {
  await requerirSesion();
  const id = Number(texto(formData, "id"));
  const activo = texto(formData, "activo") === "si";
  if (!Number.isInteger(id) || id <= 0) redirect("/agentes/cotizacion/configuracion?aviso=tipo-invalido#tipos");
  const cambiados = await db.update(schema.cotizacionTiposSeguro).set({ activo }).where(eq(schema.cotizacionTiposSeguro.id, id)).returning({ id: schema.cotizacionTiposSeguro.id });
  if (!cambiados.length) redirect("/agentes/cotizacion/configuracion?aviso=tipo-invalido#tipos");
  revalidatePath("/agentes/cotizacion");
  redirect(`/agentes/cotizacion/configuracion?aviso=${activo ? "tipo-activado" : "tipo-desactivado"}#tipos`);
}

export type RespuestaSugerencia = { ok: true; estrategia: string; descripcion: string } | { ok: false; mensaje: string };

/**
 * "Sugerir con IA" de la estrategia: devuelve la sugerencia para ponerla en el
 * campo, sin guardar nada. Solo ofrece lo que el parser entiende.
 */
export async function sugerirEstrategiaConIA(pedido: unknown): Promise<RespuestaSugerencia> {
  await requerirSesion();
  const textoPedido = typeof pedido === "string" ? pedido.trim().slice(0, 500) : "";
  let r: SugerenciaEstrategia;
  try { r = await sugerirEstrategiaSeguimiento(textoPedido); }
  catch { r = { ok: false, motivo: "error" }; }
  if (r.ok) return { ok: true, estrategia: r.estrategia, descripcion: r.descripcion };
  const mensaje = r.motivo === "sin_clave" || r.motivo === "desactivada" ? "La IA no está activa para Cotización. Podés escribir la estrategia a mano."
    : r.motivo === "sin_cuota" ? "Se llegó al tope de gasto de IA de este mes. Podés escribir la estrategia a mano."
    : r.motivo === "invalida" ? "La IA propuso una estrategia que el agente no entiende. Probá de nuevo o escribila vos."
    : "La IA no pudo responder esta vez. Probá de nuevo en un rato o escribila vos.";
  return { ok: false, mensaje };
}
