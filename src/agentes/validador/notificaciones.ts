import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { email } from "@/conexiones/email";
import { whatsapp } from "@/conexiones/whatsapp";
import type { ErrorCorridaValidador } from "@/db/schema";
import { diaEnArgentina, sumarDias } from "@/lib/fechas";
import { avisoDeResumen, avisosPorEvento, leerNotificaciones, type Aviso, type CanalAviso, type Hechos, type NotificacionesLeidas } from "@/lib/validador/notificaciones";
import { configValidador, type AlcanceValidador } from "./cartera";

// Los avisos del Validador al productor, después de las corridas
// automáticas (paso 8 de la sección 6 de la spec). Salen por las conexiones
// de WhatsApp y Gmail a los destinatarios que cargó el productor. Nunca le
// escriben a un asegurado. Si un canal falla, queda en Actividad y la
// corrida sigue igual.

const AGENTE = "validador";

function enlace(): string | null {
  const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return dominio ? `https://${dominio}/agentes/validador` : null;
}

async function enviarPor(canal: CanalAviso, para: string, aviso: Aviso) {
  return canal === "email"
    ? email.enviar({ para, asunto: aviso.asunto, texto: aviso.texto })
    : whatsapp.enviar({ para, texto: `${aviso.asunto}\n\n${aviso.texto}` });
}

/** Manda cada aviso por los canales activos y deja en Actividad qué salió y qué no. */
export async function notificar(avisos: Aviso[], config: NotificacionesLeidas) {
  if (!avisos.length) return;
  for (const canal of ["whatsapp", "email"] as const) {
    const { activo, destinatarios } = config[canal];
    if (!activo || !destinatarios.length) continue;
    const nombre = canal === "email" ? "email" : "WhatsApp";
    for (const aviso of avisos) {
      const errores: string[] = [];
      let enviados = 0;
      for (const para of destinatarios) {
        const r = await enviarPor(canal, para, aviso).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Falló el envío." }));
        if (r.ok) enviados++;
        else errores.push(r.error);
      }
      await db.insert(schema.actividadAgentes).values({
        agente: AGENTE,
        texto: errores.length
          ? `No pudo avisarte por ${nombre} (“${aviso.asunto}”, ${enviados} de ${destinatarios.length}): ${[...new Set(errores)].join(" ")}`
          : `Te avisó por ${nombre}: ${aviso.asunto}.`,
      });
    }
  }
}

/** Modo "evento por evento": después de la validación automática, un aviso por cada evento con novedades. */
export async function avisarValidacion(hechos: Hechos, alcance: AlcanceValidador) {
  try {
    const config = leerNotificaciones((await configValidador(alcance)).notificaciones);
    if (config.modo !== "evento") return;
    await notificar(avisosPorEvento(hechos, config.eventos, enlace()), config);
  } catch {
    // Un aviso que no sale no frena la corrida.
  }
}

/** Lo que pasó hoy: pagos registrados hoy, el estado de las cuotas y los errores de las corridas de hoy. */
async function hechosDeHoy(ahora: Date): Promise<Hechos> {
  const hoy = diaEnArgentina(ahora);
  const desde = new Date(`${hoy}T00:00:00-03:00`);
  const hasta = new Date(`${sumarDias(hoy, 1)}T00:00:00-03:00`);
  const c = schema.cuotas;
  const [[pagos], estados, corridas] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(c).where(and(gte(c.pagadaEl, desde), lt(c.pagadaEl, hasta))),
    db.select({ estado: c.estadoValidacion, n: sql<number>`count(*)::int` }).from(c).groupBy(c.estadoValidacion),
    db.select({ errores: schema.validadorCorridas.errores }).from(schema.validadorCorridas).where(gte(schema.validadorCorridas.iniciadaEl, desde)),
  ]);
  const errores = new Map<string, ErrorCorridaValidador>();
  for (const e of corridas.flatMap((x) => x.errores)) errores.set(`${e.compania}|${e.mensaje}`, e);
  return {
    pagosConfirmados: pagos?.n ?? 0,
    porVencer: estados.find((e) => e.estado === "por_vencer")?.n ?? 0,
    vencidas: estados.find((e) => e.estado === "vencida")?.n ?? 0,
    errores: [...errores.values()],
  };
}

/** Modo "resumen diario": después del enriquecimiento automático, un solo aviso con el resumen del día. */
export async function avisarResumen(resumen: string, alcance: AlcanceValidador, ahora = new Date()) {
  try {
    const config = leerNotificaciones((await configValidador(alcance)).notificaciones);
    if (config.modo !== "resumen") return;
    const aviso = avisoDeResumen(resumen, await hechosDeHoy(ahora), config.eventos, enlace());
    if (aviso) await notificar([aviso], config);
  } catch {
    // Un aviso que no sale no frena la corrida.
  }
}

/** El canal está conectado: si no, los avisos no pueden salir. */
export async function canalesConectados(): Promise<Record<CanalAviso, boolean>> {
  const filas = await db.select({ clave: schema.conexiones.clave, estado: schema.conexiones.estado, datos: schema.conexiones.datos }).from(schema.conexiones)
    .where(eq(schema.conexiones.estado, "conectado"));
  const whatsappReal = filas.some((f) => f.clave === "whatsapp" && f.datos.validadoReal === true);
  return { whatsapp: whatsappReal, email: (await email.estado()).conectado };
}
