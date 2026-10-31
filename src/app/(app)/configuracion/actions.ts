"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { banco } from "@/conexiones/banco";
import { CONEXIONES } from "@/conexiones/catalogo";
import { email } from "@/conexiones/email";
import { guardarConexion } from "@/conexiones/estado";
import { calendario } from "@/conexiones/google-calendar";
import { mercadoPago } from "@/conexiones/mercadopago";
import { whatsapp } from "@/conexiones/whatsapp";
import { requerirSesion } from "@/lib/auth";
import { AJUSTES_POR_DEFECTO, obtenerCuenta } from "@/lib/datos";
import { provinciaValida } from "@/lib/provincias";

const texto = (formData: FormData, campo: string, max = 120) => String(formData.get(campo) ?? "").trim().slice(0, max);

const MAX_LOGO_BYTES = 512 * 1024;

function tipoLogo(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

function refrescar() {
  // El menú muestra cuántas conexiones faltan.
  revalidatePath("/", "layout");
}

export type EstadoFormulario = { error?: string };

// ---------- WhatsApp ----------

export async function whatsappContinuar(_previo: EstadoFormulario, _formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  try {
    await whatsapp.conectar();
    refrescar();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo validar WhatsApp con Meta." };
  }
}

export async function whatsappDesconectar() {
  await requerirSesion();
  await whatsapp.desconectar();
  refrescar();
  redirect("/configuracion?aviso=desconectada");
}

// ---------- Gmail ----------

export type EstadoPrueba = { error?: string; ok?: string };

/** Un correo a la misma casilla conectada: prueba la autorización y el envío sin escribirle a nadie más. */
export async function gmailProbar(_previo: EstadoPrueba, _formData: FormData): Promise<EstadoPrueba> {
  await requerirSesion();
  const { conectado, direccion } = await email.estado();
  if (!conectado || !direccion) return { error: "Gmail no está conectado." };
  const cuenta = await obtenerCuenta();
  const r = await email.enviar({
    para: direccion,
    remitente: cuenta.nombre,
    asunto: "Prueba de UNIQO",
    texto: `Este correo lo mandó UNIQO para probar la conexión con Gmail.\n\nSi lo estás leyendo, los agentes ya pueden mandar correos desde ${direccion}.`,
  });
  // Si Google revocó la autorización, la conexión quedó marcada: la pantalla tiene que mostrarlo.
  refrescar();
  return r.ok ? { ok: `Listo: le mandamos un correo de prueba a ${direccion}. Fijate en la bandeja de entrada.` } : { error: r.error };
}

// ---------- Acciones de conexiones autorizadas ----------

export async function conectar(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  const c = CONEXIONES.find((x) => x.clave === formData.get("clave"));
  if (!c || c.tipo === "whatsapp") return { error: "Conexion desconocida." };
  if (c.tipo === "banco") return { error: "Falta configurar un proveedor bancario real; escribir el banco y su alias no conecta la cuenta." };
  return { error: "Usa el boton de autorizacion del proveedor; guardar un email, usuario o alias no conecta la cuenta." };
}

export async function desconectar(formData: FormData) {
  await requerirSesion();
  const c = CONEXIONES.find((x) => x.clave === formData.get("clave"));
  if (!c) throw new Error("Conexion desconocida");
  if (c.tipo === "email") await email.desconectar();
  else if (c.tipo === "mercadopago") await mercadoPago.desconectar();
  else if (c.tipo === "google_calendar") await calendario.desconectar();
  else if (c.tipo === "whatsapp") await whatsapp.desconectar();
  else if (c.tipo === "banco") await banco.desconectar();
  else await guardarConexion(c.clave, "sin_conectar");
  refrescar();
  redirect("/configuracion?aviso=desconectada");
}

// Mi cuenta y Mi equipo guardan en la misma fila, cada una solo sus columnas:
// guardar una pestaña no pisa lo que se cargó en la otra.
async function guardarAjustes(cambios: Partial<Omit<typeof schema.ajustes.$inferInsert, "id">>) {
  await db
    .insert(schema.ajustes)
    .values({ id: 1, ...AJUSTES_POR_DEFECTO, ...cambios })
    .onConflictDoUpdate({ target: schema.ajustes.id, set: cambios });
  refrescar();
}

/** Mi cuenta: los productores con sus matrículas y los datos de contacto. */
export async function guardarCuenta(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  const correo = texto(formData, "email");
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: "El email no parece válido." };
  const nombres = [formData.get("nombre"), ...formData.getAll("productoresNombre")];
  const matriculas = [formData.get("matricula"), ...formData.getAll("productoresMatricula")];
  if (Math.max(nombres.length, matriculas.length) > 20) return { error: "Podés cargar hasta 20 productores." };
  const productores: { nombre: string; matricula: string }[] = [];
  for (let i = 0; i < Math.max(nombres.length, matriculas.length); i++) {
    const nombre = String(nombres[i] ?? "").trim().slice(0, 120);
    const matricula = String(matriculas[i] ?? "").trim().slice(0, 30);
    if (!nombre && !matricula) continue;
    if (!nombre || !matricula) return { error: "Completá nombre y matrícula para cada productor que agregues." };
    productores.push({ nombre, matricula });
  }
  if (!productores.length) return { error: "Agregá al menos un productor con su nombre y matrícula." };
  const matriculasUnicas = new Set(productores.map((p) => p.matricula.toLocaleUpperCase("es-AR").replace(/[\s.-]/g, "")));
  if (matriculasUnicas.size !== productores.length) return { error: "Cada productor debe tener una matrícula distinta." };
  await guardarAjustes({
    productorNombre: productores[0].nombre,
    productorMatricula: productores[0].matricula,
    productores,
    productorTelefono: texto(formData, "telefono", 40) || null,
    productorEmail: correo || null,
    provincia: provinciaValida(texto(formData, "provincia")),
    actualizadoEl: new Date(),
  });
  redirect("/configuracion?tab=cuenta&aviso=guardado");
}

/** Mi equipo: el nombre y el logo de la asociación aseguradora. */
export async function guardarEquipo(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  const archivoLogo = formData.get("logoEmpresa");
  let logoEmpresa: string | undefined;
  if (archivoLogo instanceof File && archivoLogo.size > 0) {
    if (archivoLogo.size > MAX_LOGO_BYTES) return { error: "El logo no puede superar los 512 KB." };
    const bytes = new Uint8Array(await archivoLogo.arrayBuffer());
    const mime = tipoLogo(bytes);
    if (!mime) return { error: "Usá un logo en formato PNG, JPG o WebP." };
    logoEmpresa = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  const quitarLogo = formData.get("quitarLogo") === "on";
  await guardarAjustes({
    productorOrganizacion: texto(formData, "organizacion") || null,
    ...(logoEmpresa !== undefined ? { productorLogo: logoEmpresa } : quitarLogo ? { productorLogo: null } : {}),
    actualizadoEl: new Date(),
  });
  redirect("/configuracion?tab=equipo&aviso=guardado");
}
