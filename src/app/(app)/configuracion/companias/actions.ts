"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ALCANCE_CARTERA } from "@/agentes/validador/cartera";
import { desconfirmarPlantilla } from "@/agentes/validador/configuracion";
import type { EstadoForm } from "@/components/Formularios";
import { requerirSesion } from "@/lib/auth";
import { ORDEN_CANALES } from "@/lib/conectores/canales";
import { ALCANCE_CONEXIONES, guardarCanalesDeCompania } from "@/lib/conectores/companias";
import { borrarCredencial, credencialParaConector, guardarCredencial, type EstadoCredencial } from "@/lib/conectores/credenciales";
import { probarConexion } from "@/lib/conectores/ejecutar";
import { registroConectores } from "@/lib/conectores/registro";
import { agenteDe, leerOrdenCanales, TITULO_CANAL } from "@/lib/conectores/vista";
import { companiaCanonica } from "@/lib/importacion";

// Configuración → Conexiones con las compañías, común a los tres agentes.
// Cada acción vuelve a la compañía y al agente desde donde se tocó.

const BASE = "/configuracion/companias";
const texto = (formData: FormData, campo: string, max = 200) => String(formData.get(campo) ?? "").trim().slice(0, max);
const compania = (formData: FormData) => companiaCanonica(texto(formData, "compania", 80));

function entero(valor: FormDataEntryValue | null): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Dato inválido");
  return n;
}

function ir(formData: FormData, extra: Record<string, string>): never {
  const agente = agenteDe(formData.get("agente"));
  revalidatePath("/configuracion", "layout");
  revalidatePath("/agentes", "layout");
  redirect(`${BASE}?${new URLSearchParams({ cia: compania(formData), ...(agente ? { agente } : {}), ...extra })}`);
}

/** El orden de los canales de la compañía (conector_companias). Vale para todos los agentes. */
export async function guardarOrdenCanales(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const nombre = compania(formData);
  if (!nombre) return { error: "Falta la compañía." };
  const orden = leerOrdenCanales({
    modo: texto(formData, "modo", 20),
    lugares: Object.fromEntries(ORDEN_CANALES.map((canal) => [canal, texto(formData, `lugar-${canal}`, 2)])),
  });
  if ("error" in orden) return orden;
  await guardarCanalesDeCompania(nombre, orden.canales, ALCANCE_CONEXIONES);
  ir(formData, { aviso: "canales-guardados" });
}

const ESTADOS: EstadoCredencial[] = ["activa", "vencida", "desactivada"];

/** Agrega o edita una credencial del portal. La contraseña se cifra; al editar, vacía conserva la anterior. */
export async function guardarCredencialCompania(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const id = formData.get("id") ? entero(formData.get("id")) : undefined;
  const nombre = compania(formData);
  const etiqueta = texto(formData, "etiqueta", 80);
  const usuario = texto(formData, "usuario", 120);
  const secreto = String(formData.get("secreto") ?? "").slice(0, 200);
  const estado = ESTADOS.find((e) => e === formData.get("estado"));
  if (!nombre || !etiqueta || !usuario) return { error: "Completá la etiqueta y el usuario." };
  if (!id && !secreto) return { error: "Completá la contraseña del portal." };
  try {
    await guardarCredencial({ id, compania: nombre, etiqueta, usuario, secreto: secreto || undefined, estado }, ALCANCE_CONEXIONES);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    return {
      error: /Falta|bytes/.test(mensaje)
        ? "Falta la clave para cifrar las credenciales (CREDENCIALES_PORTAL_KEY) en el servidor: no se guardó nada."
        : "No se pudo guardar la credencial. Probá de nuevo.",
    };
  }
  ir(formData, { aviso: id ? "credencial-editada" : "credencial-guardada" });
}

export async function borrarCredencialCompania(formData: FormData) {
  await requerirSesion();
  await borrarCredencial(entero(formData.get("id")), ALCANCE_CONEXIONES);
  ir(formData, { aviso: "credencial-borrada" });
}

/**
 * "Probar conexión" de un canal: llama al conector con la credencial activa
 * de la compañía y actualiza su salud. El portal necesita una credencial; la
 * conexión directa la usa si hay. El resultado vuelve en `?prueba=`.
 */
export async function probarConexionCompania(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const nombre = compania(formData);
  const canal = ORDEN_CANALES.find((c) => c === formData.get("canal"));
  const conector = canal && registroConectores.conectoresPara(nombre).find((c) => c.tipo === canal);
  if (!canal || !conector) return { error: `No hay ${canal ? TITULO_CANAL[canal].toLowerCase() : "conexión"} para probar con ${nombre}.` };
  let credencial;
  try {
    credencial = await credencialParaConector(nombre, ALCANCE_CONEXIONES);
  } catch {
    return { error: "No se pudo leer la clave guardada: falta la clave para descifrar las credenciales (CREDENCIALES_PORTAL_KEY) en el servidor." };
  }
  if (canal === "portal" && !credencial) return { error: `Cargá un usuario y una contraseña activos del portal de ${nombre} antes de probarlo.` };
  const resultado = await probarConexion(conector, credencial ?? undefined, { agente: "configuracion", ...ALCANCE_CONEXIONES });
  ir(formData, { prueba: `${canal}:${resultado.ok ? "ok" : resultado.codigo}` });
}

/** La plantilla del listado del Validador (el canal archivo): el próximo listado se vuelve a confirmar. */
export async function dejarDeUsarPlantillaCompania(formData: FormData) {
  await requerirSesion();
  await desconfirmarPlantilla(entero(formData.get("id")), ALCANCE_CARTERA);
  ir(formData, { aviso: "plantilla-desactivada" });
}
