import Anthropic from "@anthropic-ai/sdk";
import {
  consultaTelefono,
  INSTRUCCIONES,
  interpretarRegistro,
  type EmpresaABuscar,
  type TelefonoEncontrado,
} from "./telefono";

export const MODELO = "claude-haiku-5-5";

/** Donde Claude deja el resultado, con un esquema que la API hace cumplir. */
const REGISTRAR: Anthropic.Tool = {
  name: "registrar_telefono",
  description:
    "Registra el teléfono de contacto publicado por la empresa y la página donde figura. " +
    'Si no encontraste uno confiable, usá tipo "no_encontrado" con telefono y fuente_url vacíos.',
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      telefono: { type: "string", description: 'Tal como figura, p. ej. "(0223) 495-1234". Vacío si no hay.' },
      tipo: { type: "string", enum: ["comercial", "general", "no_encontrado"] },
      fuente_url: { type: "string", description: "URL de la página donde la empresa publica el número." },
    },
    required: ["telefono", "tipo", "fuente_url"],
    additionalProperties: false,
  },
};

/** Las búsquedas web se hacen como si fueran desde la localidad de la empresa. */
function busquedaWeb(localidad: string): Anthropic.WebSearchTool20250305 {
  return {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
    user_location: {
      type: "approximate",
      city: localidad,
      region: "Buenos Aires",
      country: "AR",
      timezone: "America/Argentina/Buenos_Aires",
    },
  };
}

/** Si la búsqueda se pausa o Claude no registra el resultado, se sigue hasta acá. */
const VUELTAS_MAXIMAS = 4;

/**
 * Busca en la web el teléfono que publica la empresa. Devuelve null si no
 * hay uno confiable; los errores de la API se propagan.
 */
export async function buscarTelefono(
  cliente: Pick<Anthropic, "messages">,
  empresa: EmpresaABuscar,
): Promise<TelefonoEncontrado | null> {
  const herramientas = [busquedaWeb(empresa.localidad), REGISTRAR];
  const mensajes: Anthropic.MessageParam[] = [{ role: "user", content: consultaTelefono(empresa) }];
  let pedidoElRegistro = false;

  for (let vuelta = 0; vuelta < VUELTAS_MAXIMAS; vuelta++) {
    const respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 8000,
      system: INSTRUCCIONES,
      output_config: { effort: "medium" },
      tools: herramientas,
      messages: mensajes,
    });

    const registro = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === REGISTRAR.name,
    );
    if (registro) return interpretarRegistro(registro.input);

    // La búsqueda tardó y la API la pausó: se reenvía tal cual para que siga.
    if (respuesta.stop_reason === "pause_turn") {
      mensajes.push({ role: "assistant", content: respuesta.content });
      continue;
    }
    // Terminó sin registrar el resultado: se le pide una vez más.
    if (respuesta.stop_reason === "end_turn" && !pedidoElRegistro) {
      pedidoElRegistro = true;
      mensajes.push({ role: "assistant", content: respuesta.content });
      mensajes.push({ role: "user", content: "Registrá el resultado con la herramienta registrar_telefono." });
      continue;
    }
    return null; // refusal, max_tokens o sin registro
  }
  return null;
}
