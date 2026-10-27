import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { companiasCotizables } from "@/conexiones/catalogo";
import { portal } from "@/conexiones/portal";
import type { EstadoCotizacion } from "@/lib/cotizacion";

export type NuevaSolicitud = {
  aseguradoId?: number | null;
  leadId?: number | null;
  cliente: string;
  tipo: "renovacion" | "mejora" | "nueva";
  ramo: string;
  bien?: string | null;
  motivo?: string | null;
  /** Si no se indica, se incluyen todas las compañías configuradas para cotizar. */
  companias?: string[];
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
  const filas = await db
    .select({ compania: schema.conexiones.compania, estado: schema.conexiones.estado, datos: schema.conexiones.datos })
    .from(schema.conexiones)
    .where(eq(schema.conexiones.tipo, "portal"));
  const habilitadas = companiasCotizables(filas);
  if (!habilitadas.length) throw new SinCompaniasCotizablesError();

  const solicitadas = s.companias?.length ? [...new Set(s.companias)] : habilitadas;
  if (!solicitadas.length || solicitadas.some((compania) => !habilitadas.includes(compania))) {
    throw new Error("La solicitud incluye una compañía que no está configurada para cotizar.");
  }
  const companias = habilitadas.filter((compania) => solicitadas.includes(compania));
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
    }).returning({ id: schema.solicitudesCotizacion.id });
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${numero}`,
      texto: `Creó la solicitud ${numero} (${s.ramo} · ${s.cliente}) e inició el envío automatizado a las compañías configuradas: ${companias.join(", ")}.`,
    });
    return { id: insertada.id, numero };
  });

  const resultados = await Promise.all(
    companias.map(async (compania) => {
      try {
        const respuesta = await portal.pedirCotizacion(compania, {
          solicitudId: creada.id,
          solicitudNumero: creada.numero,
          cliente: s.cliente,
          tipo: s.tipo,
          ramo: s.ramo,
          bien: s.bien ?? null,
          motivo: s.motivo ?? null,
        });
        return { compania, precio: null, estado: "enviada" as const, referencia: respuesta.referencia };
      } catch (error) {
        const detalle = error instanceof Error ? error.message : "No se pudo contactar el portal.";
        return { compania, precio: null, estado: "error" as const, error: detalle.slice(0, 250) };
      }
    }),
  );
  const persistidos = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from solicitudes_cotizacion where id = ${creada.id} for update`);
    const [actual] = await tx
      .select({ cotizaciones: schema.solicitudesCotizacion.cotizaciones })
      .from(schema.solicitudesCotizacion)
      .where(eq(schema.solicitudesCotizacion.id, creada.id));
    const fusionados = resultados.map((resultado) => {
      const recibido = actual?.cotizaciones.find((cotizacion) => cotizacion.compania === resultado.compania && cotizacion.precio !== null);
      return recibido ?? resultado;
    });
    await tx
      .update(schema.solicitudesCotizacion)
      .set({ cotizaciones: fusionados, actualizadoEl: new Date() })
      .where(eq(schema.solicitudesCotizacion.id, creada.id));
    return fusionados;
  });
  const enviados = persistidos.filter((resultado) => resultado.estado === "enviada");
  const fallidos = persistidos.filter((resultado) => resultado.estado === "error");
  const recibidos = persistidos.filter((resultado) => resultado.precio !== null);
  const nota = fallidos.length
    ? enviados.length
      ? `Enviado a ${enviados.map((resultado) => resultado.compania).join(", ")}. No enviado a ${fallidos.map((resultado) => resultado.compania).join(", ")}.`
      : `No se enviaron solicitudes a ${fallidos.map((resultado) => resultado.compania).join(", ")}: ${fallidos[0].error}`
    : recibidos.length === persistidos.length
      ? "Todas las cotizaciones llegaron; comparativa lista."
      : `Solicitudes enviadas a ${enviados.map((resultado) => resultado.compania).join(", ")}; esperando precios.`;
  await db
    .update(schema.solicitudesCotizacion)
    .set({ nota, actualizadoEl: new Date() })
    .where(eq(schema.solicitudesCotizacion.id, creada.id));
  await db.insert(schema.actividadAgentes).values({
    agente: "cotizacion",
    referencia: `solicitud:${creada.numero}`,
    texto: enviados.length
      ? `Envió solicitudes de cotización a ${enviados.map((resultado) => resultado.compania).join(", ")}.${fallidos.length ? `Falló el envío a ${fallidos.map((resultado) => resultado.compania).join(", ")}.` : ""}`
      : recibidos.length === persistidos.length
        ? `Recibió todas las cotizaciones de la solicitud ${creada.numero}; comparativa lista.`
        : `No pudo enviar la solicitud ${creada.numero}. ${fallidos.map((resultado) => `${resultado.compania}: ${resultado.error}`).join("; ")}`,
  });
  return creada.numero;
}

/** Registra una respuesta de una compañía y actualiza la comparativa. */
export async function registrarResultadoCotizacion(datos: {
  solicitudId: number;
  compania: string;
  precio: number;
  observacion?: string | null;
  origen?: "portal" | "manual";
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
    await tx.insert(schema.actividadAgentes).values({
      agente: "cotizacion",
      referencia: `solicitud:${solicitud.numero}`,
      texto: `Registró una cotización de ${datos.compania} por $ ${datos.precio.toLocaleString("es-AR")}${
        datos.origen === "portal" ? " recibida del portal" : " cargada por el productor"
      }. ${pendientes.length ? `Faltan respuestas de ${pendientes.join(", ")}.` : "La comparativa está completa."}`,
    });
  });
}
