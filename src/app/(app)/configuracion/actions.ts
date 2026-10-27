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
import { portal } from "@/conexiones/portal";
import { whatsapp } from "@/conexiones/whatsapp";
import { requerirSesion } from "@/lib/auth";
import { AJUSTES_POR_DEFECTO } from "@/lib/datos";

const texto = (formData: FormData, campo: string, max = 120) => String(formData.get(campo) ?? "").trim().slice(0, max);

function refrescar() {
  // El menú muestra cuántas conexiones faltan.
  revalidatePath("/", "layout");
}

export type EstadoFormulario = { error?: string };

// ---------- WhatsApp ----------

export async function whatsappContinuar(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  const numero = texto(formData, "numero", 30);
  if (numero.replace(/\D/g, "").length < 10) return { error: "Escribí el número completo, con característica (por ejemplo 223 555-1234)." };
  await whatsapp.pedirCodigo(numero);
  refrescar();
  return {};
}

export async function whatsappVerificar(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  const r = await whatsapp.verificar(texto(formData, "codigo", 10));
  if (!r.ok) return { error: r.error };
  refrescar();
  return {};
}

export async function whatsappDesconectar() {
  await requerirSesion();
  await whatsapp.desconectar();
  refrescar();
  redirect("/configuracion?aviso=desconectada");
}

// ---------- Las demás conexiones (simuladas) ----------

export async function conectar(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requerirSesion();
  const c = CONEXIONES.find((x) => x.clave === formData.get("clave"));
  if (!c || c.tipo === "whatsapp") return { error: "Conexión desconocida." };
  const falta = (dato: string) => ({ error: `Completá ${dato}.` });
  switch (c.tipo) {
    case "email": {
      const direccion = texto(formData, "direccion");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(direccion)) return falta("una dirección de email válida");
      await email.conectar(direccion, texto(formData, "proveedor", 40) || "Gmail");
      break;
    }
    case "portal": {
      if (c.grupo === "companias" && formData.has("emailCompania")) {
        const contacto = texto(formData, "emailCompania");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto)) return falta("el email de la compañía");
        await portal.porEmail(c.compania!, contacto);
      } else {
        const usuario = texto(formData, "usuario", 60);
        if (!usuario) return falta("tu usuario o código de productor");
        await portal.conectar(c.compania!, usuario);
      }
      break;
    }
    case "mercadopago":
      await mercadoPago.conectar(texto(formData, "cuenta") || "Cuenta del productor");
      break;
    case "banco": {
      const nombre = texto(formData, "banco", 60);
      const alias = texto(formData, "alias", 60);
      if (!nombre || !alias) return falta("el banco y el alias de tu cuenta");
      await banco.configurar({ banco: nombre, alias });
      break;
    }
    case "google_calendar":
      await calendario.conectar(texto(formData, "calendario", 60) || "principal");
      break;
  }
  refrescar();
  redirect("/configuracion?aviso=conectada");
}

export async function desconectar(formData: FormData) {
  await requerirSesion();
  const c = CONEXIONES.find((x) => x.clave === formData.get("clave"));
  if (!c) throw new Error("Conexión desconocida");
  // Las compañías sin portal vuelven a "por email" sin contacto.
  await guardarConexion(c.clave, c.compania && c.tipo === "portal" && formData.get("porEmail") === "1" ? "por_email" : "sin_conectar");
  refrescar();
  redirect("/configuracion?aviso=desconectada");
}

// ---------- Mi cuenta ----------

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
  const datos = {
    productorNombre: productores[0].nombre,
    productorMatricula: productores[0].matricula,
    productores,
    productorOrganizacion: texto(formData, "organizacion") || null,
    productorTelefono: texto(formData, "telefono", 40) || null,
    productorEmail: correo || null,
    actualizadoEl: new Date(),
  };
  await db
    .insert(schema.ajustes)
    .values({ id: 1, ...AJUSTES_POR_DEFECTO, ...datos })
    .onConflictDoUpdate({ target: schema.ajustes.id, set: datos });
  refrescar();
  redirect("/configuracion?tab=cuenta&aviso=guardado");
}
