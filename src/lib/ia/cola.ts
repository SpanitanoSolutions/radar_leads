import "server-only";
import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { agotoIntentos, ErrorTrabajo, errorSeguro, esReintentable, limiteColgado, porcentaje, trasFallo } from "./trabajos";

export type TrabajoIA = typeof schema.iaTrabajos.$inferSelect;
type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NuevoTrabajo = {
  agente: string;
  operacion: string;
  entidad: string;
  entidadId: number;
  orgId?: string | null;
  producerId?: string | null;
  datos?: Record<string, unknown>;
  ejecutarDespuesDe?: Date;
};

export type ContextoTrabajo = {
  trabajo: TrabajoIA;
  /** Porcentaje entre 0 y 100, para mostrar "Procesando…" en la UI. */
  reportarProgreso(porcentaje: number): Promise<void>;
};

/**
 * Hace el trabajo y guarda el resultado en las tablas de su agente. Para una
 * falla conocida, lanzá un ErrorTrabajo: es el único mensaje que se guarda.
 */
export type ManejadorTrabajo = (contexto: ContextoTrabajo) => Promise<void>;
/** Clave `agente:operacion`. */
export type Manejadores = Record<string, ManejadorTrabajo>;

export const claveManejador = (agente: string, operacion: string) => `${agente}:${operacion}`;

/** Se puede llamar dentro de la transacción que crea la entidad, como hace Siniestros. */
export async function encolarTrabajo(trabajo: NuevoTrabajo, tx: Transaccion | typeof db = db): Promise<number> {
  const [fila] = await tx.insert(schema.iaTrabajos).values({
    agente: trabajo.agente,
    operacion: trabajo.operacion,
    entidad: trabajo.entidad,
    entidadId: trabajo.entidadId,
    orgId: trabajo.orgId ?? null,
    producerId: trabajo.producerId ?? null,
    datos: trabajo.datos ?? {},
    estado: "pendiente",
    ...(trabajo.ejecutarDespuesDe ? { ejecutarDespuesDe: trabajo.ejecutarDespuesDe } : {}),
  }).returning({ id: schema.iaTrabajos.id });
  return fila.id;
}

/**
 * Toma hasta `limite` trabajos listos (o caídos) de forma atómica: dos
 * procesos a la vez nunca toman el mismo, gracias a FOR UPDATE SKIP LOCKED.
 * Solo toma las operaciones que tienen manejador; los trabajos en
 * `pendiente_configuracion` quedan como están.
 */
export async function tomarTrabajos(claves: string[], limite: number, ahora = new Date()): Promise<TrabajoIA[]> {
  const t = schema.iaTrabajos;
  const operaciones = claves.map((clave) => {
    const [agente, operacion] = clave.split(":");
    return and(eq(t.agente, agente), eq(t.operacion, operacion));
  });
  if (!operaciones.length || limite <= 0) return [];
  const candidatos = db.select({ id: t.id }).from(t)
    .where(and(
      or(...operaciones),
      or(
        and(eq(t.estado, "pendiente"), lte(t.ejecutarDespuesDe, ahora)),
        and(eq(t.estado, "procesando"), lt(t.iniciadoEl, limiteColgado(ahora))),
      ),
    ))
    .orderBy(t.ejecutarDespuesDe, t.id)
    .limit(limite)
    .for("update", { skipLocked: true });
  return db.update(t)
    .set({ estado: "procesando", intentos: sql`${t.intentos} + 1`, iniciadoEl: ahora, actualizadoEl: ahora })
    .where(inArray(t.id, candidatos))
    .returning();
}

/**
 * Solo actualiza si el trabajo sigue siendo de esta toma: si quedó caído y
 * otro proceso lo volvió a tomar, `intentos` cambió y esta escritura no pisa nada.
 */
function deEstaToma(trabajo: TrabajoIA) {
  return and(eq(schema.iaTrabajos.id, trabajo.id), eq(schema.iaTrabajos.estado, "procesando"), eq(schema.iaTrabajos.intentos, trabajo.intentos));
}

async function marcarFallo(trabajo: TrabajoIA, error: unknown) {
  const ahora = new Date();
  const siguiente = agotoIntentos(trabajo.intentos) ? { estado: "error" as const } : trasFallo(trabajo.intentos, ahora, esReintentable(error));
  await db.update(schema.iaTrabajos).set(siguiente.estado === "pendiente"
    ? { estado: "pendiente", ejecutarDespuesDe: siguiente.ejecutarDespuesDe, iniciadoEl: null, errorSeguro: errorSeguro(error), actualizadoEl: ahora }
    : { estado: "error", terminadoEl: ahora, errorSeguro: errorSeguro(error), actualizadoEl: ahora })
    .where(deEstaToma(trabajo));
  return siguiente.estado;
}

export type ResumenCola = { tomados: number; completados: number; reintentos: number; errores: number };

/**
 * Procesa hasta `limite` trabajos, de a uno: toma el siguiente recién cuando
 * terminó el anterior, así ninguno queda tomado sin procesar si se acaba el
 * tiempo (`tiempoMs`, menor que el maxDuration de la ruta).
 */
export async function procesarTrabajos(
  manejadores: Manejadores,
  { limite = 5, tiempoMs = 240_000 }: { limite?: number; tiempoMs?: number } = {},
): Promise<ResumenCola> {
  const fin = Date.now() + tiempoMs;
  const claves = Object.keys(manejadores);
  const resumen: ResumenCola = { tomados: 0, completados: 0, reintentos: 0, errores: 0 };
  while (resumen.tomados < limite && Date.now() < fin) {
    const [trabajo] = await tomarTrabajos(claves, 1);
    if (!trabajo) break;
    resumen.tomados++;
    await procesarUno(trabajo, manejadores, resumen);
  }
  return resumen;
}

async function procesarUno(trabajo: TrabajoIA, manejadores: Manejadores, resumen: ResumenCola) {
  const manejador: ManejadorTrabajo | undefined = manejadores[claveManejador(trabajo.agente, trabajo.operacion)];
  const sinEjecutar = !manejador ? "No hay quién procese esta operación." : agotoIntentos(trabajo.intentos) ? "Se agotaron los intentos." : null;
  if (!manejador || sinEjecutar) {
    await marcarFallo(trabajo, new ErrorTrabajo(sinEjecutar ?? "", false));
    resumen.errores++;
    return;
  }
  try {
    await manejador({
      trabajo,
      reportarProgreso: async (avance) => {
        await db.update(schema.iaTrabajos)
          .set({ progreso: porcentaje(avance, 100), actualizadoEl: new Date() })
          .where(deEstaToma(trabajo));
      },
    });
    const ahora = new Date();
    await db.update(schema.iaTrabajos)
      .set({ estado: "completado", progreso: 100, errorSeguro: null, terminadoEl: ahora, actualizadoEl: ahora })
      .where(deEstaToma(trabajo));
    resumen.completados++;
  } catch (error) {
    if (await marcarFallo(trabajo, error) === "pendiente") resumen.reintentos++;
    else resumen.errores++;
  }
}
