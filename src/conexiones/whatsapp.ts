import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ResultadoEnvio } from "./tipos";

/**
 * WhatsApp Business.
 *
 * Hoy es SIMULADO: guarda el estado de la conexión en la tabla conexiones y
 * no manda nada afuera. Lo va a reemplazar la WhatsApp Business Cloud API de
 * Meta (POST https://graph.facebook.com/v21.0/{phone-number-id}/messages con
 * plantillas aprobadas para escribir primero), con el token en la variable
 * de entorno WHATSAPP_TOKEN y el phone-number-id en WHATSAPP_NUMERO_ID.
 */
export type EstadoWhatsApp =
  | { paso: "sin_conectar" }
  | { paso: "codigo"; numero: string }
  | { paso: "conectado"; numero: string; plantillas: PlantillaWhatsApp[] };

export type PlantillaWhatsApp = { nombre: string; estado: "En revisión" | "Aprobada" | "Rechazada" };

export interface ConexionWhatsApp {
  estado(): Promise<EstadoWhatsApp>;
  /** Paso 2: se conectó la cuenta de Meta y se pidió el código por SMS. */
  pedirCodigo(numero: string): Promise<void>;
  /** Paso 3: el código que llegó por SMS. */
  verificar(codigo: string): Promise<{ ok: boolean; error?: string }>;
  desconectar(): Promise<void>;
  enviar(mensaje: { para: string; texto: string }): Promise<ResultadoEnvio>;
}

const PLANTILLAS: PlantillaWhatsApp[] = [
  { nombre: "Aviso de vencimiento", estado: "En revisión" },
  { nombre: "Pedido de datos para cotizar", estado: "En revisión" },
  { nombre: "Envío de póliza", estado: "En revisión" },
];

async function guardar(estado: "conectado" | "sin_conectar" | "en_proceso", datos: Record<string, string>) {
  const fila = { clave: "whatsapp", tipo: "whatsapp", estado, requerida: true, datos, actualizadoEl: new Date() };
  await db.insert(schema.conexiones).values(fila).onConflictDoUpdate({ target: schema.conexiones.clave, set: fila });
}

export const whatsappSimulado: ConexionWhatsApp = {
  async estado() {
    const [fila] = await db.select().from(schema.conexiones).where(eq(schema.conexiones.clave, "whatsapp"));
    const numero = String(fila?.datos.numero ?? "");
    if (fila?.estado === "conectado") return { paso: "conectado", numero, plantillas: PLANTILLAS };
    if (fila?.estado === "en_proceso") return { paso: "codigo", numero };
    return { paso: "sin_conectar" };
  },
  async pedirCodigo(numero) {
    await guardar("en_proceso", { numero });
  },
  async verificar(codigo) {
    if (!/^\d{6}$/.test(codigo.trim())) return { ok: false, error: "El código tiene 6 números." };
    const actual = await this.estado();
    const numero = actual.paso === "sin_conectar" ? "" : actual.numero;
    await guardar("conectado", { numero, verificado: new Date().toISOString() });
    return { ok: true };
  },
  async desconectar() {
    await guardar("sin_conectar", {});
  },
  async enviar() {
    // Simulado: no sale nada. Queda registrado en la tabla mensajes como enviado.
    return { ok: true, id: `wa-simulado-${Date.now()}` };
  },
};

export const whatsapp: ConexionWhatsApp = whatsappSimulado;
