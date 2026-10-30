import { CAMPOS_RIESGO_POR_RAMO, mejorResultadoConfirmado } from "@/lib/cotizacion";
import { pesos } from "@/lib/formato";
import { estadoContacto, type ContextoEnvios, type EnvioDetalle } from "./detalle";

// El correo del agente al ejecutivo (pestaña Agente del detalle): el resumen de
// la solicitud con el riesgo, las compañías consultadas y el comparativo
// parcial. Decisión de Julian (30/10/2026): el ejecutivo es el productor de la
// cuenta, así que va al correo de Mi cuenta y sale, con su aprobación, por la
// salida común. El envío está en src/agentes/cotizacion/ejecutivo.ts.

const ETIQUETAS_EXTRA: Record<string, string> = {
  sumaAsegurada: "Suma asegurada",
  coberturasSolicitadas: "Coberturas solicitadas",
  moneda: "Moneda",
  vigenciaDesde: "Vigencia desde",
};

/** "codigoPostal" → "Código postal". Si no lo conoce, lo deja como vino. */
export function etiquetaRiesgo(campo: string): string {
  for (const campos of Object.values(CAMPOS_RIESGO_POR_RAMO)) {
    const conocido = campos.find((c) => c.campo === campo);
    if (conocido) return conocido.etiqueta;
  }
  return ETIQUETAS_EXTRA[campo] ?? campo;
}

function precio(valor: number, moneda = "ARS"): string {
  return moneda === "USD" ? `US$ ${valor.toLocaleString("es-AR")}` : pesos(valor);
}

export type DatosResumen = {
  solicitud: {
    numero: number;
    cliente: string;
    ramo: string;
    tipo: string;
    bien: string | null;
    datosRiesgo: Record<string, string | number | boolean | null>;
  };
  envios: EnvioDetalle[];
  ctx: ContextoEnvios;
  /** A quién saluda: el ejecutivo de la solicitud o el productor de la cuenta. */
  saludo: string | null;
};

export function resumenParaEjecutivo({ solicitud, envios, ctx, saludo }: DatosResumen): { asunto: string; cuerpo: string } {
  const tipo = solicitud.tipo === "renovacion" ? "Renovación" : "Negocio nuevo";
  const riesgo = Object.entries(solicitud.datosRiesgo)
    .filter(([, valor]) => valor !== null && valor !== "")
    .map(([campo, valor]) => `- ${etiquetaRiesgo(campo)}: ${typeof valor === "boolean" ? (valor ? "sí" : "no") : valor}`);
  const resultados = envios.flatMap((envio) => {
    const resultado = ctx.resultados.get(envio.id);
    return resultado ? [{ ...resultado, compania: envio.compania }] : [];
  });
  const mejor = mejorResultadoConfirmado(resultados);
  const companias = envios.map((envio) => {
    const paquete = envio.paqueteId == null ? null : ctx.nombrePaquete.get(envio.paqueteId) ?? null;
    const nombre = paquete ? `${envio.compania} (${paquete})` : envio.compania;
    const resultado = ctx.resultados.get(envio.id);
    if (resultado) {
      const marca = resultado.confirmado ? (mejor?.envioId === envio.id ? " · mejor precio" : "") : ", falta confirmarla";
      return `- ${nombre}: cotizó ${precio(resultado.primaTotal, resultado.moneda)}${marca}.`;
    }
    const estado = estadoContacto(envio, ctx);
    const pregunta = envio.preguntasPendientes ? ` Pregunta: ${envio.preguntasPendientes}` : "";
    return `- ${nombre}: ${estado.texto}.${estado.detalle ? ` ${estado.detalle}` : ""}${pregunta}`;
  });
  const respondieron = envios.filter((envio) => ctx.resultados.has(envio.id) || ["cotizado", "rechazado", "error"].includes(envio.estado)).length;
  const cuerpo = [
    `Hola${saludo ? ` ${saludo}` : ""}:`,
    `Te paso el resumen de la solicitud ${solicitud.numero} de ${solicitud.cliente}: ${tipo.toLowerCase()} de ${solicitud.ramo}${solicitud.bien ? `, ${solicitud.bien}` : ""}.`,
    riesgo.length ? `Datos del riesgo\n${riesgo.join("\n")}` : "Datos del riesgo: todavía no se cargaron.",
    `Aseguradoras consultadas (${envios.length})\n${companias.join("\n") || "- Ninguna."}`,
    `${respondieron} de ${envios.length} respondieron. ${mejor ? `Mejor precio confirmado: ${mejor.compania}, ${precio(mejor.primaTotal, mejor.moneda)}.` : "Todavía no hay precios confirmados."}`,
  ].join("\n\n");
  return { asunto: `Resumen – ${solicitud.ramo} – ${solicitud.cliente} – Solicitud ${solicitud.numero}`, cuerpo };
}

/**
 * Una huella corta del texto (FNV-1a): al aprobar, el servidor vuelve a armar
 * el resumen y solo lo manda si es el mismo que viste.
 */
export function huellaDeTexto(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
