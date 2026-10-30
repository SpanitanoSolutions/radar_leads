import { cookies } from "next/headers";
import { guardarCredenciales, leerCredenciales } from "@/conexiones/secretos";
import { COOKIE_SESION, tokenValido } from "@/lib/sesion";

type Proveedor = "gmail" | "google-calendar" | "mercadopago";

// Un permiso por conexión, y ninguno restringido: leer la casilla
// (gmail.readonly) obliga a una auditoría de Google todos los años.
const PERMISO_GOOGLE: Record<Exclude<Proveedor, "mercadopago">, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.send",
  "google-calendar": "https://www.googleapis.com/auth/calendar.events",
};

const COOKIE_ESTADO = "uniqo_oauth_estado";
const DURACION_ESTADO = 10 * 60;

function urlApp(origen: string): string {
  const raiz = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : origen);
  return raiz.replace(/\/$/, "");
}

function configuracion(proveedor: Proveedor, origen: string) {
  const google = proveedor !== "mercadopago";
  const clientId = process.env[google ? "GOOGLE_CLIENT_ID" : "MERCADOPAGO_CLIENT_ID"];
  const clientSecret = process.env[google ? "GOOGLE_CLIENT_SECRET" : "MERCADOPAGO_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error(`Faltan credenciales OAuth de ${google ? "Google" : "Mercado Pago"}.`);
  const callback = `${urlApp(origen)}/api/conexiones/oauth/${proveedor}`;
  return { google, clientId, clientSecret, callback };
}

function volver(aviso: string, origen: string) {
  return Response.redirect(new URL(`/configuracion?aviso=${aviso}`, urlApp(origen)));
}

export async function GET(request: Request, context: { params: Promise<{ proveedor: string }> }) {
  const { proveedor: valor } = await context.params;
  if (valor !== "gmail" && valor !== "google-calendar" && valor !== "mercadopago") return new Response("Proveedor desconocido", { status: 404 });
  const proveedor: Proveedor = valor;
  const jar = await cookies();
  const sesion = jar.get(COOKIE_SESION)?.value;
  if (!(await tokenValido(sesion))) return Response.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");
  if (!codigo) {
    if (url.searchParams.has("error")) return volver("oauth_cancelado", url.origin);
    let cfg: ReturnType<typeof configuracion>;
    try {
      cfg = configuracion(proveedor, url.origin);
    } catch {
      return volver("integracion_configurar", url.origin);
    }
    const state = crypto.randomUUID();
    jar.set(COOKIE_ESTADO, `${proveedor}:${state}`, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: `/api/conexiones/oauth/${proveedor}`,
      maxAge: DURACION_ESTADO,
    });
    const autorizacion = new URL(cfg.google ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://auth.mercadopago.com/authorization");
    autorizacion.searchParams.set("client_id", cfg.clientId);
    autorizacion.searchParams.set("response_type", "code");
    autorizacion.searchParams.set("redirect_uri", cfg.callback);
    autorizacion.searchParams.set("state", state);
    if (cfg.google) {
      autorizacion.searchParams.set("access_type", "offline");
      autorizacion.searchParams.set("prompt", "consent");
      autorizacion.searchParams.set("include_granted_scopes", "true");
      autorizacion.searchParams.set("scope", `openid email ${PERMISO_GOOGLE[proveedor === "gmail" ? "gmail" : "google-calendar"]}`);
    } else {
      autorizacion.searchParams.set("platform_id", "mp");
    }
    return Response.redirect(autorizacion);
  }

  const esperado = jar.get(COOKIE_ESTADO)?.value;
  const recibido = url.searchParams.get("state");
  jar.set(COOKIE_ESTADO, "", { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: `/api/conexiones/oauth/${proveedor}`, maxAge: 0 });
  if (!esperado || esperado !== `${proveedor}:${recibido}`) return volver("oauth_estado_invalido", url.origin);

  try {
    const cfg = configuracion(proveedor, url.origin);
    const parametros = {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: codigo,
      redirect_uri: cfg.callback,
      grant_type: "authorization_code",
    };
    const respuesta = await fetch(cfg.google ? "https://oauth2.googleapis.com/token" : "https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": cfg.google ? "application/x-www-form-urlencoded" : "application/json" },
      body: cfg.google ? new URLSearchParams(parametros) : JSON.stringify(parametros),
      signal: AbortSignal.timeout(20_000),
    });
    const tokens = (await respuesta.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      user_id?: number;
    };
    if (!respuesta.ok || !tokens.access_token) return volver("oauth_fallo", url.origin);
    // Google deja destildar cada permiso en la pantalla de consentimiento.
    if (proveedor !== "mercadopago" && !tokens.scope?.split(" ").includes(PERMISO_GOOGLE[proveedor])) {
      return volver("oauth_sin_permiso", url.origin);
    }

    let direccion = "";
    let cuenta = "";
    if (cfg.google) {
      const identidad = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const perfil = (await identidad.json().catch(() => ({}))) as { email?: string };
      direccion = perfil.email ?? "";
    } else {
      const identidad = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const perfil = (await identidad.json().catch(() => ({}))) as { id?: number; nickname?: string; email?: string };
      cuenta = perfil.nickname || String(perfil.id ?? tokens.user_id ?? "Mercado Pago");
    }

    const clave = proveedor === "gmail" ? "email" : proveedor === "google-calendar" ? "google_calendar" : "mercadopago";
    const anteriores = await leerCredenciales(clave).catch(() => null);
    await guardarCredenciales(
      clave,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? anteriores?.refreshToken,
        venceEl: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      },
      cfg.google
        ? proveedor === "gmail"
          ? { direccion, proveedor: "Gmail" }
          : { direccion, calendario: "primary" }
        : { cuenta, usuarioId: tokens.user_id ?? null },
    );
    return volver("conectada", url.origin);
  } catch {
    return volver("oauth_fallo", url.origin);
  }
}

