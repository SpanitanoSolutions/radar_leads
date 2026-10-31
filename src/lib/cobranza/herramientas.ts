import { z } from "zod";
import type { HerramientaIA } from "@/lib/ia";

// Las herramientas del Agente de Cobranza: lo que ve la IA (nombre,
// descripción y JSON Schema) y cómo se valida lo que pide. La ejecución, con
// las reglas duras, está en src/agentes/cobranza/motor.ts.

const casoIds = { type: "array", items: { type: "integer" }, minItems: 1, description: "Los casoId de los recibos a los que se refiere (de cobranza_obtener_polizas)." };

export const TIPOS_RESPUESTA = ["promesa_pago", "fecha_programada", "ya_pago", "respondio", "rechazo", "baja"] as const;
export type TipoRespuesta = (typeof TIPOS_RESPUESTA)[number];

export const HERRAMIENTAS_COBRANZA: HerramientaIA[] = [
  {
    nombre: "cobranza_obtener_polizas",
    descripcion:
      "Devuelve los recibos abiertos del asegurado que estás atendiendo: compañía, póliza, recibo, monto, vencimiento, diasParaVencer (negativo = vencido), currentTier {id, label}, estado, intentos, si hoy se le puede escribir, canales disponibles y lo último que pasó.",
    esquema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    nombre: "enviar_whatsapp",
    descripcion:
      "Manda un WhatsApp al asegurado sobre uno o varios recibos. Un solo mensaje, completo y firmado. El sistema controla el horario, el máximo de intentos y el modo prueba; si devuelve un error, no insistas por este canal.",
    esquema: {
      type: "object",
      properties: { casoIds, mensaje: { type: "string", description: "El texto completo del mensaje, firmado. Hasta 1000 caracteres." } },
      required: ["casoIds", "mensaje"],
      additionalProperties: false,
    },
  },
  {
    nombre: "enviar_email",
    descripcion: "Manda un correo al asegurado sobre uno o varios recibos. Las mismas reglas que enviar_whatsapp.",
    esquema: {
      type: "object",
      properties: {
        casoIds,
        asunto: { type: "string", description: "Asunto claro, con la compañía y la póliza. Hasta 150 caracteres." },
        mensaje: { type: "string", description: "El cuerpo completo del correo, firmado. Hasta 3000 caracteres." },
      },
      required: ["casoIds", "asunto", "mensaje"],
      additionalProperties: false,
    },
  },
  {
    nombre: "llamar",
    descripcion:
      "Llama al asegurado con un guion breve. Si no hay llamadas automáticas, la llamada queda como tarea para el productor con este guion.",
    esquema: {
      type: "object",
      properties: { casoIds, guion: { type: "string", description: "Qué decir: presentarse, el recibo, y preguntar cuándo puede pagar. Hasta 1500 caracteres." } },
      required: ["casoIds", "guion"],
      additionalProperties: false,
    },
  },
  {
    nombre: "cobranza_registrar_respuesta",
    descripcion:
      'Registra lo que respondió el asegurado. "promesa_pago" o "fecha_programada": promete pagar (fecha AAAA-MM-DD). "ya_pago": dice que ya pagó (lo confirma el Validador de pagos). "respondio": tiene dudas o pide información. "rechazo": se niega a pagar. "baja": pide no recibir más mensajes.',
    esquema: {
      type: "object",
      properties: {
        casoIds,
        tipoRespuesta: { type: "string", enum: [...TIPOS_RESPUESTA] },
        fecha: { type: "string", description: "Para promesa_pago y fecha_programada: el día en que dice que paga, AAAA-MM-DD." },
        notas: { type: "string", description: "Qué dijo, en una o dos oraciones." },
      },
      required: ["casoIds", "tipoRespuesta", "notas"],
      additionalProperties: false,
    },
  },
  {
    nombre: "escalar_al_productor",
    descripcion: "Le pasa el caso al productor para que lo resuelva él (rechazo, consulta que no podés contestar, problema). El agente deja de escribirle.",
    esquema: {
      type: "object",
      properties: { casoIds, motivo: { type: "string", description: "Por qué se lo pasás, en una oración." } },
      required: ["casoIds", "motivo"],
      additionalProperties: false,
    },
  },
  {
    nombre: "terminar",
    descripcion: "Terminá con este asegurado. Llamala siempre al final, una vez.",
    esquema: {
      type: "object",
      properties: { resumen: { type: "string", description: "Lo que hiciste, en una línea." } },
      required: ["resumen"],
      additionalProperties: false,
    },
  },
];

const ids = z.array(z.number().int().positive()).min(1).max(20);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD");

export const ENTRADAS = {
  cobranza_obtener_polizas: z.object({}).passthrough(),
  enviar_whatsapp: z.object({ casoIds: ids, mensaje: z.string().trim().min(10).max(1000) }),
  enviar_email: z.object({ casoIds: ids, asunto: z.string().trim().min(3).max(150), mensaje: z.string().trim().min(10).max(3000) }),
  llamar: z.object({ casoIds: ids, guion: z.string().trim().min(10).max(1500) }),
  cobranza_registrar_respuesta: z.object({ casoIds: ids, tipoRespuesta: z.enum(TIPOS_RESPUESTA), fecha: fecha.optional(), notas: z.string().trim().max(1000) }),
  escalar_al_productor: z.object({ casoIds: ids, motivo: z.string().trim().min(3).max(500) }),
  terminar: z.object({ resumen: z.string().trim().max(500) }),
} as const;

export type NombreHerramienta = keyof typeof ENTRADAS;

/** La entrada validada, o un error para devolverle a la IA. */
export function leerEntrada<N extends NombreHerramienta>(nombre: N, entrada: unknown): { ok: true; datos: z.infer<(typeof ENTRADAS)[N]> } | { ok: false; error: string } {
  const r = ENTRADAS[nombre].safeParse(entrada);
  if (r.success) return { ok: true, datos: r.data as z.infer<(typeof ENTRADAS)[N]> };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ") };
}

export const esHerramienta = (nombre: string): nombre is NombreHerramienta => nombre in ENTRADAS;
