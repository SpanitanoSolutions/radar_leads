import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { extractText } from "unpdf";
import { db, schema } from "@/db";
import type { RespuestaIA } from "./index";
import { registrarResultadoCotizacion } from "@/agentes/cotizacion/solicitudes";

export async function estadoIAcotizacion(): Promise<{ habilitada: boolean; motivo: "activa" | "sin_clave" | "desactivada" }> {
  if (!process.env.ANTHROPIC_API_KEY) return { habilitada: false, motivo: "sin_clave" };
  const [feature] = await db.select({ activa: schema.orgFeatures.activa }).from(schema.orgFeatures)
    .where(and(isNull(schema.orgFeatures.orgId), eq(schema.orgFeatures.feature, "cotizacion_ia"))).limit(1);
  return feature?.activa ? { habilitada: true, motivo: "activa" } : { habilitada: false, motivo: "desactivada" };
}

async function proveedor() {
  const { ProveedorClaude } = await import("./claude");
  return new ProveedorClaude();
}

async function guardarRespuesta(solicitudId: number, tipo: string, respuesta: RespuestaIA) {
  const [borrador] = await db.insert(schema.cotizacionBorradoresIA).values({
    solicitudId, tipo, contenido: respuesta.texto, modelo: respuesta.modelo,
    tokensEntrada: respuesta.tokensEntrada, tokensSalida: respuesta.tokensSalida, costoUsd: respuesta.costoUsd,
  }).returning({ id: schema.cotizacionBorradoresIA.id });
  await db.insert(schema.cotizacionEventos).values({
    solicitudId, actor: "ia", tipo: `ia_${tipo}`,
    detalle: `La IA preparó un borrador de ${tipo}. No se envió nada.`,
    modelo: respuesta.modelo, tokensEntrada: respuesta.tokensEntrada, tokensSalida: respuesta.tokensSalida, costoUsd: respuesta.costoUsd,
  });
  return borrador.id;
}

export async function generarChatCotizacionIA(solicitudId: number, mensaje: string): Promise<number> {
  const estado = await estadoIAcotizacion();
  if (!estado.habilitada) throw new Error("La IA no está habilitada para esta organización.");
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, solicitudId));
  if (!solicitud) throw new Error("Solicitud inexistente.");
  const contexto = {
    cliente: solicitud.cliente,
    ramo: solicitud.ramo,
    tipo: solicitud.tipo,
    bien: solicitud.bien,
    datosDelRiesgo: solicitud.datosRiesgo,
    respuestas: solicitud.cotizaciones.map(({ compania, precio, observacion }) => ({ compania, precio, observacion })),
  };
  const respuesta = await (await proveedor()).generar({
    system: "Sos el asistente de cotización de UNIQO para productores asesores de seguros de Argentina. Respondé en español rioplatense con voseo. Usá solo los datos provistos, aclarà cualquier dato faltante y ofrecé sugerencias revisables. No afirmes que enviaste correos ni ejecutes acciones.",
    mensaje: `Contexto de la solicitud (datos confidenciales):\n${JSON.stringify(contexto)}\n\nPedido del productor:\n${mensaje.trim().slice(0, 3000)}`,
    maxTokens: 900,
  });
  return guardarRespuesta(solicitudId, "chat", respuesta);
}

export async function redactarCorreoCotizacionIA(envioId: number): Promise<number> {
  const estado = await estadoIAcotizacion();
  if (!estado.habilitada) throw new Error("La IA no está habilitada para esta organización.");
  const [envio] = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, envioId));
  if (!envio || envio.estadoBorrador !== "pendiente") throw new Error("Ese borrador no está disponible.");
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, envio.solicitudId));
  if (!solicitud) throw new Error("Solicitud inexistente.");
  const respuesta = await (await proveedor()).generar({
    system: "Redactás borradores profesionales de español rioplatense para productores de seguros argentinos. Conservá el sentido, no inventes datos. Devolvé solo el cuerpo del correo. No lo envíes.",
    mensaje: JSON.stringify({ borradorActual: envio.cuerpoBorrador, aseguradora: envio.compania, ramo: solicitud.ramo, cliente: solicitud.cliente, datosDelRiesgo: solicitud.datosRiesgo }),
    maxTokens: 700,
  });
  const borradorId = await guardarRespuesta(solicitud.id, "correo", respuesta);
  await db.update(schema.cotizacionEnvios).set({ cuerpoBorrador: respuesta.texto, ultimaActividad: new Date() }).where(eq(schema.cotizacionEnvios.id, envioId));
  return borradorId;
}

export async function extraerCotizacionPdfIA(archivoId: number): Promise<number> {
  const estado = await estadoIAcotizacion();
  if (!estado.habilitada) throw new Error("La IA no está habilitada para esta organización.");
  const [archivo] = await db.select().from(schema.cotizacionArchivos).where(eq(schema.cotizacionArchivos.id, archivoId));
  if (!archivo || archivo.mime !== "application/pdf" || !archivo.envioId) throw new Error("El archivo PDF de una compañía no está disponible.");
  const [envio] = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.id, archivo.envioId));
  if (!envio) throw new Error("Envío inexistente.");
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, envio.solicitudId));
  if (!solicitud) throw new Error("Solicitud inexistente.");
  const { text } = await extractText(new Uint8Array(archivo.bytes), { mergePages: true });
  const respuesta = await (await proveedor()).generar({
    system: "Extraés datos de una cotización de seguros argentina. Respondé solo JSON válido con primaNeta, primaTotal, gastos, impuestos, franquicia, sumaAsegurada, vigencia, condiciones, coberturas (lista de {nombre, valor}) y riesgoCotizado (cuitCuil, marca, modelo, anio, codigoPostal cuando aparezcan). Usá null o listas vacías cuando el PDF no lo indique; no inventes. El productor debe confirmar el resultado.",
    mensaje: `Compañía: ${envio.compania}. Ramo: ${solicitud.ramo}. Texto del PDF (confidencial):\n${text.slice(0, 24000)}`,
    maxTokens: 1200,
  });
  try {
    const json = JSON.parse(respuesta.texto.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
    const primaTotal = Number(json.primaTotal);
    const riesgoOrigen = typeof json.riesgoCotizado === "object" && json.riesgoCotizado !== null ? json.riesgoCotizado as Record<string, unknown> : {};
    const riesgoCotizado = Object.fromEntries(["cuitCuil", "marca", "modelo", "anio", "codigoPostal"].flatMap((campo) => typeof riesgoOrigen[campo] === "string" ? [[campo, (riesgoOrigen[campo] as string).slice(0, 120)]] : []));
    const coberturas = Array.isArray(json.coberturas)
      ? json.coberturas.filter((item): item is { nombre: string; valor?: string } => typeof item === "object" && item !== null && typeof (item as { nombre?: unknown }).nombre === "string")
        .map((item) => ({ nombre: item.nombre.slice(0, 120), valor: typeof item.valor === "string" ? item.valor.slice(0, 200) : undefined }))
      : [];
    if (Number.isFinite(primaTotal) && primaTotal > 0) {
      await registrarResultadoCotizacion({
        solicitudId: solicitud.id,
        compania: envio.compania,
        precio: primaTotal,
        primaNeta: typeof json.primaNeta === "number" ? json.primaNeta : null,
        gastos: typeof json.gastos === "number" ? json.gastos : 0,
        impuestos: typeof json.impuestos === "number" ? json.impuestos : 0,
        franquicia: typeof json.franquicia === "string" ? json.franquicia : null,
        sumaAsegurada: typeof json.sumaAsegurada === "number" ? json.sumaAsegurada : null,
        vigencia: typeof json.vigencia === "string" ? json.vigencia : null,
        condiciones: typeof json.condiciones === "string" ? json.condiciones : null,
        riesgoCotizado,
        coberturas,
        origen: "portal",
        confirmado: false,
      });
    }
  } catch {
    // La respuesta sigue disponible en el borrador IA para completar la comparación a mano.
  }
  return guardarRespuesta(solicitud.id, "extraccion", respuesta);
}

export async function obtenerBorradoresIA(solicitudId: number) {
  return db.select().from(schema.cotizacionBorradoresIA).where(eq(schema.cotizacionBorradoresIA.solicitudId, solicitudId)).orderBy(schema.cotizacionBorradoresIA.creadoEl);
}
