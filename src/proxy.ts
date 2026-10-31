import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, tokenValido } from "@/lib/sesion";

// Chequeo rápido: sin sesión válida, todo va al login.
// Las páginas y acciones vuelven a verificar con requerirSesion().
// /api/cron queda afuera: se protege con CRON_SECRET (ver src/lib/cron.ts).
// /api/v1 también: cada ruta pide la clave de la API (src/agentes/cobranza/api.ts).
// /privacidad y /terminos también: son públicas porque Google las pide para autorizar Gmail y Calendar.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (await tokenValido(token)) return NextResponse.next();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|privacidad|terminos|api/cron/|api/v1/|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
