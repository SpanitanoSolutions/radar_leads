"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ALCANCE_CARTERA, configValidador } from "@/agentes/validador/cartera";
import { desconfirmarPlantilla, guardarConfig, guardarGracia } from "@/agentes/validador/configuracion";
import { notificar } from "@/agentes/validador/notificaciones";
import { requerirSesion } from "@/lib/auth";
import { borrarCredencial, guardarCredencial, type EstadoCredencial } from "@/lib/conectores/credenciales";
import { companiaCanonica, leerMonto } from "@/lib/importacion";
import { leerProgramacion } from "@/lib/validador/configuracion";
import { leerGrillaGracia, TODOS_LOS_RAMOS } from "@/lib/validador/gracia";
import { EVENTOS_VALIDADOR, leerDestinatarios, leerNotificaciones, type EventoValidador } from "@/lib/validador/notificaciones";
import type { EstadoForm } from "../actions";

// Configuración del Validador. Todo se guarda con el alcance de la cartera
// (plataforma), porque la cartera todavía no tiene organización ni productor.

const BASE = "/agentes/validador/configuracion";
const texto = (formData: FormData, campo: string, max = 200) => String(formData.get(campo) ?? "").trim().slice(0, max);

function entero(valor: FormDataEntryValue | null): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Dato inválido");
  return n;
}

function refrescar() {
  revalidatePath("/agentes/validador", "layout");
}

function ir(tab: string, aviso: string, extra: Record<string, string> = {}): never {
  redirect(`${BASE}?${new URLSearchParams({ tab, ...extra, aviso })}`);
}

// ---------- Credenciales ----------

const ESTADOS: EstadoCredencial[] = ["activa", "vencida", "desactivada"];

/** Agrega o edita una credencial del portal. La contraseña se cifra; al editar, vacía conserva la anterior. */
export async function guardarCredencialPortal(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const id = formData.get("id") ? entero(formData.get("id")) : undefined;
  const compania = companiaCanonica(texto(formData, "compania", 80));
  const etiqueta = texto(formData, "etiqueta", 80);
  const usuario = texto(formData, "usuario", 120);
  const secreto = String(formData.get("secreto") ?? "").slice(0, 200);
  const estado = ESTADOS.find((e) => e === formData.get("estado"));
  if (!compania || !etiqueta || !usuario) return { error: "Completá la etiqueta y el usuario." };
  if (!id && !secreto) return { error: "Completá la contraseña del portal." };
  try {
    await guardarCredencial({ id, compania, etiqueta, usuario, secreto: secreto || undefined, estado }, ALCANCE_CARTERA);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    return {
      error: /Falta|bytes/.test(mensaje)
        ? "Falta la clave para cifrar las credenciales (CREDENCIALES_PORTAL_KEY) en el servidor: no se guardó nada."
        : "No se pudo guardar la credencial. Probá de nuevo.",
    };
  }
  refrescar();
  ir("credenciales", id ? "credencial-editada" : "credencial-guardada", { cia: compania });
}

export async function borrarCredencialPortal(formData: FormData) {
  await requerirSesion();
  await borrarCredencial(entero(formData.get("id")), ALCANCE_CARTERA);
  refrescar();
  ir("credenciales", "credencial-borrada", { cia: texto(formData, "compania", 80) });
}

export async function dejarDeUsarPlantilla(formData: FormData) {
  await requerirSesion();
  await desconfirmarPlantilla(entero(formData.get("id")), ALCANCE_CARTERA);
  refrescar();
  ir("credenciales", "plantilla-desactivada", { cia: texto(formData, "compania", 80) });
}

// ---------- General ----------

/** La grilla de un ramo y el interruptor general de la gracia. */
export async function guardarGraciaRamo(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const ramo = texto(formData, "ramo", 60) || TODOS_LOS_RAMOS;
  const filas = Math.min(Math.max(Number(formData.get("filas")) || 0, 0), 300);
  const entradas = Array.from({ length: filas }, (_, i) => ({
    compania: texto(formData, `compania-${i}`, 80),
    primera: texto(formData, `primera-${i}`, 5),
    siguientes: texto(formData, `siguientes-${i}`, 5),
  })).filter((e) => e.compania);
  const nueva = companiaCanonica(texto(formData, "compania-nueva", 80));
  if (nueva) entradas.push({ compania: nueva, primera: texto(formData, "primera-nueva", 5), siguientes: texto(formData, "siguientes-nueva", 5) });
  const { cambios, errores } = leerGrillaGracia(entradas);
  if (errores.length) return { error: errores.join(" ") };
  await guardarGracia(ramo, cambios, ALCANCE_CARTERA);
  await guardarConfig({ graciaHabilitada: formData.get("graciaHabilitada") === "on" }, ALCANCE_CARTERA);
  refrescar();
  ir("general", "gracia-guardada", ramo === TODOS_LOS_RAMOS ? {} : { ramo });
}

export async function guardarTolerancia(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const tolerancia = leerMonto(texto(formData, "tolerancia", 20));
  if (tolerancia === null || tolerancia < 0 || tolerancia > 100_000) return { error: "Escribí un monto de 0 en adelante, como 1 o 10,50." };
  await guardarConfig({ toleranciaMonto: tolerancia }, ALCANCE_CARTERA);
  refrescar();
  ir("general", "tolerancia-guardada");
}

// ---------- Programación ----------

export async function guardarProgramacion(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const r = leerProgramacion({
    frecuencia: texto(formData, "frecuencia", 20),
    horaEjecucion: texto(formData, "horaEjecucion", 5),
    horaEnriquecimiento: texto(formData, "horaEnriquecimiento", 5),
    zonaHoraria: texto(formData, "zonaHoraria", 60),
  });
  if ("error" in r) return r;
  await guardarConfig(r.valores, ALCANCE_CARTERA);
  refrescar();
  ir("programacion", "programacion-guardada");
}

// ---------- Notificaciones ----------

export async function guardarNotificaciones(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const canal = (nombre: "whatsapp" | "email") => {
    const activo = formData.get(`${nombre}Activo`) === "on";
    const { destinatarios, invalidos } = leerDestinatarios(String(formData.get(`${nombre}Destinatarios`) ?? "").slice(0, 2000), nombre);
    return { activo, destinatarios, invalidos };
  };
  const whatsapp = canal("whatsapp");
  const email = canal("email");
  const invalidos = [...whatsapp.invalidos, ...email.invalidos];
  if (invalidos.length) return { error: `No se entienden estos destinatarios: ${invalidos.join(", ")}.` };
  if (whatsapp.activo && !whatsapp.destinatarios.length) return { error: "Para avisar por WhatsApp, cargá al menos un teléfono." };
  if (email.activo && !email.destinatarios.length) return { error: "Para avisar por email, cargá al menos una dirección." };
  const eventos = formData.getAll("eventos").filter((e): e is EventoValidador => EVENTOS_VALIDADOR.some((x) => x.id === e));
  await guardarConfig(
    {
      notificaciones: {
        whatsapp: { activo: whatsapp.activo, destinatarios: whatsapp.destinatarios },
        email: { activo: email.activo, destinatarios: email.destinatarios },
        eventos,
        modo: formData.get("modo") === "evento" ? "evento" : "resumen",
      },
    },
    ALCANCE_CARTERA,
  );
  refrescar();
  ir("notificaciones", "notificaciones-guardadas");
}

/** Manda un aviso de prueba por los canales activos, con lo guardado. Queda en Actividad si salió o no. */
export async function enviarAvisoDePrueba() {
  await requerirSesion();
  const config = leerNotificaciones((await configValidador(ALCANCE_CARTERA)).notificaciones);
  if (!(config.whatsapp.activo && config.whatsapp.destinatarios.length) && !(config.email.activo && config.email.destinatarios.length)) {
    ir("notificaciones", "prueba-sin-canales");
  }
  await notificar([{ asunto: "Validador de pagos: aviso de prueba", texto: "Así te van a llegar los avisos del Validador de pagos." }], config);
  refrescar();
  ir("notificaciones", "prueba-enviada");
}
