import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ConfiguracionCobranza } from "@/lib/cobranza/tipos";
import { enviarPorCanal, estadoCanales } from "./canales";

/**
 * Le avisa al productor (escalados, promesas, resumen) por el canal de
 * Notificaciones, a los destinatarios cargados o, si no hay, al correo o
 * teléfono de Información (o de Mi cuenta). Solo por una conexión real: sin
 * conexión no se simula. Devuelve el error, o null si salió o no había a quién.
 */
export async function avisarAlProductor(config: ConfiguracionCobranza, asunto: string, lineas: string[]): Promise<string | null> {
  const n = config.notificaciones;
  let destinatarios = n.destinatarios;
  if (!destinatarios.length) {
    const [a] = await db.select({ email: schema.ajustes.productorEmail, telefono: schema.ajustes.productorTelefono }).from(schema.ajustes).where(eq(schema.ajustes.id, 1));
    const propio = n.canal === "email" ? config.firmanteEmail || a?.email : config.firmanteTelefono || a?.telefono;
    destinatarios = propio ? [propio] : [];
  }
  if (!destinatarios.length) return null;
  const estado = await estadoCanales();
  if (!estado[n.canal].conectado) return `No te pude avisar: ${n.canal === "email" ? "Gmail" : "WhatsApp"} no está conectado.`;
  const texto = [...lineas, "", "Detalle en UNIQO → Agentes → Cobranza."].join("\n");
  for (const para of destinatarios) {
    const r = await enviarPorCanal(n.canal, { para, asunto, texto }, { modoPrueba: false, estado });
    if (!r.ok) return `No te pude avisar a ${para}: ${r.error}`;
  }
  return null;
}
