"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";
import { interpretarEstrategiaSeguimiento } from "@/lib/cotizacion";
import { cifrarCredencial } from "@/lib/cotizacion/credenciales";
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
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=guardado");
}

export async function guardarAseguradoraCotizacion(formData: FormData) {
  await requerirSesion();
  const nombre = texto(formData, "nombre", 120);
  const canal = texto(formData, "canal");
  const ramos = texto(formData, "ramos", 500).split(",").map((ramo) => ramo.trim()).filter(Boolean);
  const email = texto(formData, "email", 254);
  if (!nombre || !["correo", "portal", "ambos"].includes(canal) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    redirect("/agentes/cotizacion/configuracion?aviso=aseguradora-invalida");
  }
  const contactos = email ? [{ nombre: texto(formData, "contacto", 120), email, rol: texto(formData, "rol", 80) }] : [];
  await db.insert(schema.cotizacionAseguradoras).values({
    nombre, canal: canal as "correo" | "portal" | "ambos", ramos, contactos,
    codigoProductor: texto(formData, "codigoProductor", 100) || null,
    asunto: texto(formData, "asunto", 300) || null,
    instrucciones: texto(formData, "instrucciones", 1000) || null,
    activa: formData.get("activa") === "on",
    actualizadoEl: new Date(),
  }).onConflictDoUpdate({
    target: schema.cotizacionAseguradoras.nombre,
    set: {
      canal: canal as "correo" | "portal" | "ambos", ramos, contactos,
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
  revalidatePath("/agentes/cotizacion/configuracion");
  redirect("/agentes/cotizacion/configuracion?aviso=paquete-guardado");
}

export async function guardarCredencialPortal(formData: FormData) {
  await requerirSesion();
  const compania = texto(formData, "compania", 120);
  const usuario = texto(formData, "usuario", 200);
  const clavePortal = texto(formData, "clavePortal", 1000);
  if (!compania || !usuario || !clavePortal) redirect("/agentes/cotizacion/configuracion?aviso=credencial-invalida");
  let credencialesCifradas: string;
  try {
    credencialesCifradas = cifrarCredencial(JSON.stringify({ usuario, clave: clavePortal }), process.env.COTIZACION_CREDENTIALS_KEY);
  } catch {
    redirect("/agentes/cotizacion/configuracion?aviso=clave-cifrado-faltante");
  }
  const clave = `portal:${compania}`;
  const [actual] = await db.select({ datos: schema.conexiones.datos }).from(schema.conexiones).where(eq(schema.conexiones.clave, clave));
  const datos = { ...(actual?.datos ?? {}), credencialesCifradas, credencialesActualizadasEl: new Date().toISOString() };
  await db.insert(schema.conexiones).values({ clave, tipo: "portal", compania, estado: "sin_conectar", datos })
    .onConflictDoUpdate({ target: schema.conexiones.clave, set: { datos, actualizadoEl: new Date() } });
  revalidatePath("/agentes/cotizacion/configuracion");
  redirect("/agentes/cotizacion/configuracion?aviso=credencial-guardada");
}

export async function importarAseguradorasCotizacion(formData: FormData) {
  await requerirSesion();
  const archivo = formData.get("archivoAseguradoras");
  if (!(archivo instanceof File) || archivo.size === 0 || archivo.size > 5 * 1024 * 1024) redirect("/agentes/cotizacion/configuracion?aviso=archivo-catalogo-invalido");
  let filas: string[][];
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (/\.xlsx$/i.test(archivo.name)) filas = await leerXlsx(bytes);
    else if (/\.csv$/i.test(archivo.name)) {
      const contenido = new TextDecoder("utf-8").decode(bytes);
      const separador = contenido.split("\n", 1)[0].includes(";") ? ";" : ",";
      const generador = celdasCsv([contenido], separador);
      filas = [];
      for await (const fila of generador) filas.push(fila);
    } else redirect("/agentes/cotizacion/configuracion?aviso=archivo-catalogo-invalido");
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
  const colCanal = indice("canal");
  if (colNombre < 0 || colRamos < 0) redirect("/agentes/cotizacion/configuracion?aviso=encabezados-catalogo-invalidos");
  const filasValidas = filas.slice(1).map((fila) => ({
    nombre: (fila[colNombre] ?? "").trim().slice(0, 120),
    ramos: (fila[colRamos] ?? "").split(/[;,|]/).map((ramo) => ramo.trim()).filter(Boolean),
    canalTexto: colCanal < 0 ? "correo" : normalizar(fila[colCanal] ?? "correo"),
  })).filter((fila) => fila.nombre);
  if (!filasValidas.length || filasValidas.some((fila) => !fila.ramos.length || !["correo", "portal", "ambos"].includes(fila.canalTexto))) {
    redirect("/agentes/cotizacion/configuracion?aviso=datos-catalogo-invalidos");
  }
  await db.transaction(async (tx) => {
    for (const aseguradora of filasValidas) {
      await tx.insert(schema.cotizacionAseguradoras).values({
        nombre: aseguradora.nombre, ramos: aseguradora.ramos, canal: aseguradora.canalTexto as "correo" | "portal" | "ambos", activa: true,
      }).onConflictDoUpdate({
        target: schema.cotizacionAseguradoras.nombre,
        set: { ramos: aseguradora.ramos, canal: aseguradora.canalTexto as "correo" | "portal" | "ambos", activa: true, actualizadoEl: new Date() },
      });
    }
  });
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=importacion-catalogo-ok");
}

export async function guardarFeatureCotizacionIA(formData: FormData) {
  await requerirSesion();
  if (!process.env.ANTHROPIC_API_KEY) redirect("/agentes/cotizacion/configuracion?aviso=ia-sin-clave");
  const activa = formData.get("iaActiva") === "on";
  const [actual] = await db.select({ id: schema.orgFeatures.id }).from(schema.orgFeatures)
    .where(and(isNull(schema.orgFeatures.orgId), eq(schema.orgFeatures.feature, "cotizacion_ia"))).limit(1);
  if (actual) await db.update(schema.orgFeatures).set({ activa, actualizadoEl: new Date() }).where(eq(schema.orgFeatures.id, actual.id));
  else await db.insert(schema.orgFeatures).values({ orgId: null, feature: "cotizacion_ia", activa });
  revalidatePath("/agentes/cotizacion");
  redirect("/agentes/cotizacion/configuracion?aviso=ia-guardada");
}
