import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { estimarCostoIA, type ProveedorIA, type SolicitudIA } from "./index";

const MODELO_POR_DEFECTO = "claude-haiku-5-5";

/** Único lugar de la aplicación que usa el SDK de Anthropic. */
export class ProveedorClaude implements ProveedorIA {
  async generar(solicitud: SolicitudIA) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("La IA no está disponible.");
    const modelo = process.env.ANTHROPIC_MODEL_COTIZACION || MODELO_POR_DEFECTO;
    const cliente = new Anthropic({ apiKey });
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: solicitud.maxTokens ?? 1200,
      system: solicitud.system,
      messages: [{ role: "user", content: solicitud.mensaje }],
    });
    const texto = respuesta.content.filter((bloque) => bloque.type === "text").map((bloque) => bloque.text).join("\n").trim();
    const tokensEntrada = respuesta.usage.input_tokens;
    const tokensSalida = respuesta.usage.output_tokens;
    return { texto, modelo, tokensEntrada, tokensSalida, costoUsd: estimarCostoIA(modelo, tokensEntrada, tokensSalida) };
  }
}
