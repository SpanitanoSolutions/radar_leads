import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, tokenValido } from "@/lib/sesion";

// Chequeo rápido: sin sesión válida, todo va al login.
// Las páginas y acciones vuelven a verificar con requerirSesion().
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (await tokenValido(token)) return NextResponse.next();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
