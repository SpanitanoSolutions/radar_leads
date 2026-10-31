import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CobranzaCaso } from "@/db/schema";
import { filaDeConfig, resolverConfigCobranza } from "@/lib/cobranza/configuracion";
import { REACTIVABLES } from "@/lib/cobranza/estados";
import { contactoParaCobranza, estadoSincronizado, promesaVencida } from "@/lib/cobranza/reglas";
import type { CanalCobranza, ConfiguracionCobranza, EstadoCaso, TipoEventoCobranza } from "@/lib/cobranza/tipos";
import { diaYMes, sumarDias } from "@/lib/fechas";

// Los casos de cobranza y lo que les pasa: la configuración, la línea de
// tiempo, la sincronización con la cartera y las acciones del productor, del
// Validador y del agente. Un caso es un cobro y apunta a su primera cuota.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = Tx | typeof db;

/** Hoy hay una sola cartera (sin organización ni productor), como en el Validador. */
export const ALCANCE_COBRANZA = { orgId: null, producerId: null } as const;

const { cobranzaCasos: casos, cobranzaEventos: eventos, asegurados } = schema;

// ---------- Configuración ----------

export async function leerConfigCobranza(dbx: Db = db): Promise<ConfiguracionCobranza> {
  const [fila] = await dbx
    .select()
    .from(schema.cobranzaConfig)
    .where(and(isNull(schema.cobranzaConfig.orgId), isNull(schema.cobranzaConfig.producerId)));
  return resolverConfigCobranza(fila);
}

export async function guardarConfigCobranza(config: ConfiguracionCobranza) {
  const valores = { ...filaDeConfig(config), actualizadoEl: new Date() };
  const [fila] = await db
    .select({ id: schema.cobranzaConfig.id })
    .from(schema.cobranzaConfig)
    .where(and(isNull(schema.cobranzaConfig.orgId), isNull(schema.cobranzaConfig.producerId)));
  if (fila) await db.update(schema.cobranzaConfig).set(valores).where(eq(schema.cobranzaConfig.id, fila.id));
  else await db.insert(schema.cobranzaConfig).values({ ...valores, ...ALCANCE_COBRANZA });
}

// ---------- Eventos ----------

export type NuevoEvento = {
  casoId: number;
  tipo: TipoEventoCobranza;
  resumen: string;
  canal?: CanalCobranza | null;
  datos?: Record<string, unknown>;
  esPrueba?: boolean;
  corridaId?: number | null;
  creadoEl?: Date;
};

export async function registrarEventos(nuevos: NuevoEvento[], dbx: Db = db) {
  if (!nuevos.length) return;
  await dbx.insert(eventos).values(
    nuevos.map((e) => ({
      casoId: e.casoId,
      tipo: e.tipo,
      resumen: e.resumen,
      canal: e.canal ?? null,
      datos: e.datos ?? {},
      esPrueba: e.esPrueba ?? false,
      corridaId: e.corridaId ?? null,
      ...(e.creadoEl ? { creadoEl: e.creadoEl } : {}),
    })),
  );
}

/** Cambia el estado (y lo que se pase) de varios casos y les deja el mismo evento. */
export async function actualizarCasos(
  ids: number[],
  cambios: Partial<Pick<CobranzaCaso, "estado" | "motivo" | "intentos" | "ultimoContactoEl" | "promesaEl" | "pagadoEl" | "incluirIgual">>,
  evento: Omit<NuevoEvento, "casoId"> | null,
  dbx: Db = db,
) {
  if (!ids.length) return;
  await dbx.update(casos).set({ ...cambios, actualizadoEl: new Date() }).where(inArray(casos.id, ids));
  if (evento) await registrarEventos(ids.map((casoId) => ({ ...evento, casoId })), dbx);
}

// ---------- De cuotas a casos ----------

/**
 * Los casos de estas cuotas: los de su mismo cobro (asegurado, compañía y
 * vencimiento), aunque el caso apunte a otra cuota del grupo.
 */
export async function casosDeCuotas(ids: number[], dbx: Db = db): Promise<CobranzaCaso[]> {
  if (!ids.length) return [];
  const filas = await dbx.execute<{ id: number }>(sql`
    select distinct k.id
    from cobranza_casos k
    join cuotas ck on ck.id = k.cuota_id
    join polizas pk on pk.id = ck.poliza_id
    join cuotas cx on cx.vencimiento = ck.vencimiento
    join polizas px on px.id = cx.poliza_id and px.asegurado_id = pk.asegurado_id and coalesce(px.compania, '') = coalesce(pk.compania, '')
    where cx.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
  const casoIds = [...filas].map((f) => Number(f.id));
  return casoIds.length ? dbx.select().from(casos).where(inArray(casos.id, casoIds)) : [];
}

/** Ids de todas las cuotas del cobro de esta cuota (pagadas incluidas). */
async function cuotasDelGrupo(cuotaId: number, dbx: Db = db): Promise<{ id: number; aseguradoId: number; esEjemplo: boolean }[]> {
  const filas = await dbx.execute<{ id: number; asegurado_id: number; es_ejemplo: boolean }>(sql`
    select cx.id, px.asegurado_id, a.es_ejemplo
    from cuotas c
    join polizas p on p.id = c.poliza_id
    join cuotas cx on cx.vencimiento = c.vencimiento
    join polizas px on px.id = cx.poliza_id and px.asegurado_id = p.asegurado_id and coalesce(px.compania, '') = coalesce(p.compania, '')
    join asegurados a on a.id = px.asegurado_id
    where c.id = ${cuotaId}
    order by cx.id
  `);
  return [...filas].map((f) => ({ id: Number(f.id), aseguradoId: Number(f.asegurado_id), esEjemplo: Boolean(f.es_ejemplo) }));
}

/** El caso del cobro de esta cuota; si todavía no existe, lo crea pendiente (la sincronización lo ajusta). */
export async function asegurarCaso(cuotaId: number, dbx: Db = db): Promise<CobranzaCaso> {
  const [existente] = await casosDeCuotas([cuotaId], dbx);
  if (existente) return existente;
  const grupo = await cuotasDelGrupo(cuotaId, dbx);
  if (!grupo.length) throw new Error("Cuota inexistente");
  await dbx
    .insert(casos)
    .values({ cuotaId: grupo[0].id, aseguradoId: grupo[0].aseguradoId, esEjemplo: grupo[0].esEjemplo, ...ALCANCE_COBRANZA })
    .onConflictDoNothing();
  const [creado] = await dbx.select().from(casos).where(eq(casos.cuotaId, grupo[0].id));
  return creado;
}

// ---------- Sincronización con la cartera ----------

type FilaCuota = {
  id: number;
  monto: string | number;
  moneda: string;
  vencimiento: string;
  estado: string;
  estado_validacion: string | null;
  poliza_baja: boolean;
  ramo: string;
  compania: string | null;
  asegurado_id: number;
  tipo: "persona" | "empresa";
  telefono: string | null;
  email: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  es_ejemplo: boolean;
};

/**
 * Pone los casos al día con la cartera: crea los de los cobros impagos que
 * vencen desde hace 60 días hasta dentro de 30, pasa a pagado lo que se pagó,
 * aplica los filtros de la configuración y la falta de contacto, y retoma las
 * promesas vencidas. Solo toca los estados automáticos (src/lib/cobranza/reglas.ts).
 * Cada cambio deja su evento. Devuelve cuántos casos creó y cuántos cambió.
 */
export async function sincronizarCasos(hoy: string, config?: ConfiguracionCobranza): Promise<{ creados: number; cambiados: number }> {
  const cfg = config ?? (await leerConfigCobranza());
  const desde = sumarDias(hoy, -60);
  const hasta = sumarDias(hoy, 30);
  const filas = [
    ...(await db.execute<FilaCuota>(sql`
    select c.id, c.monto, c.moneda, c.vencimiento, c.estado, c.estado_validacion, (p.baja_el is not null) as poliza_baja,
           p.ramo, p.compania, a.id as asegurado_id, a.tipo, a.telefono, a.email, a.contacto_telefono, a.contacto_email, a.es_ejemplo
    from cuotas c
    join polizas p on p.id = c.poliza_id
    join asegurados a on a.id = p.asegurado_id
    where a.baja_el is null and (p.asegurado_id, c.vencimiento) in (
      select p2.asegurado_id, c2.vencimiento
      from cuotas c2 join polizas p2 on p2.id = c2.poliza_id
      where p2.baja_el is null and c2.estado <> 'pagada' and coalesce(c2.estado_validacion, '') not in ('pagada', 'cancelada')
        and c2.vencimiento between ${desde} and ${hasta}
      union
      select p3.asegurado_id, c3.vencimiento
      from cobranza_casos k join cuotas c3 on c3.id = k.cuota_id join polizas p3 on p3.id = c3.poliza_id
      where k.estado <> 'pagado' or k.pagado_el > now() - interval '60 days'
    )
    order by c.id
  `)),
  ];
  const grupos = new Map<string, FilaCuota[]>();
  for (const f of filas) {
    const clave = `${f.asegurado_id}|${f.compania ?? ""}|${f.vencimiento}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  const cabezas = [...grupos.values()].map((g) => g[0].id);
  const aseguradoIds = [...new Set(filas.map((f) => Number(f.asegurado_id)))];
  const [existentes, marcados] = await Promise.all([
    cabezas.length ? db.select().from(casos).where(inArray(casos.cuotaId, cabezas)) : Promise.resolve([]),
    aseguradoIds.length ? db.select().from(schema.cobranzaNoContactar).where(inArray(schema.cobranzaNoContactar.aseguradoId, aseguradoIds)) : Promise.resolve([]),
  ]);
  const porCuota = new Map(existentes.map((k) => [k.cuotaId, k]));
  const marca = new Map(marcados.map((m) => [m.aseguradoId, m.motivo]));

  let creados = 0;
  let cambiados = 0;
  const ahora = new Date();
  for (const grupo of grupos.values()) {
    const cabeza = grupo[0];
    const pagada = (f: FilaCuota) => f.estado === "pagada" || f.estado_validacion === "pagada";
    const cancelada = (f: FilaCuota) => f.estado_validacion === "cancelada";
    const vigentes = grupo.filter((f) => !cancelada(f));
    const contacto = contactoParaCobranza({
      tipo: cabeza.tipo,
      telefono: cabeza.telefono,
      email: cabeza.email,
      contactoTelefono: cabeza.contacto_telefono,
      contactoEmail: cabeza.contacto_email,
    });
    const cobro = {
      compania: cabeza.compania,
      ramos: [...new Set(grupo.map((f) => f.ramo))],
      monto: vigentes.reduce((s, f) => s + Number(f.monto), 0),
      pagado: vigentes.length > 0 && vigentes.every(pagada),
      cancelado: vigentes.length === 0,
      polizaDeBaja: grupo.every((f) => f.poliza_baja),
      tieneContacto: Boolean(contacto.telefono || contacto.email),
      noContactar: marca.get(Number(cabeza.asegurado_id)) ?? null,
    };
    const caso = porCuota.get(cabeza.id) ?? null;
    // Solo nacen casos de cobros que tienen algo para cobrar en la ventana.
    if (!caso && (cobro.pagado || cobro.cancelado || cobro.polizaDeBaja || grupo.every((f) => f.vencimiento < desde || f.vencimiento > hasta))) continue;
    const nuevo = estadoSincronizado(cobro, caso, cfg.filtros);
    if (!caso && nuevo) {
      const [creado] = await db
        .insert(casos)
        .values({ cuotaId: cabeza.id, aseguradoId: Number(cabeza.asegurado_id), estado: nuevo.estado, motivo: nuevo.motivo, esEjemplo: cabeza.es_ejemplo, ...ALCANCE_COBRANZA })
        .onConflictDoNothing()
        .returning({ id: casos.id });
      if (creado) creados++;
      continue;
    }
    if (!caso || !nuevo) continue;
    cambiados++;
    await actualizarCasos(
      [caso.id],
      { estado: nuevo.estado, motivo: nuevo.motivo, ...(nuevo.estado === "pagado" ? { pagadoEl: ahora } : {}), ...(caso.estado === "pagado" ? { pagadoEl: null } : {}) },
      eventoDeSincronizacion(caso.estado, nuevo.estado, nuevo.motivo),
    );
  }

  // Promesas que pasaron (con su gracia): el agente vuelve a escribir.
  const promesas = await db.select().from(casos).where(eq(casos.estado, "promesa"));
  const vencidas = promesas.filter((k) => promesaVencida(k, cfg, hoy));
  for (const k of vencidas) {
    await actualizarCasos([k.id], { estado: "sin_respuesta", motivo: null }, { tipo: "nota", resumen: `No pagó en la fecha prometida (${diaYMes(k.promesaEl!)}). El agente lo retoma.` });
  }
  return { creados, cambiados: cambiados + vencidas.length };
}

function eventoDeSincronizacion(antes: EstadoCaso, despues: EstadoCaso, motivo: string | null): Omit<NuevoEvento, "casoId"> {
  if (despues === "pagado") return { tipo: "pagado", resumen: "El recibo figura pagado en la cartera." };
  if (despues === "excluido") return { tipo: "excluido", resumen: motivo ?? "Quedó afuera por las reglas de la configuración." };
  if (despues === "sin_datos") return { tipo: "nota", resumen: "No tiene teléfono ni email: completá el contacto para que el agente le escriba." };
  if (antes === "pagado") return { tipo: "nota", resumen: motivo ?? "El recibo volvió a figurar impago." };
  return { tipo: "reactivado", resumen: antes === "sin_datos" ? "Ya tiene datos de contacto: vuelve a la gestión." : "Las reglas ahora lo incluyen: vuelve a la gestión." };
}

// ---------- Validador y pagos ----------

/**
 * El cobro se pagó: sus casos pasan a pagado y los borradores pendientes de
 * Cobranza se omiten. `texto` va a la línea de tiempo ("Pago confirmado por vos").
 */
export async function cerrarPorPago(tx: Tx, cuotaIds: number[], texto: string, ahora: Date) {
  const abiertos = (await casosDeCuotas(cuotaIds, tx)).filter((k) => k.estado !== "pagado");
  if (abiertos.length) {
    await actualizarCasos(abiertos.map((k) => k.id), { estado: "pagado", motivo: null, pagadoEl: ahora, promesaEl: null }, { tipo: "pagado", resumen: texto }, tx);
  }
  const cuotasDeCasos = [...new Set([...cuotaIds, ...abiertos.map((k) => k.cuotaId)])];
  const deEventos = abiertos.length
    ? await tx
        .select({ mensajeId: sql<number>`(${eventos.datos} ->> 'mensajeId')::int` })
        .from(eventos)
        .where(and(inArray(eventos.casoId, abiertos.map((k) => k.id)), eq(eventos.tipo, "para_aprobar")))
    : [];
  await tx
    .update(schema.mensajes)
    .set({ estado: "omitido" })
    .where(
      and(
        eq(schema.mensajes.estado, "borrador"),
        inArray(schema.mensajes.agente, ["cobranza", "validador"]),
        sql`(${schema.mensajes.id} in (${sql.join([0, ...deEventos.map((e) => e.mensajeId).filter(Boolean)].map((id) => sql`${id}`), sql`, `)})
          or ${schema.mensajes.referencia} similar to ${`cuota:(${cuotasDeCasos.join("|")}):%`})`,
      ),
    );
}

/**
 * El Validador frena la cobranza de un cobro: con promesa, el caso queda en
 * promesa hasta esa fecha; si no (pago incompleto, comprobante con problemas),
 * se escala al productor con el motivo.
 */
export async function pausarCaso(cuotaId: number, motivo: string, datos: { promesa?: string; contacto?: string } = {}) {
  const caso = await asegurarCaso(cuotaId);
  if (datos.promesa) {
    await actualizarCasos([caso.id], { estado: "promesa", promesaEl: datos.promesa, motivo }, { tipo: "promesa", resumen: `Prometió pagar el ${diaYMes(datos.promesa)}${datos.contacto ? ` (${datos.contacto})` : ""}.` });
    return;
  }
  await actualizarCasos([caso.id], { estado: "escalado", motivo }, { tipo: "validador", resumen: `${motivo}${datos.contacto ? ` · ${datos.contacto}` : ""}. El agente no le escribe hasta que lo reactives.` });
}

// ---------- Acciones del productor ----------

/** "Reactivar recibo": vuelve a la gestión desde cero. Una baja pedida por el asegurado no se reactiva. */
export async function reactivarCaso(casoId: number): Promise<"ok" | "no_reactivable" | "baja"> {
  const [caso] = await db.select().from(casos).where(eq(casos.id, casoId));
  if (!caso || !REACTIVABLES.includes(caso.estado)) return "no_reactivable";
  const [marca] = await db.select().from(schema.cobranzaNoContactar).where(eq(schema.cobranzaNoContactar.aseguradoId, caso.aseguradoId));
  if (marca?.motivo === "baja") return "baja";
  await actualizarCasos(
    [caso.id],
    { estado: "pendiente", motivo: null, intentos: 0, promesaEl: null, incluirIgual: caso.estado === "excluido" || caso.incluirIgual },
    { tipo: "reactivado", resumen: "Lo reactivaste: el agente lo vuelve a contactar desde el primer intento." },
  );
  return "ok";
}

/** Marca (o desmarca) a un asegurado para que el agente no le escriba. */
export async function cambiarNoContactar(aseguradoId: number, marcar: boolean, motivo: "manual" | "baja" = "manual", nota?: string) {
  if (marcar) {
    await db
      .insert(schema.cobranzaNoContactar)
      .values({ aseguradoId, motivo, nota: nota ?? null })
      .onConflictDoUpdate({ target: schema.cobranzaNoContactar.aseguradoId, set: { motivo, nota: nota ?? null, creadoEl: new Date() } });
  } else {
    await db.delete(schema.cobranzaNoContactar).where(eq(schema.cobranzaNoContactar.aseguradoId, aseguradoId));
  }
  const abiertos = await db
    .select({ id: casos.id })
    .from(casos)
    .where(and(eq(casos.aseguradoId, aseguradoId), sql`${casos.estado} <> 'pagado'`));
  await registrarEventos(
    abiertos.map((k) => ({
      casoId: k.id,
      tipo: marcar && motivo === "baja" ? ("baja" as const) : ("nota" as const),
      resumen: marcar ? (motivo === "baja" ? "Pidió no recibir más mensajes: el agente no le vuelve a escribir." : "Lo marcaste para no contactar.") : "Le sacaste la marca de no contactar.",
    })),
  );
}

/** Corrige el teléfono y el correo en la ficha (en empresas, los del contacto de administración). */
export async function actualizarContacto(casoId: number, datos: { telefono: string | null; email: string | null }) {
  const [caso] = await db.select().from(casos).where(eq(casos.id, casoId));
  if (!caso) throw new Error("Caso inexistente");
  const [a] = await db.select({ tipo: asegurados.tipo }).from(asegurados).where(eq(asegurados.id, caso.aseguradoId));
  const valores =
    a?.tipo === "empresa"
      ? { contactoTelefono: datos.telefono, contactoEmail: datos.email }
      : { telefono: datos.telefono, email: datos.email };
  await db.update(asegurados).set({ ...valores, actualizadoEl: new Date() }).where(eq(asegurados.id, caso.aseguradoId));
  await registrarEventos([{ casoId, tipo: "nota", resumen: "Actualizaste el contacto en la ficha del asegurado." }]);
}

// ---------- Mensajes aprobados ----------

/**
 * Después de que sale un mensaje que esperaba aprobación: cada caso al que
 * corresponde suma el evento y, si era un contacto del agente (no un pedido
 * puntual del Validador), cuenta como intento.
 */
export async function despuesDeEnviarMensaje(m: { id: number; canal: string; texto: string; destinatario: string | null; referencia: string | null }, intento: boolean, ahora = new Date()) {
  const ligados = await db
    .select({ casoId: eventos.casoId })
    .from(eventos)
    .where(and(eq(eventos.tipo, "para_aprobar"), sql`${eventos.datos} ->> 'mensajeId' = ${String(m.id)}`));
  const cuotaId = /^cuota:(\d+):/.exec(m.referencia ?? "")?.[1];
  const ids = new Set(ligados.map((l) => l.casoId));
  if (!ids.size && cuotaId) for (const k of await casosDeCuotas([Number(cuotaId)])) ids.add(k.id);
  if (!ids.size) return;
  const canal = m.canal === "whatsapp" ? "whatsapp" : "email";
  const lista = await db.select().from(casos).where(inArray(casos.id, [...ids]));
  for (const k of lista) {
    await actualizarCasos(
      [k.id],
      intento
        ? { intentos: k.intentos + 1, ultimoContactoEl: ahora, ...(k.estado === "pendiente" ? { estado: "sin_respuesta" as const } : {}) }
        : { ultimoContactoEl: ahora },
      {
        tipo: canal === "whatsapp" ? "whatsapp_enviado" : "email_enviado",
        canal,
        resumen: intento ? `Aprobaste el mensaje y salió. Intento ${k.intentos + 1}.` : "Aprobaste el mensaje y salió.",
        datos: { texto: m.texto, para: m.destinatario, mensajeId: m.id },
      },
    );
  }
}
