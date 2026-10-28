import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EstadoCotizacion } from "@/lib/cotizacion";

export type NuevaSolicitud = {
  aseguradoId?: number | null;
  leadId?: number | null;
  cliente: string;
  tipo: "renovacion" | "mejora" | "nueva" | "negocio_nuevo";
  ramo: string;
  bien?: string | null;
  motivo?: string | null;
  /** Si no se indica, se incluyen todas las compañías configuradas para cotizar. */
  companias?: string[];
  datosRiesgo?: Record<string, string | number | boolean | null>;
};

export class SinCompaniasCotizablesError extends Error {
  constructor() {
    super("No hay compañías configuradas para cotizar.");
    this.name = "SinCompaniasCotizablesError";
  }
}

/**
 * Crea una solicitud de cotización para las compañías configuradas en la cuenta.
 * La lista se vuelve a comprobar en el servidor; el formulario no puede ampliar
 * el conjunto de compañías habilitadas. Devuelve el número visible.
 */
export async function crearSolicitud(s: NuevaSolicitud): Promise<number> {
  const aseguradoras = await db.select().from(schema.cotizacionAseguradoras).where(eq(schema.cotizacionAseguradoras.activa, true));
  const habilitadas = aseguradoras.filter((aseguradora) => !aseguradora.ramos.length || aseguradora.ramos.includes(s.ramo)).map(({ nombre }) => nombre);
  if (!habilitadas.length) throw new SinCompaniasCotizablesError();

  const solicitadas = s.companias?.length ? [...new Set(s.companias)] : habilitadas;
  if (!solicitadas.length || solicitadas.some((compania) => !habilitadas.includes(compania))) {
    throw new Error("La solicitud incluye una compañía que no está configurada para cotizar.");
  }
  const companias = habilitadas.filter((compania) => solicitadas.includes(compania));
  const config = (await db.select().from(schema.cotizacionConfig).limit(1))[0];
  const creada = await db.transaction(async (tx) => {
    const [{ numero }] = (await tx.execute(
      sql`select coalesce(max(numero), 1000)::int + 1 as numero from solicitudes_cotizacion`,
    )) as unknown as { numero: number }[];
    const [insertada] = await tx.insert(schema.solicitudesCotizacion).values({
      numero,
      aseguradoId: s.aseguradoId ?? null,
      leadId: s.leadId ?? null,
      cliente: s.cliente,
      tipo: s.tipo,
      ramo: s.ramo,
      bien: s.bien ?? null,
      motivo: s.motivo ?? null,
      origen: "manual",
      estado: "esperando",
      nota: "Pendiente de integración para enviar a las compañías",
      companias,
      cotizaciones: companias.map((compania) => ({ compania, precio: null, estado: "pendiente" as const })),
      datosRiesgo: s.datosRiesgo ?? {},
    }).returning({ id: schema.solicitudesCotizacion.id });
    const envios = companias.map((compania) => {
      const aseguradora = aseguradoras.find((fila) => fila.nombre === compania);
      const asunto = (aseguradora?.asunto || config?.plantillaAsunto || "SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]")
        .replaceAll("[RAMO]", s.ramo).replaceAll("[CLIENTE]", s.cliente).replaceAll("[ASEGURADORA]", compania)
        .replaceAll("[CLAVE]", aseguradora?.codigoProductor ?? "");
      const valores: Record<string, string> = {
        productor: "Productor", organizacion: "UNIQO", aseguradora: compania, cliente: s.cliente,
        cuit: String(s.datosRiesgo?.cuitCuil ?? ""), ramo: s.ramo, moneda: "ARS", forma_de_pago: String(s.datosRiesgo?.formaDePago ?? "a convenir"),
      };
      let cuerpo = config?.plantillaCuerpo ?? "Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}.";
      for (const [clave, valor] of Object.entries(valores)) cuerpo = cuerpo.replaceAll(`{${clave}}`, valor);
      if (aseguradora?.instrucciones) cuerpo += `\n\n${aseguradora.instrucciones}`;
      return {
        solicitudId: insertada.id,
        aseguradoraId: aseguradora?.id,
        compania,
        canal: aseguradora?.canal ?? "correo" as const,
        estado: "pendiente" as const,
        asuntoBorrador: asunto,
        cuerpoBorrador: cuerpo,
      };
    });
    const insertados = await tx.insert(schema.cotizacionEnvios).values(envios).returning({ id: schema.cotizacionEnvios.id, compania: schema.cotizacionEnvios.compania });
    await tx.insert(schema.cotizacionEventos).values([
      { solicitudId: insertada.id, tipo: "solicitud_creada", detalle: "Se creó la solicitud y quedaron borradores pendientes de aprobación." },
      ...insertados.map(({ id, compania }) => ({ solicitudId: insertada.id, envioId: id, tipo: "borrador_creado", detalle: `Borrador preparado para ${compania}; requiere aprobación del productor.` })),
    ]);
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${numero}`,
      texto: `Creó la solicitud ${numero}; hay ${companias.length} borradores pendientes de aprobación.`,
    });
    return { id: insertada.id, numero };
  });

  await db.update(schema.solicitudesCotizacion).set({ nota: `${companias.length} borradores listos para revisar. Todavía no se envió nada.`, actualizadoEl: new Date() }).where(eq(schema.solicitudesCotizacion.id, creada.id));
  return creada.numero;
}

/** Registra una respuesta de una compañía y actualiza la comparativa. */
export async function registrarResultadoCotizacion(datos: {
  solicitudId: number;
  compania: string;
  precio: number;
  observacion?: string | null;
  origen?: "portal" | "manual";
  primaNeta?: number | null;
  gastos?: number;
  impuestos?: number;
  franquicia?: string | null;
  sumaAsegurada?: number | null;
  condiciones?: string | null;
  vigencia?: string | null;
  confirmado?: boolean;
  coberturas?: { nombre: string; valor?: string; incluida?: boolean }[];
  riesgoCotizado?: Record<string, string>;
}): Promise<void> {
  if (!Number.isInteger(datos.solicitudId) || datos.solicitudId <= 0) throw new Error("Solicitud inválida.");
  if (!Number.isFinite(datos.precio) || datos.precio <= 0) throw new Error("El precio debe ser mayor que cero.");
  const observacion = datos.observacion?.trim().slice(0, 500) || undefined;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from solicitudes_cotizacion where id = ${datos.solicitudId} for update`);
    const [solicitud] = await tx
      .select()
      .from(schema.solicitudesCotizacion)
      .where(eq(schema.solicitudesCotizacion.id, datos.solicitudId));
    if (!solicitud) throw new Error("Solicitud inexistente.");
    if (["ganada", "perdida"].includes(solicitud.estado)) throw new Error("La solicitud ya está cerrada.");
    if (!solicitud.companias.includes(datos.compania)) throw new Error("La compañía no forma parte de esta solicitud.");

    const recibidaEl = new Date().toISOString();
    const cotizaciones: typeof solicitud.cotizaciones = [
      ...solicitud.cotizaciones.filter((cotizacion) => cotizacion.compania !== datos.compania),
      {
        compania: datos.compania,
        precio: datos.precio,
        recibidaEl,
        estado: "recibida",
        ...(observacion ? { observacion } : {}),
        origen: datos.origen ?? "manual",
      },
    ];
    const pendientes = solicitud.companias.filter(
      (compania) => !cotizaciones.some((cotizacion) => cotizacion.compania === compania && cotizacion.precio !== null),
    );
    const estado: EstadoCotizacion = pendientes.length ? "esperando" : "lista";
    const nota = pendientes.length
      ? `Respuesta recibida de ${datos.compania}. Pendiente: ${pendientes.join(", ")}.`
      : "Ya llegaron todas las respuestas; comparativa lista.";

    await tx
      .update(schema.solicitudesCotizacion)
      .set({ cotizaciones, estado, nota, actualizadoEl: new Date() })
      .where(eq(schema.solicitudesCotizacion.id, datos.solicitudId));
    const [envio] = await tx.select().from(schema.cotizacionEnvios).where(and(
      eq(schema.cotizacionEnvios.solicitudId, datos.solicitudId),
      eq(schema.cotizacionEnvios.compania, datos.compania),
    ));
    if (envio) {
      const resultado = {
        envioId: envio.id,
        primaNeta: datos.primaNeta ?? null,
        primaTotal: datos.precio,
        gastos: datos.gastos ?? 0,
        impuestos: datos.impuestos ?? 0,
        franquicia: datos.franquicia ?? null,
        sumaAsegurada: datos.sumaAsegurada ?? null,
        condiciones: datos.condiciones ?? null,
        vigencia: datos.vigencia ?? null,
        coberturas: datos.coberturas ?? [],
        riesgoCotizado: datos.riesgoCotizado ?? {},
        confirmado: datos.confirmado ?? true,
      };
      const [existente] = await tx.select({ id: schema.cotizacionResultados.id }).from(schema.cotizacionResultados).where(eq(schema.cotizacionResultados.envioId, envio.id)).limit(1);
      if (existente) await tx.update(schema.cotizacionResultados).set(resultado).where(eq(schema.cotizacionResultados.id, existente.id));
      else await tx.insert(schema.cotizacionResultados).values(resultado);
      await tx.update(schema.cotizacionEnvios).set({ estado: "cotizado", ultimaActividad: new Date() }).where(eq(schema.cotizacionEnvios.id, envio.id));
      await tx.insert(schema.cotizacionEventos).values({ solicitudId: datos.solicitudId, envioId: envio.id, actor: "productor", tipo: "cotizacion_cargada", detalle: `El productor cargó y confirmó el precio de ${datos.compania}.` });
    }
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${solicitud.numero}`,
      texto: `Registró una respuesta de ${datos.compania}${datos.origen === "portal" ? " recibida del portal simulado" : " cargada por el productor"}. ${pendientes.length ? `Faltan respuestas de ${pendientes.join(", ")}.` : "La comparativa está completa."}`,
    });
  });
}
