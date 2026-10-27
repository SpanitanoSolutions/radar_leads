import { resumenEnHtml, resumenEnTexto, tituloResumen, type Resumen } from "./armar";

// Por dónde se envía el resumen diario. Hoy hay un solo canal (email con
// Resend). Para sumar WhatsApp alcanza con otro objeto que cumpla CanalResumen
// (por ejemplo con la API de WhatsApp Business) y agregarlo a canalesDisponibles().

export interface CanalResumen {
  nombre: string;
  enviar(resumen: Resumen, baseUrl: string): Promise<void>;
}

type Fetch = typeof fetch;

export function canalEmail({
  apiKey,
  destinos,
  remitente,
  fetch: pedir = fetch,
}: {
  apiKey: string;
  destinos: string[];
  remitente: string;
  fetch?: Fetch;
}): CanalResumen {
  return {
    nombre: `email a ${destinos.join(", ")}`,
    async enviar(resumen, baseUrl) {
      const respuesta = await pedir("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: remitente,
          to: destinos,
          subject: tituloResumen(resumen),
          html: resumenEnHtml(resumen, baseUrl),
          text: resumenEnTexto(resumen, baseUrl),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!respuesta.ok) throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
    },
  };
}

/** Remitente por defecto de Resend: solo entrega al dueño de la cuenta hasta verificar un dominio. */
export const REMITENTE_POR_DEFECTO = "UNIQO <onboarding@resend.dev>";

/** Canales con su configuración completa en el entorno. */
export function canalesDisponibles(env: Record<string, string | undefined> = process.env): CanalResumen[] {
  const canales: CanalResumen[] = [];
  const destinos = (env.RESUMEN_EMAIL_DESTINO ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (env.RESEND_API_KEY && destinos.length) {
    canales.push(
      canalEmail({ apiKey: env.RESEND_API_KEY, destinos, remitente: env.RESUMEN_EMAIL_REMITENTE || REMITENTE_POR_DEFECTO }),
    );
  }
  // WhatsApp: pendiente (ver comentario arriba).
  return canales;
}

/** URL pública de la app para los enlaces del email. */
export function urlDeLaApp(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "";
}
