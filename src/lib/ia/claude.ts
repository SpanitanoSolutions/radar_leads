import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import { entradaEquivalente, estimarCostoIA, type AdjuntoIA, type ProveedorIA, type SolicitudConversacionIA, type SolicitudIA, type TurnoIA } from "./index";
import { MODELO_SONNET } from "./modelos";

const MODELO_POR_DEFECTO = "claude-haiku-5-5";
const IMAGENES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

function cliente() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("La IA no está disponible.");
  return new Anthropic({ apiKey });
}

function bloqueDeAdjunto(adjunto: AdjuntoIA): Anthropic.ContentBlockParam {
  const data = adjunto.contenido.toString("base64");
  if (adjunto.tipoMime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  const imagen = IMAGENES.find((tipo) => tipo === adjunto.tipoMime);
  if (imagen) return { type: "image", source: { type: "base64", media_type: imagen, data } };
  throw new Error(`La IA no lee archivos ${adjunto.tipoMime}.`);
}

/** Los adjuntos van antes del texto, como recomienda la API. */
function contenido(solicitud: SolicitudIA): string | Anthropic.ContentBlockParam[] {
  if (!solicitud.adjuntos?.length) return solicitud.mensaje;
  return [...solicitud.adjuntos.map(bloqueDeAdjunto), { type: "text", text: solicitud.mensaje }];
}

function textoDe(bloques: { type: string; text?: string }[]): string {
  return bloques.filter((bloque) => bloque.type === "text").map((bloque) => bloque.text ?? "").join("\n").trim();
}

function mensajeDe(turno: TurnoIA): Anthropic.MessageParam {
  if (turno.rol === "asistente") return { role: "assistant", content: turno.contenido as Anthropic.ContentBlockParam[] };
  const resultados: Anthropic.ToolResultBlockParam[] = (turno.resultados ?? []).map((r) => ({
    type: "tool_result",
    tool_use_id: r.id,
    content: r.contenido,
    ...(r.esError ? { is_error: true } : {}),
  }));
  // Los resultados van primero; el texto, si hay, después.
  const contenido: Anthropic.ContentBlockParam[] = [...resultados, ...(turno.texto ? [{ type: "text" as const, text: turno.texto }] : [])];
  return { role: "user", content: contenido };
}

/** Único lugar de la aplicación que usa el SDK de Anthropic. */
export class ProveedorClaude implements ProveedorIA {
  /**
   * Pide la salida como JSON con el esquema (salidas estructuradas). No la
   * valida: `datos` vuelve tal cual o null si no es JSON, y el motor la valida
   * con zod para decidir si reintenta.
   */
  async generarEstructurado(solicitud: SolicitudIA, esquema: ZodType) {
    const modelo = solicitud.modelo || MODELO_POR_DEFECTO;
    const respuesta = await cliente().beta.messages.create({
      model: modelo,
      max_tokens: solicitud.maxTokens ?? 16_000,
      system: solicitud.system,
      messages: [{ role: "user", content: contenido(solicitud) }],
      output_config: { format: betaZodOutputFormat(esquema), ...(solicitud.esfuerzo ? { effort: solicitud.esfuerzo } : {}) },
      // Si Sonnet 5.5 rechaza por error una tarea legítima, la API la reintenta con otro modelo.
      ...(modelo === MODELO_SONNET ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    const rechazada = respuesta.stop_reason === "refusal";
    const texto = rechazada ? "" : textoDe(respuesta.content);
    let datos: unknown = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      // Queda en null: el motor lo cuenta como salida inválida.
    }
    const modeloUsado = respuesta.model || modelo;
    const tokensEntrada = respuesta.usage.input_tokens;
    const tokensSalida = respuesta.usage.output_tokens;
    return {
      texto,
      datos,
      rechazada,
      modelo: modeloUsado,
      tokensEntrada,
      tokensSalida,
      costoUsd: estimarCostoIA(modeloUsado, tokensEntrada, tokensSalida),
    };
  }

  /**
   * Un turno de una conversación con herramientas. El prompt de sistema y las
   * herramientas van en caché: se repiten igual para cada asegurado de una
   * corrida. La IA elige si usa una herramienta (`tool_choice` automático).
   */
  async conversar(solicitud: SolicitudConversacionIA) {
    const modelo = solicitud.modelo || MODELO_POR_DEFECTO;
    const respuesta = await cliente().messages.create({
      model: modelo,
      max_tokens: solicitud.maxTokens ?? 4_000,
      system: [{ type: "text", text: solicitud.system, cache_control: { type: "ephemeral" } }],
      tools: solicitud.herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, input_schema: h.esquema as Anthropic.Tool.InputSchema })),
      messages: solicitud.turnos.map(mensajeDe),
      cache_control: { type: "ephemeral" },
      ...(solicitud.esfuerzo ? { output_config: { effort: solicitud.esfuerzo } } : {}),
    });
    const llamadas = respuesta.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, nombre: b.name, entrada: b.input }));
    const modeloUsado = respuesta.model || modelo;
    const u = respuesta.usage;
    const tokensEntrada = entradaEquivalente({ entrada: u.input_tokens, escrituraCache: u.cache_creation_input_tokens, lecturaCache: u.cache_read_input_tokens });
    return {
      texto: textoDe(respuesta.content),
      llamadas,
      contenido: respuesta.content,
      rechazada: respuesta.stop_reason === "refusal",
      cortada: respuesta.stop_reason === "max_tokens",
      modelo: modeloUsado,
      tokensEntrada,
      tokensSalida: u.output_tokens,
      costoUsd: estimarCostoIA(modeloUsado, tokensEntrada, u.output_tokens),
    };
  }
}
