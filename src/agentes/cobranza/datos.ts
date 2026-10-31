import "server-only";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CobranzaEvento } from "@/db/schema";
import { leerReferencia } from "@/lib/cobranza";
import { canalesDisponibles, contactoParaCobranza, diaEnZona, motivoParaNoContactar } from "@/lib/cobranza/reglas";
import { tramoDe } from "@/lib/cobranza/tramos";
import type { ConfiguracionCobranza, EstadoCaso } from "@/lib/cobranza/tipos";
import { diasEntre } from "@/lib/fechas";
import { casosDeCuotas } from "./casos";

// Lecturas de Cobranza para el tablero, el detalle, el motor y la API. Monto,
// compañía y vencimiento salen de la cartera: el monto es el de todas las
// cuotas del cobro que la compañía no anuló.

type FilaSql = {
  id: number;
  cuota_id: number;
  asegurado_id: number;
  estado: EstadoCaso;
  motivo: string | null;
  intentos: number;
  ultimo_contacto_el: string | null;
  promesa_el: string | null;
  pagado_el: string | null;
  incluir_igual: boolean;
  es_ejemplo: boolean;
  creado_el: string;
  actualizado_el: string;
  asegurado: string;
  tipo: "persona" | "empresa";
  documento: string | null;
  telefono: string | null;
  email: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  compania: string | null;
  poliza_id: number;
  poliza_numero: string | null;
  ramo: string;
  cantidad_cuotas: number;
  forma_pago: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  cuota_numero: number;
  cupon: string | null;
  endoso: string | null;
  item: string | null;
  moneda: string;
  vencimiento: string;
  medio_pago: string | null;
  monto: string;
  cantidad: number;
  polizas: number;
  no_contactar: "manual" | "baja" | null;
  borrador_pendiente: boolean;
};

export type CasoCobranza = {
  id: number;
  cuotaId: number;
  aseguradoId: number;
  estado: EstadoCaso;
  motivo: string | null;
  intentos: number;
  ultimoContactoEl: Date | null;
  promesaEl: string | null;
  pagadoEl: Date | null;
  incluirIgual: boolean;
  esEjemplo: boolean;
  creadoEl: Date;
  asegurado: { nombre: string; tipo: "persona" | "empresa"; documento: string | null; contactoNombre: string | null; telefono: string | null; email: string | null; contactoTelefono: string | null; contactoEmail: string | null };
  /** Teléfono y correo que usa el agente (en empresas, administración primero). */
  contacto: { telefono: string | null; email: string | null };
  compania: string | null;
  polizaId: number;
  polizaNumero: string | null;
  ramo: string;
  cuota: { numero: number; de: number };
  /** Cupón de la compañía o, si no informa, "cuota n/N". */
  recibo: string;
  endoso: string | null;
  formaPago: string | null;
  vigencia: { desde: string | null; hasta: string | null };
  moneda: string;
  vencimiento: string;
  monto: number;
  /** Cuántas cuotas y pólizas se cobran juntas en este caso. */
  cuotas: number;
  polizas: number;
  noContactar: "manual" | "baja" | null;
  borradorPendiente: boolean;
};

const fecha = (v: string | null) => (v ? new Date(v) : null);

function casoDeFila(f: FilaSql): CasoCobranza {
  return {
    id: Number(f.id),
    cuotaId: Number(f.cuota_id),
    aseguradoId: Number(f.asegurado_id),
    estado: f.estado,
    motivo: f.motivo,
    intentos: Number(f.intentos),
    ultimoContactoEl: fecha(f.ultimo_contacto_el),
    promesaEl: f.promesa_el,
    pagadoEl: fecha(f.pagado_el),
    incluirIgual: f.incluir_igual,
    esEjemplo: f.es_ejemplo,
    creadoEl: new Date(f.creado_el),
    asegurado: {
      nombre: f.asegurado,
      tipo: f.tipo,
      documento: f.documento,
      contactoNombre: f.contacto_nombre,
      telefono: f.telefono,
      email: f.email,
      contactoTelefono: f.contacto_telefono,
      contactoEmail: f.contacto_email,
    },
    contacto: contactoParaCobranza({ tipo: f.tipo, telefono: f.telefono, email: f.email, contactoTelefono: f.contacto_telefono, contactoEmail: f.contacto_email }),
    compania: f.compania,
    polizaId: Number(f.poliza_id),
    polizaNumero: f.poliza_numero,
    ramo: f.ramo,
    cuota: { numero: Number(f.cuota_numero), de: Number(f.cantidad_cuotas) },
    recibo: f.cupon || `Cuota ${f.cuota_numero}/${f.cantidad_cuotas}`,
    endoso: f.endoso || f.item || null,
    formaPago: f.forma_pago || f.medio_pago,
    vigencia: { desde: f.vigencia_desde, hasta: f.vigencia_hasta },
    moneda: f.moneda,
    vencimiento: f.vencimiento,
    monto: Math.round(Number(f.monto) * 100) / 100,
    cuotas: Number(f.cantidad),
    polizas: Number(f.polizas),
    noContactar: f.no_contactar,
    borradorPendiente: f.borrador_pendiente,
  };
}

function consultaCasos(donde: ReturnType<typeof sql>) {
  return sql`
    select k.id, k.cuota_id, k.asegurado_id, k.estado, k.motivo, k.intentos, k.ultimo_contacto_el, k.promesa_el, k.pagado_el,
           k.incluir_igual, k.es_ejemplo, k.creado_el, k.actualizado_el,
           a.nombre as asegurado, a.tipo, a.documento, a.telefono, a.email, a.contacto_nombre, a.contacto_telefono, a.contacto_email,
           p.compania, p.id as poliza_id, p.numero as poliza_numero, p.ramo, p.cantidad_cuotas, p.forma_pago, p.vigencia_desde, p.vigencia_hasta,
           c.numero as cuota_numero, c.cupon, c.endoso, c.item, c.moneda, c.vencimiento, c.medio_pago,
           g.monto, g.cantidad, g.polizas,
           nc.motivo as no_contactar,
           exists (
             select 1 from cobranza_eventos e join mensajes m on m.id::text = e.datos ->> 'mensajeId'
             where e.caso_id = k.id and e.tipo in ('para_aprobar', 'llamada_pendiente') and m.estado = 'borrador'
           ) as borrador_pendiente
    from cobranza_casos k
    join cuotas c on c.id = k.cuota_id
    join polizas p on p.id = c.poliza_id
    join asegurados a on a.id = k.asegurado_id
    left join cobranza_no_contactar nc on nc.asegurado_id = k.asegurado_id
    cross join lateral (
      select coalesce(sum(cx.monto) filter (where coalesce(cx.estado_validacion, '') <> 'cancelada'), 0) as monto,
             count(*) as cantidad, count(distinct px.id) as polizas
      from cuotas cx join polizas px on px.id = cx.poliza_id
      where cx.vencimiento = c.vencimiento and px.asegurado_id = p.asegurado_id and coalesce(px.compania, '') = coalesce(p.compania, '')
    ) g
    where ${donde}
    order by c.vencimiento, k.id
  `;
}

/** Todos los casos menos los pagados antes de `pagadosDesde` (los del mes siguen en el tablero). */
export async function listarCasos(pagadosDesde: Date): Promise<CasoCobranza[]> {
  const filas = await db.execute<FilaSql>(consultaCasos(sql`(k.estado <> 'pagado' or k.pagado_el >= ${pagadosDesde.toISOString()})`));
  return [...filas].map(casoDeFila);
}

export async function obtenerCaso(id: number): Promise<CasoCobranza | null> {
  const [fila] = [...(await db.execute<FilaSql>(consultaCasos(sql`k.id = ${id}`)))];
  return fila ? casoDeFila(fila) : null;
}

export async function obtenerCasosPorId(ids: number[]): Promise<CasoCobranza[]> {
  if (!ids.length) return [];
  const filas = await db.execute<FilaSql>(consultaCasos(sql`k.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`));
  return [...filas].map(casoDeFila);
}

/** Lo que el motor y la pantalla calculan de cada caso para hoy. */
export function situacionDelCaso(caso: CasoCobranza, config: ConfiguracionCobranza, hoy: string) {
  const diasParaVencer = diasEntre(hoy, caso.vencimiento);
  const tramo = tramoDe(diasParaVencer, config.tramos);
  const canales = canalesDisponibles(caso.contacto, config);
  const motivo =
    motivoParaNoContactar(
      { estado: caso.estado, intentos: caso.intentos, ultimoContactoEl: caso.ultimoContactoEl, promesaEl: caso.promesaEl, diasParaVencer, noContactar: Boolean(caso.noContactar), borradorPendiente: caso.borradorPendiente },
      config,
      hoy,
    ) ?? (canales.length ? null : ("sin_canal" as const));
  return { diasParaVencer, tramo, canales, motivoNoContactar: motivo };
}

/** Las cuotas que forman el cobro del caso (para el detalle). */
export async function cuotasDelCaso(caso: Pick<CasoCobranza, "cuotaId">) {
  const filas = await db.execute<{ id: number; numero: number; monto: string; moneda: string; estado: string; estado_validacion: string | null; ramo: string; poliza: string | null; item: string | null; cantidad_cuotas: number }>(sql`
    select cx.id, cx.numero, cx.monto, cx.moneda, cx.estado, cx.estado_validacion, px.ramo, px.numero as poliza, cx.item, px.cantidad_cuotas
    from cuotas c join polizas p on p.id = c.poliza_id
    join cuotas cx on cx.vencimiento = c.vencimiento
    join polizas px on px.id = cx.poliza_id and px.asegurado_id = p.asegurado_id and coalesce(px.compania, '') = coalesce(p.compania, '')
    where c.id = ${caso.cuotaId}
    order by cx.id
  `);
  return [...filas].map((f) => ({ ...f, monto: Number(f.monto) }));
}

export async function eventosDelCaso(casoId: number, limite = 200): Promise<CobranzaEvento[]> {
  return db.select().from(schema.cobranzaEventos).where(eq(schema.cobranzaEventos.casoId, casoId)).orderBy(desc(schema.cobranzaEventos.creadoEl), desc(schema.cobranzaEventos.id)).limit(limite);
}

/** Los últimos eventos de varios casos (para el contexto de la IA). */
export async function ultimosEventos(casoIds: number[], porCaso = 5): Promise<Map<number, CobranzaEvento[]>> {
  if (!casoIds.length) return new Map();
  const filas = await db
    .select()
    .from(schema.cobranzaEventos)
    .where(inArray(schema.cobranzaEventos.casoId, casoIds))
    .orderBy(desc(schema.cobranzaEventos.creadoEl), desc(schema.cobranzaEventos.id));
  const salida = new Map<number, CobranzaEvento[]>();
  for (const e of filas) {
    const lista = salida.get(e.casoId) ?? [];
    if (lista.length < porCaso) salida.set(e.casoId, [...lista, e]);
  }
  return salida;
}

/**
 * Lo que espera aprobación (agente y Validador), lo más viejo primero, con su
 * caso. Los pospuestos aparecen desde su día.
 */
export async function pendientesDeAprobacion(hoy: string) {
  const mensajes = await db
    .select({
      id: schema.mensajes.id,
      canal: schema.mensajes.canal,
      destinatario: schema.mensajes.destinatario,
      asunto: schema.mensajes.asunto,
      texto: schema.mensajes.texto,
      motivo: schema.mensajes.motivo,
      referencia: schema.mensajes.referencia,
      creadoEl: schema.mensajes.creadoEl,
      tipo: schema.asegurados.tipo,
      contactoNombre: schema.asegurados.contactoNombre,
    })
    .from(schema.mensajes)
    .leftJoin(schema.asegurados, eq(schema.asegurados.id, schema.mensajes.aseguradoId))
    .where(
      and(
        eq(schema.mensajes.estado, "borrador"),
        inArray(schema.mensajes.agente, ["cobranza", "validador"]),
        or(isNull(schema.mensajes.mostrarDesde), lte(schema.mensajes.mostrarDesde, hoy)),
      ),
    )
    .orderBy(schema.mensajes.creadoEl);
  if (!mensajes.length) return [];
  const ligados = await db
    .select({ casoId: schema.cobranzaEventos.casoId, mensajeId: sql<string>`${schema.cobranzaEventos.datos} ->> 'mensajeId'` })
    .from(schema.cobranzaEventos)
    .where(
      and(
        inArray(schema.cobranzaEventos.tipo, ["para_aprobar", "llamada_pendiente"]),
        sql`${schema.cobranzaEventos.datos} ->> 'mensajeId' in (${sql.join(mensajes.map((m) => sql`${String(m.id)}`), sql`, `)})`,
      ),
    );
  const casoPorMensaje = new Map<number, number[]>();
  for (const l of ligados) casoPorMensaje.set(Number(l.mensajeId), [...(casoPorMensaje.get(Number(l.mensajeId)) ?? []), l.casoId]);
  for (const m of mensajes) {
    if (casoPorMensaje.has(m.id)) continue;
    const ref = leerReferencia(m.referencia);
    if (ref) casoPorMensaje.set(m.id, (await casosDeCuotas([ref.cuotaId])).map((k) => k.id));
  }
  const casos = new Map((await obtenerCasosPorId([...new Set([...casoPorMensaje.values()].flat())])).map((k) => [k.id, k]));
  return mensajes.map((m) => ({ ...m, casos: (casoPorMensaje.get(m.id) ?? []).map((id) => casos.get(id)).filter((k): k is CasoCobranza => Boolean(k)) }));
}

export const diaLocal = (config: ConfiguracionCobranza) => (d: Date) => diaEnZona(d, config.zonaHoraria);
