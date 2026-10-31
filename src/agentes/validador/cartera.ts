import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EstadoCuota, EstadoValidacion, OrigenConfirmacion } from "@/db/schema";
import type { Moneda } from "@/lib/conectores/tipos";
import { diaEnArgentina } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import { companiaCanonica } from "@/lib/importacion";
import { resolverConfigValidador, type ConfigValidador } from "@/lib/validador/configuracion";
import { calcularEstado, estadoCuotaDe, ETIQUETA_MEDIO } from "@/lib/validador/estados";
import { resolverGracia, type FilaGracia, type Gracia } from "@/lib/validador/gracia";
import type { CuotaParaProcesar, ResultadoProceso } from "@/lib/validador/procesar";
import { cortarCobranza, cuotasDeCobrosCerrados } from "../cobros";

// El Validador contra la cartera: lee las cuotas para el cruce, guarda lo que
// informó cada fuente, aplica los cambios y recalcula los estados con la
// gracia. Las reglas son puras y están en src/lib/validador.

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AlcanceValidador = { orgId: string | null; producerId: string | null };
/** La cartera todavía no es multi-organización: cuotas y pólizas no tienen org_id. */
export const ALCANCE_CARTERA: AlcanceValidador = { orgId: null, producerId: null };

const { cuotas, polizas } = schema;
const TANDA = 500;

function enTandas<T>(lista: T[]): T[][] {
  const tandas: T[][] = [];
  for (let i = 0; i < lista.length; i += TANDA) tandas.push(lista.slice(i, i + TANDA));
  return tandas;
}

export async function configValidador(alcance: AlcanceValidador = ALCANCE_CARTERA): Promise<ConfigValidador> {
  const filas = await db.select().from(schema.validadorConfig);
  return resolverConfigValidador(filas, alcance);
}

export async function filasGracia(): Promise<FilaGracia[]> {
  return db.select().from(schema.validadorGracia);
}

/**
 * La gracia de cada cuota según su compañía y ramo, para Cobranza y para el
 * cálculo de estados. Sin fila para la compañía, no hay gracia.
 */
export async function graciaDeLaCartera(alcance: AlcanceValidador = ALCANCE_CARTERA): Promise<(compania: string | null, ramo: string) => Gracia> {
  const [filas, config] = await Promise.all([filasGracia(), configValidador(alcance)]);
  const cache = new Map<string, Gracia>();
  return (compania, ramo) => {
    const clave = `${compania ?? ""}|${ramo}`;
    let gracia = cache.get(clave);
    if (!gracia) {
      gracia = resolverGracia(filas, { compania: compania ?? "", ramo, ...alcance }, config.graciaHabilitada);
      cache.set(clave, gracia);
    }
    return gracia;
  };
}

/** Los nombres con que figura una compañía en la cartera ("SANCOR", "Sancor Seguros"…). */
async function nombresEnCartera(compania: string): Promise<string[]> {
  const filas = await db.selectDistinct({ compania: polizas.compania }).from(polizas).where(isNotNull(polizas.compania));
  const canonica = companiaCanonica(compania);
  return filas.map((f) => f.compania!).filter((n) => companiaCanonica(n) === canonica);
}

/** Las compañías de la cartera con cuotas que el Validador sigue (no pagadas ni canceladas). */
export async function companiasConCuotasAbiertas(): Promise<string[]> {
  const filas = await db
    .selectDistinct({ compania: polizas.compania })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .where(and(isNotNull(polizas.compania), ne(cuotas.estado, "pagada"), or(isNull(cuotas.estadoValidacion), ne(cuotas.estadoValidacion, "cancelada"))));
  return [...new Set(filas.map((f) => companiaCanonica(f.compania!)))].sort();
}

/** Las cuotas de una compañía, como las necesita el cruce. */
export async function cuotasDeCompania(compania: string): Promise<CuotaParaProcesar[]> {
  const nombres = await nombresEnCartera(compania);
  if (!nombres.length) return [];
  const filas = await db
    .select({
      id: cuotas.id,
      compania: polizas.compania,
      poliza: polizas.numero,
      item: cuotas.item,
      endoso: cuotas.endoso,
      numero: cuotas.numero,
      cantidadCuotas: polizas.cantidadCuotas,
      cupon: cuotas.cupon,
      monto: cuotas.monto,
      moneda: cuotas.moneda,
      vencimiento: cuotas.vencimiento,
      estado: cuotas.estado,
      estadoValidacion: cuotas.estadoValidacion,
      origenConfirmacion: cuotas.origenConfirmacion,
    })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .where(inArray(polizas.compania, nombres));
  return filas.map(({ estado, estadoValidacion, ...c }) => ({
    ...c,
    pagada: estado === "pagada" || estadoValidacion === "pagada",
    cancelada: estadoValidacion === "cancelada",
  }));
}

export type DatosGuardado = {
  fuenteId: number;
  corridaId: number | null;
  compania: string;
  /** archivo → origen "listado"; api o portal → "portal". */
  tipo: "api" | "portal" | "archivo";
  resultado: ResultadoProceso;
  alcance: AlcanceValidador;
};

/**
 * Guarda cada pago detectado y aplica los cambios en una sola transacción.
 * Nunca pisa una cuota pagada ni una cancelada (la condición está también en
 * el UPDATE, por si cambió mientras tanto). Las cuotas que quedan pagadas o
 * canceladas cortan su secuencia de cobranza. Devuelve cuántas cambiaron.
 */
export async function guardarProceso(datos: DatosGuardado, ahora = new Date()): Promise<number> {
  const { resultado, alcance } = datos;
  const origen: OrigenConfirmacion = datos.tipo === "archivo" ? "listado" : "portal";
  const hoy = diaEnArgentina(ahora);

  return db.transaction(async (tx) => {
    for (const tanda of enTandas(resultado.pagos)) {
      await tx.insert(schema.validadorPagosDetectados).values(tanda.map((p) => ({
        fuenteId: datos.fuenteId,
        corridaId: datos.corridaId,
        fila: p.fila,
        original: p.original,
        datos: p.pago,
        cuotaId: p.cuotaId,
        puntaje: p.puntaje,
        estado: p.estado,
        candidatos: p.candidatos,
        cambio: p.cambio?.tipo ?? null,
        motivo: p.motivo,
        ...alcance,
      })));
    }

    const actualizadas: number[] = [];
    for (const cambio of resultado.cambios) {
      const abierta = and(eq(cuotas.id, cambio.cuotaId), ne(cuotas.estado, "pagada"), or(isNull(cuotas.estadoValidacion), ne(cuotas.estadoValidacion, "cancelada")));
      const filas = cambio.tipo === "marcar_pagada"
        ? await tx.update(cuotas).set({
            estado: "pagada",
            estadoValidacion: "pagada",
            pagadaEl: ahora,
            fechaPago: cambio.fechaPago,
            medioPago: cambio.medio ? ETIQUETA_MEDIO[cambio.medio] : `Informado por ${datos.compania}`,
            origenConfirmacion: origen,
            ultimaRevision: ahora,
          }).where(abierta).returning({ id: cuotas.id })
        : await tx.update(cuotas).set({
            estadoValidacion: "cancelada",
            canceladaEl: cambio.fecha ?? hoy,
            motivoCancelacion: cambio.motivo,
            ultimaRevision: ahora,
          }).where(abierta).returning({ id: cuotas.id });
      actualizadas.push(...filas.map((f) => f.id));
    }
    for (const tanda of enTandas(resultado.revisadas)) {
      await tx.update(cuotas).set({ ultimaRevision: ahora }).where(inArray(cuotas.id, tanda));
    }

    await anotarEnLasFichas(tx, actualizadas, datos.compania, resultado);
    const cerradas = await cuotasDeCobrosCerrados(tx, actualizadas);
    await cortarCobranza(tx, cerradas, `${datos.compania} informó el pago (Validador de pagos).`, ahora);
    return actualizadas.length;
  });
}

/** Una nota en la ficha del asegurado por cada cuota que pagó o se canceló. */
async function anotarEnLasFichas(tx: Transaccion, ids: number[], compania: string, resultado: ResultadoProceso) {
  if (!ids.length) return;
  const cambioDe = new Map(resultado.cambios.map((c) => [c.cuotaId, c]));
  const filas = await tx
    .select({ id: cuotas.id, numero: cuotas.numero, monto: cuotas.monto, moneda: cuotas.moneda, aseguradoId: polizas.aseguradoId, ramo: polizas.ramo })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .where(inArray(cuotas.id, ids));
  const notas = filas.map((f) => {
    const cambio = cambioDe.get(f.id);
    const cuota = `la cuota ${f.numero} de ${f.ramo.toLowerCase()} (${importe(f.monto, f.moneda as Moneda)})`;
    return {
      aseguradoId: f.aseguradoId,
      tipo: "sistema",
      texto: cambio?.tipo === "marcar_cancelada" ? `${compania} canceló ${cuota}: ${cambio.motivo}` : `${compania} informó el pago de ${cuota}.`,
    };
  });
  for (const tanda of enTandas(notas)) await tx.insert(schema.notasAsegurado).values(tanda);
}

/**
 * Paso 4 de la corrida: el estado de cada cuota con la gracia de su compañía
 * y ramo, y cuotas.estado sincronizado para Inicio y Estadísticas. Lo usa
 * también el cron de Cobranza. Devuelve lo que vence esta semana y lo vencido.
 */
export async function recalcularEstados(hoy: string, alcance: AlcanceValidador = ALCANCE_CARTERA): Promise<{ porVencer: number; vencidas: number; cambiadas: number }> {
  const [filas, graciaDe] = await Promise.all([
    db
      .select({
        id: cuotas.id,
        numero: cuotas.numero,
        vencimiento: cuotas.vencimiento,
        estado: cuotas.estado,
        estadoValidacion: cuotas.estadoValidacion,
        compania: polizas.compania,
        ramo: polizas.ramo,
      })
      .from(cuotas)
      .innerJoin(polizas, eq(polizas.id, cuotas.polizaId)),
    graciaDeLaCartera(alcance),
  ]);

  const grupos = new Map<string, { estadoValidacion: EstadoValidacion; estado: EstadoCuota; ids: number[] }>();
  let porVencer = 0;
  let vencidas = 0;
  for (const f of filas) {
    const { estado } = calcularEstado(
      { numero: f.numero, vencimiento: f.vencimiento, pagada: f.estado === "pagada" || f.estadoValidacion === "pagada", cancelada: f.estadoValidacion === "cancelada" },
      { hoy, gracia: graciaDe(f.compania, f.ramo) },
    );
    if (estado === "por_vencer") porVencer++;
    if (estado === "vencida") vencidas++;
    const estadoCuota = estadoCuotaDe(estado) ?? f.estado;
    if (estado === f.estadoValidacion && estadoCuota === f.estado) continue;
    const clave = `${estado}|${estadoCuota}`;
    const grupo = grupos.get(clave) ?? { estadoValidacion: estado, estado: estadoCuota, ids: [] };
    grupo.ids.push(f.id);
    grupos.set(clave, grupo);
  }

  let cambiadas = 0;
  for (const grupo of grupos.values()) {
    for (const tanda of enTandas(grupo.ids)) {
      await db.update(cuotas).set({ estadoValidacion: grupo.estadoValidacion, estado: grupo.estado }).where(inArray(cuotas.id, tanda));
      cambiadas += tanda.length;
    }
  }
  return { porVencer, vencidas, cambiadas };
}
