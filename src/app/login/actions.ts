"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { claveCorrecta, COOKIE_SESION, crearToken, DURACION_SESION_MS } from "@/lib/sesion";

export type EstadoLogin = { error?: string };

export async function iniciarSesion(
  _prev: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const clave = String(formData.get("clave") ?? "");
  if (!clave || !(await claveCorrecta(clave))) {
    // Pequeña demora para que adivinar sea más lento.
    await new Promise((r) => setTimeout(r, 600));
    return { error: "La contraseña no es correcta." };
  }
  (await cookies()).set(COOKIE_SESION, await crearToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION_MS / 1000,
  });
  redirect("/");
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE_SESION);
  redirect("/login");
}
