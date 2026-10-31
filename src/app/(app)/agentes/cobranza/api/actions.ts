"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClaveApi, revocarClaveApi } from "@/agentes/cobranza/api";
import { requerirSesion } from "@/lib/auth";

/** "Generar API key": la clave vuelve una sola vez, a la pantalla que la pidió. */
export async function generarClave(_previo: { clave: string } | null, formData: FormData): Promise<{ clave: string } | null> {
  await requerirSesion();
  const clave = await crearClaveApi(String(formData.get("nombre") ?? ""));
  revalidatePath("/agentes/cobranza/api");
  return { clave };
}

export async function revocarClave(formData: FormData) {
  await requerirSesion();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) await revocarClaveApi(id);
  revalidatePath("/agentes/cobranza/api");
  redirect("/agentes/cobranza/api?aviso=clave-revocada#autenticacion");
}
