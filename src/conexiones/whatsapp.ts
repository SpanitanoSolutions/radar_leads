import "server-only";
import { guardarConexion, leerConexion } from "./estado";
import type { ResultadoEnvio } from "./tipos";

/**
 * WhatsApp Business.
 *
 * Hoy es SIMULADO: guarda el estado de la conexión en la tabla conexiones y
 * no manda nada afuera. Lo va a reemplazar la WhatsApp Business Cloud API de
 * Meta (alta con Embedded Signup; envío con POST
 * https://graph.facebook.com/v21.0/{phone-number-id}/messages y plantillas
 * aprobadas para escribir primero), con el token en WHATSAPP_TOKEN y el
 * phone-number-id en WHATSAPP_NUMERO_ID.
 */
export type PlantillaWhatsApp = { nombre: string; estado: "En revisión" | "Aprobada" | "Rechazada" };

export type EstadoWhatsApp =
  | { paso: "sin_conectar" }
  | { paso: "codigo"; numero: string }
  | { paso: "conectado"; numero: string; plantillas: PlantillaWhatsApp[] };

export interface ConexionWhatsApp {
  estado(): Promise<EstadoWhatsApp>;
  /** Pasos 1 y 2: el número elegido y la cuenta de Meta; Meta manda un código por SMS. */
  pedirCodigo(numero: string): Promise<void>;
  /** Paso 3: el código que llegó por SMS. */
  verificar(codigo: string): Promise<{ ok: boolean; error?: string }>;
  desconectar(): Promise<void>;
  enviar(mensaje: { para: string; texto: string }): Promise<ResultadoEnvio>;
}

export const PLANTILLAS_WHATSAPP: PlantillaWhatsApp[] = [
  { nombre: "Aviso de vencimiento", estado: "En revisión" },
  { nombre: "Pedido de datos para cotizar", estado: "En revisión" },
  { nombre: "Envío de póliza", estado: "En revisión" },
];

export const whatsappSimulado: ConexionWhatsApp = {
  async estado() {
    const fila = await leerConexion("whatsapp");
    const numero = String(fila?.datos.numero ?? "");
    if (fila?.estado === "conectado") return { paso: "conectado", numero, plantillas: PLANTILLAS_WHATSAPP };
    if (fila?.estado === "en_proceso") return { paso: "codigo", numero };
    return { paso: "sin_conectar" };
  },
  async pedirCodigo(numero) {
    await guardarConexion("whatsapp", "en_proceso", { numero });
  },
  async verificar(codigo) {
    if (!/^\d{6}$/.test(codigo.trim())) return { ok: false, error: "El código tiene 6 números." };
    return { ok: false, error: "La integración real con WhatsApp Business todavía no está conectada; no pudimos validar el código." };
  },
  async desconectar() {
    await guardarConexion("whatsapp", "sin_conectar");
  },
  async enviar() {
    return { ok: false, error: "WhatsApp Business no está conectado a un servicio de envío real. El mensaje sigue pendiente." };
  },
};

export const whatsapp: ConexionWhatsApp = whatsappSimulado;
