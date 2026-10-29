import "server-only";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ErrorCorridaValidador } from "@/db/schema";
import { procesarTrabajos } from "@/lib/ia/cola";
import { diaEnArgentina } from "@/lib/fechas";
import { estadoDeCorrida, MINUTOS_CAIDA, periodoDeConsulta, resumenDeCorrida, type DatosResumen } from "@/lib/validador/corrida";
import type { Etapa } from "@/lib/validador/programacion";
import { companiasConCuotasAbiertas, recalcularEstados, type AlcanceValidador } from "./cartera";
import { avanzarFuente, fuentesPendientes, traerDeConectores } from "./fuentes";
import { explicarCaso, iaDisponible, OPERACIONES_IA, resumirCorrida } from "./ia";
import { MANEJADORES_VALIDADOR } from "./trabajos";

// Una corrida del Validador (sección 6 de docs/specs/validador-v2.md). La
// validación trae y cruza; el enriquecimiento, más tarde, hace lo que usa IA.
// Cada corrida queda en validador_corridas y en Actividad, con su estado y
// sus errores. La corre el cron o "Ejecutar validación" (en segundo plano).

const AGENTE = "validador";
const c = schema.validadorCorridas;
/** Casos "a revisar" que explica la IA por corrida: los más nuevos primero. */
const CASOS_POR_CORRIDA = 20;

type Origen = "cron" | "manual";

/**
 * Crea la corrida, salvo que ya haya una de la misma etapa en curso: en ese
 * caso devuelve esa, para no correr dos veces a la vez.
 */
export async function iniciarCorrida(origen: Origen, etapa: Etapa, alcance: AlcanceValidador, ahora = new Date()): Promise<{ id: number; nueva: boolean }> {
  const desde = new Date(ahora.getTime() - MINUTOS_CAIDA * 60_000);
  const [enCurso] = await db.select({ id: c.id }).from(c)
    .where(and(eq(c.etapa, etapa), eq(c.estado, "en_curso"), gte(c.iniciadaEl, desde)))
    .limit(1);
  if (enCurso) return { id: enCurso.id, nueva: false };
  const [corrida] = await db.insert(c).values({ origen, etapa, ...alcance }).returning({ id: c.id });
  return { id: corrida.id, nueva: true };
}

/** La última corrida por el cron de cada etapa: la usa la programación. */
export async function ultimaCorridaCron(etapa: Etapa): Promise<Date | null> {
  const [fila] = await db.select({ iniciadaEl: c.iniciadaEl }).from(c)
    .where(and(eq(c.origen, "cron"), eq(c.etapa, etapa)))
    .orderBy(desc(c.iniciadaEl)).limit(1);
  return fila?.iniciadaEl ?? null;
}

async function progreso(id: number, porcentaje: number) {
  await db.update(c).set({ progreso: Math.min(99, Math.round(porcentaje)) }).where(eq(c.id, id));
}

async function terminar(id: number, datos: { errores: ErrorCorridaValidador[]; resumen: string; cuotasActualizadas?: number; companiasProcesadas?: number; costoIaUsd?: number }, origen: Origen, etapa: Etapa) {
  const estado = estadoDeCorrida(datos.errores);
  await db.update(c).set({
    estado,
    progreso: 100,
    terminadaEl: new Date(),
    errores: datos.errores,
    resumen: datos.resumen,
    ...(datos.cuotasActualizadas !== undefined ? { cuotasActualizadas: datos.cuotasActualizadas } : {}),
    ...(datos.companiasProcesadas !== undefined ? { companiasProcesadas: datos.companiasProcesadas } : {}),
    ...(datos.costoIaUsd ? { costoIaUsd: datos.costoIaUsd } : {}),
  }).where(eq(c.id, id));
  const que = etapa === "validacion"
    ? `Validación ${origen === "cron" ? "automática" : "pedida por vos"}`
    : `Enriquecimiento ${origen === "cron" ? "automático" : "pedido por vos"}`;
  await db.insert(schema.actividadAgentes).values({
    agente: AGENTE,
    referencia: `corrida:${id}`,
    texto: `${que}${estado === "con_errores" ? " (con errores)" : ""}: ${datos.resumen}`,
  });
  return estado;
}

/**
 * Pasos 1 a 5: retoma los listados pendientes, consulta cada compañía con
 * cuotas abiertas por sus conectores, cruza, aplica y recalcula los estados.
 * Una compañía que falla no frena a las demás: queda en los errores.
 */
export async function correrValidacion(id: number, origen: Origen, alcance: AlcanceValidador, ahora = new Date()) {
  const errores: ErrorCorridaValidador[] = [];
  const datos: DatosResumen = { companias: 0, pagadas: 0, canceladas: 0, aRevisar: 0, noIdentificados: 0, porVencer: 0, vencidas: 0, errores };
  let cuotasActualizadas = 0;
  try {
    const hoy = diaEnArgentina(ahora);
    const [ultimaBuena] = await db.select({ terminadaEl: c.terminadaEl }).from(c)
      .where(and(eq(c.etapa, "validacion"), eq(c.estado, "ok"))).orderBy(desc(c.terminadaEl)).limit(1);
    const periodo = periodoDeConsulta(hoy, ultimaBuena?.terminadaEl ? diaEnArgentina(ultimaBuena.terminadaEl) : null);
    const sumar = (t: { pagadas: number; canceladas: number; aRevisar: number; noIdentificados: number }) => {
      datos.pagadas += t.pagadas;
      datos.canceladas += t.canceladas;
      datos.aRevisar += t.aRevisar;
      datos.noIdentificados += t.noIdentificados;
    };

    const revisadas = new Set<string>();
    for (const fuenteId of await fuentesPendientes()) {
      try {
        const r = await avanzarFuente(fuenteId, { alcance, corridaId: id });
        if (r.totales) {
          revisadas.add(r.compania);
          cuotasActualizadas += r.actualizadas ?? 0;
          sumar(r.totales);
        }
      } catch {
        errores.push({ compania: null, codigo: "fuente", mensaje: `No se pudo procesar el listado #${fuenteId}.` });
      }
    }

    const companias = await companiasConCuotasAbiertas();
    for (const [i, compania] of companias.entries()) {
      await progreso(id, 10 + (80 * i) / Math.max(1, companias.length));
      try {
        const r = await traerDeConectores(compania, periodo, id, alcance);
        if (r.estado === "ok") {
          revisadas.add(compania);
          cuotasActualizadas += r.actualizadas;
          sumar(r.totales);
        } else if (r.estado === "error") {
          errores.push(r.error);
        }
      } catch {
        errores.push({ compania, codigo: "interno", mensaje: "Falló el cruce con la cartera: se reintenta en la próxima corrida." });
      }
    }

    const estados = await recalcularEstados(hoy, alcance);
    datos.companias = revisadas.size;
    datos.porVencer = estados.porVencer;
    datos.vencidas = estados.vencidas;
  } catch {
    errores.push({ compania: null, codigo: "interno", mensaje: "La corrida se cortó por un error interno; se reintenta en la próxima." });
  }
  return terminar(id, { errores, resumen: resumenDeCorrida(datos), cuotasActualizadas, companiasProcesadas: datos.companias }, origen, "validacion");
}

/** Los casos "a revisar" sin explicar: Sonnet explica y sugiere; nada se aplica solo. */
async function explicarCasos(alcance: AlcanceValidador): Promise<{ costoUsd: number; explicados: string[] }> {
  const p = schema.validadorPagosDetectados;
  const casos = await db.select().from(p)
    .where(and(eq(p.estado, "a_revisar"), isNull(p.explicacion), isNull(p.revisadoEl)))
    .orderBy(desc(p.creadoEl)).limit(CASOS_POR_CORRIDA);
  const ids = [...new Set(casos.flatMap((caso) => caso.candidatos.map((cand) => cand.cuotaId)))];
  const cuotas = ids.length
    ? await db.select({
        id: schema.cuotas.id,
        poliza: schema.polizas.numero,
        item: schema.cuotas.item,
        numero: schema.cuotas.numero,
        cantidad: schema.polizas.cantidadCuotas,
        monto: schema.cuotas.monto,
        moneda: schema.cuotas.moneda,
        vencimiento: schema.cuotas.vencimiento,
        estado: schema.cuotas.estadoValidacion,
      }).from(schema.cuotas).innerJoin(schema.polizas, eq(schema.polizas.id, schema.cuotas.polizaId)).where(inArray(schema.cuotas.id, ids))
    : [];
  const cuotaDe = new Map(cuotas.map((q) => [q.id, q]));
  let costoUsd = 0;
  const explicados: string[] = [];
  for (const caso of casos) {
    const r = await explicarCaso({
      pago: caso.datos,
      motivo: caso.motivo ?? "",
      candidatos: caso.candidatos.map((cand) => ({ ...cand, cuota: cuotaDe.get(cand.cuotaId) ?? null })),
    }, alcance);
    costoUsd += r.costoUsd;
    if (!r.ok) continue;
    await db.update(p).set({ explicacion: r.datos.explicacion, accionPropuesta: r.datos.accion, cuotaSugeridaId: r.datos.cuotaSugeridaId }).where(eq(p.id, caso.id));
    explicados.push(r.datos.explicacion);
  }
  return { costoUsd, explicados };
}

/**
 * Pasos 6 a 8 (hora de enriquecimiento): procesa la cola de IA del Validador
 * (listados y comprobantes subidos), explica los casos a revisar y deja el
 * resumen del día. Sin IA, solo procesa lo que no la necesita y el resumen es
 * el de la validación. Las notificaciones por WhatsApp o email se suman con
 * la pantalla de Configuración.
 */
export async function correrEnriquecimiento(id: number, origen: Origen, alcance: AlcanceValidador) {
  const errores: ErrorCorridaValidador[] = [];
  let costoIaUsd = 0;
  let resumen = "No había nada para enriquecer.";
  try {
    const cola = await procesarTrabajos(MANEJADORES_VALIDADOR, { limite: 30, tiempoMs: 120_000 });
    if (cola.errores) errores.push({ compania: null, codigo: "ia", mensaje: `${cola.errores === 1 ? "Un archivo no se pudo" : `${cola.errores} archivos no se pudieron`} leer con IA: quedan para cargar a mano.` });
    await progreso(id, 40);

    let explicados: string[] = [];
    if (await iaDisponible(OPERACIONES_IA.explicar, alcance)) {
      const r = await explicarCasos(alcance);
      costoIaUsd += r.costoUsd;
      explicados = r.explicados;
    }
    await progreso(id, 80);

    const [validacion] = await db.select({ resumen: c.resumen }).from(c)
      .where(and(eq(c.etapa, "validacion"), eq(c.estado, "ok"))).orderBy(desc(c.terminadaEl)).limit(1);
    resumen = validacion?.resumen ?? resumen;
    if (await iaDisponible(OPERACIONES_IA.resumir, alcance)) {
      const r = await resumirCorrida({ resumenBase: resumen, casos: explicados }, alcance);
      costoIaUsd += r.costoUsd;
      if (r.ok) resumen = r.datos.resumen;
    }
  } catch {
    errores.push({ compania: null, codigo: "interno", mensaje: "El enriquecimiento se cortó por un error interno; se reintenta en la próxima corrida." });
  }
  return terminar(id, { errores, resumen, costoIaUsd }, origen, "enriquecimiento");
}
