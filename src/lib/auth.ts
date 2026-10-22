import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION, tokenValido } from "./sesion";

/** Verifica la sesión dentro de páginas y Server Actions. */
export async function requerirSesion(): Promise<void> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!(await tokenValido(token))) redirect("/login");
}
