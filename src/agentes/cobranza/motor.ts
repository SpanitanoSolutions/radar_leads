import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { referenciaDe } from "@/lib/cobranza";
import { CONTACTABLES, ESTADO_INFO, enGestion } from "@/lib/cobranza/estados";
import { esHerramienta, HERRAMIENTAS_COBRANZA, leerEntrada, type TipoRespuesta } from "@/lib/cobranza/herramientas";
import { guionSinIA, mensajeSinIA, textoIntento, type ReciboParaPlantilla } from "@/lib/cobranza/plantillas";
import { armarInstrucciones, firmaDe, type FirmaCobranza } from "@/lib/cobranza/prompt";
import { canalesDisponibles, canalPreferido, debeEscalarPorIntentos, destinoDe, motivoDelMomento, TEXTO_MOMENTO, type MotivoOmision } from "@/lib/cobranza/reglas";
import { tramoDe } from "@/lib/cobranza/tramos";
import type { CanalCobranza, ConfiguracionCobranza, EstadoCorridaCobranza, OrigenCorridaCobranza } from "@/lib/cobranza/tipos";
import { ejecutarAgenteIA, estadoIA } from "@/lib/ia/ejecutar";
import type { LlamadaHerramientaIA } from "@/lib/ia";
import type { ResultadoHerramienta } from "@/lib/ia/motor";
import { diaYMes, diasEntre, sumarDias } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import { companiaCanonica } from "@/lib/importacion";
import { nombreDePila } from "@/lib/plantillas";
import { avisarAlProductor } from "./avisos";
import { enviarPorCanal, estadoCanales, type EstadoCanales } from "./canales";
import { ALCANCE_COBRANZA, actualizarCasos, cambiarNoContactar, leerConfigCobranza, registrarEventos, sincronizarCasos } from "./casos";
import { diaLocal, listarCasos, situacionDelCaso, ultimosEventos, type CasoCobranza } from "./datos";

// El Agente de Cobranza: una corrida toma los recibos a los que hoy se les
// puede escribir (reglas de src/lib/cobranza/reglas.ts), los agrupa por
// asegurado y, por cada uno, conversa con la IA, que decide qué escribir y por
// dónde con las herramientas de src/lib/cobranza/herramientas.ts. Cada
// herramienta pasa por las reglas antes de hacer algo. Sin IA, el mismo
// ejecutor escribe con las plantillas por tramo.

const c = schema.cobranzaCorridas;
const MINUTOS_CAIDA = 15;
/** Una corrida no empieza asegurados nuevos después de este tiempo (Vercel corta a los 300 s). */
const PRESUPUESTO_MS = 240_000;
const EN_PARALELO = 3;

export type OpcionesCorrida = {
  origen: OrigenCorridaCobranza;
  /** "Probar" (Run Test): modo prueba aunque la configuración diga otra cosa. */
  forzarPrueba?: boolean;
  /** Máximo de recibos a contactar (en modo prueba manda el de Pruebas). */
  limite?: number;
};

/**
 * Crea la corrida si no hay otra en curso (lock en la base: dos pedidos a la
 * vez no arrancan dos corridas). Las que quedaron colgadas más de 15 minutos
 * se cierran como error.
 */
export async function iniciarCorrida(opciones: OpcionesCorrida): Promise<{ id: number; nueva: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cobranza_corrida'))`);
    await tx
      .update(c)
      .set({ estado: "error", terminadaEl: new Date(), resumen: "La corrida se cortó antes de terminar." })
      .where(and(eq(c.estado, "en_curso"), lt(c.iniciadaEl, new Date(Date.now() - MINUTOS_CAIDA * 60_000))));
    const [enCurso] = await tx.select({ id: c.id }).from(c).where(eq(c.estado, "en_curso")).limit(1);
    if (enCurso) return { id: enCurso.id, nueva: false };
    const config = await leerConfigCobranza(tx);
    const [fila] = await tx
      .insert(c)
      .values({ origen: opciones.origen, modoPrueba: opciones.forzarPrueba || config.modoPrueba, ...ALCANCE_COBRANZA })
      .returning({ id: c.id });
    return { id: fila.id, nueva: true };
  });
}

/** Lo que va juntando una corrida (o una respuesta entrante). */
export type Registro = {
  corridaId: number | null;
  procesados: number;
  contactados: Set<number>;
  errores: { casoId: number | null; mensaje: string }[];
  omitidos: Record<string, number>;
  escalados: string[];
  promesas: string[];
  costoUsd: number;
  conIa: boolean;
};

export const registroVacio = (corridaId: number | null): Registro => ({
  corridaId,
  procesados: 0,
  contactados: new Set(),
  errores: [],
  omitidos: {},
  escalados: [],
  promesas: [],
  costoUsd: 0,
  conIa: false,
});

/** Quién firma, leído sin depender del pedido (la corrida sigue después de responder). */
export async function firmaDeLaCuenta(config: ConfiguracionCobranza): Promise<FirmaCobranza & { email: string | null; telefono: string | null }> {
  const [a] = await db
    .select({ nombre: schema.ajustes.productorNombre, organizacion: schema.ajustes.productorOrganizacion, email: schema.ajustes.productorEmail, telefono: schema.ajustes.productorTelefono })
    .from(schema.ajustes)
    .where(eq(schema.ajustes.id, 1));
  const firma = firmaDe(config, { nombre: a?.nombre ?? process.env.NOMBRE_PRODUCTOR ?? null, organizacion: a?.organizacion ?? null });
  return { ...firma, email: a?.email ?? null, telefono: a?.telefono ?? null };
}

/** Cómo se le paga a cada compañía ("transferencia o Rapipago"), si está cargado. */
export async function mediosDePago(): Promise<(compania: string | null) => string | null> {
  const filas = await db.select({ nombre: schema.companias.nombre, medios: schema.companias.mediosPago }).from(schema.companias);
  const porNombre = new Map(filas.filter((f) => f.medios).map((f) => [companiaCanonica(f.nombre), f.medios!]));
  return (compania) => (compania ? (porNombre.get(companiaCanonica(compania)) ?? null) : null);
}

export type ContextoEjecutor = {
  config: ConfiguracionCobranza;
  firma: FirmaCobranza;
  estado: EstadoCanales;
  hoy: string;
  registro: Registro;
  /** saliente: la corrida le escribe; entrante: el asegurado respondió y se le contesta. */
  modo: "saliente" | "entrante";
  comoPagar: (compania: string | null) => string | null;
};

/** Los recibos de un asegurado como los ve la IA (resultado de cobranza_obtener_polizas). */
export function contextoParaIA(grupo: CasoCobranza[], ctx: ContextoEjecutor, historial: Map<number, { creadoEl: Date; tipo: string; resumen: string }[]>) {
  const k0 = grupo[0];
  return {
    hoy: ctx.hoy,
    modo: ctx.config.modoPrueba ? "prueba" : "real",
    asegurado: {
      nombre: k0.asegurado.nombre,
      tipo: k0.asegurado.tipo,
      saludarComo: k0.asegurado.tipo === "persona" ? nombreDePila(k0.asegurado.nombre, false) : (k0.asegurado.contactoNombre?.replace(/\(.*\)/, "").trim() || k0.asegurado.nombre),
    },
    canalesDisponibles: ordenarCanales(k0),
    polizas: grupo.map((k) => {
      const s = situacionDelCaso(k, ctx.config, ctx.hoy);
      return {
        casoId: k.id,
        compania: k.compania,
        ramo: k.ramo,
        poliza: k.polizaNumero,
        recibo: k.recibo,
        cuota: `${k.cuota.numero} de ${k.cuota.de}`,
        monto: importe(k.monto, k.moneda === "USD" ? "USD" : "ARS"),
        vencimiento: k.vencimiento,
        diasParaVencer: s.diasParaVencer,
        currentTier: s.tramo ? { id: s.tramo.id, label: s.tramo.nombre } : null,
        estado: ESTADO_INFO[k.estado].texto,
        intentos: k.intentos,
        maxIntentos: ctx.config.maxIntentos,
        ultimoContacto: k.ultimoContactoEl ? k.ultimoContactoEl.toISOString().slice(0, 10) : null,
        promesa: k.promesaEl,
        puedeContactarHoy: ctx.modo === "entrante" || s.motivoNoContactar === null,
        comoPagar: ctx.comoPagar(k.compania),
        historial: (historial.get(k.id) ?? []).map((e) => `${diaYMes(e.creadoEl.toISOString().slice(0, 10))} ${e.tipo}: ${e.resumen}`),
      };
    }),
  };

  function ordenarCanales(k: CasoCobranza): CanalCobranza[] {
    const disponibles = canalesDisponibles(k.contacto, ctx.config);
    const primero = canalPreferido(k.asegurado.tipo, disponibles);
    return primero ? [primero, ...disponibles.filter((x) => x !== primero)] : disponibles;
  }
}

const reciboDe = (k: CasoCobranza, hoy: string, comoPagar: string | null): ReciboParaPlantilla => ({
  compania: k.compania,
  ramo: k.ramo,
  poliza: k.polizaNumero,
  recibo: k.recibo,
  monto: importe(k.monto, k.moneda === "USD" ? "USD" : "ARS"),
  vencimiento: k.vencimiento,
  diasParaVencer: diasEntre(hoy, k.vencimiento),
  comoPagar,
});

/**
 * Ejecuta las herramientas para los recibos de un asegurado, con las reglas
 * duras. Lo usan la IA (una llamada por herramienta) y el camino sin IA.
 */
export function crearEjecutor(grupo: CasoCobranza[], ctx: ContextoEjecutor) {
  const { config, registro } = ctx;
  const porId = new Map(grupo.map((k) => [k.id, k]));
  const permitido = (k: CasoCobranza) =>
    !registro.contactados.has(k.id) && (ctx.modo === "entrante" ? enGestion(k.estado) && k.noContactar !== "baja" : situacionDelCaso(k, config, ctx.hoy).motivoNoContactar === null);
  const error = (contenido: string): ResultadoHerramienta => ({ contenido, esError: true });
  const ahora = () => new Date();
  const k0 = grupo[0];
  const nombre = k0.asegurado.tipo === "persona" ? nombreDePila(k0.asegurado.nombre, false) : (k0.asegurado.contactoNombre?.replace(/\(.*\)/, "").trim().split(/\s+/)[0] || k0.asegurado.nombre);

  function casosDe(ids: number[]): CasoCobranza[] | string {
    const ajenos = ids.filter((id) => !porId.has(id));
    if (ajenos.length) return `Los casos ${ajenos.join(", ")} no son de este asegurado.`;
    return [...new Set(ids)].map((id) => porId.get(id)!);
  }

  /** Deja el mensaje (o la llamada) para que lo apruebe el productor. */
  async function paraAprobar(casos: CasoCobranza[], canal: CanalCobranza, para: string, texto: string, asunto: string | null, motivo: string) {
    const [m] = await db
      .insert(schema.mensajes)
      .values({
        aseguradoId: casos[0].aseguradoId,
        agente: "cobranza",
        canal: canal === "telefono" ? "llamada" : canal,
        destinatario: para,
        asunto,
        texto,
        motivo,
        referencia: referenciaDe(casos[0].cuotaId, canal === "telefono" ? "llamada" : "agente"),
        esEjemplo: casos[0].esEjemplo,
      })
      .returning({ id: schema.mensajes.id });
    await registrarEventos(
      casos.map((k) => ({
        casoId: k.id,
        tipo: canal === "telefono" ? ("llamada_pendiente" as const) : ("para_aprobar" as const),
        canal,
        resumen: canal === "telefono" ? `Te dejé la llamada con el guion. ${motivo}` : `Preparé el mensaje y quedó en "Para aprobar". ${motivo}`,
        datos: { mensajeId: m.id, texto, para, asunto },
        corridaId: registro.corridaId,
      })),
    );
    for (const k of casos) registro.contactados.add(k.id);
  }

  async function enviar(canal: CanalCobranza, casosPedidos: CasoCobranza[], asunto: string | null, texto: string): Promise<ResultadoHerramienta> {
    const casos = casosPedidos.filter(permitido);
    if (!casos.length) return error("No se le puede escribir hoy sobre esos recibos (ya se lo contactó o una regla lo impide). No insistas.");
    const disponibles = canalesDisponibles(casos[0].contacto, config);
    if (!disponibles.includes(canal)) {
      return error(`${canal} no está habilitado o el asegurado no tiene ese dato. Canales disponibles: ${disponibles.join(", ") || "ninguno"}.`);
    }
    if (canal === "telefono") return llamar(casos, texto);
    const destino = destinoDe(canal, casos[0].contacto, config);
    const tramo = tramoDe(diasEntre(ctx.hoy, casos[0].vencimiento), config.tramos);
    const motivo = ctx.modo === "entrante" ? "Respuesta al asegurado." : `${tramo?.nombre ?? "Seguimiento"}.`;
    if (!config.modoPrueba && config.pedirAprobacion) {
      await paraAprobar(casos, canal, destino.para!, texto, asunto, motivo);
      return { contenido: "El mensaje quedó para que el productor lo apruebe. No le vuelvas a escribir." };
    }
    // Los casos de ejemplo tienen datos inventados: en modo real nunca salen por una conexión real.
    const simularEjemplo = !config.modoPrueba && casos[0].esEjemplo;
    const r = simularEjemplo
      ? ({ ok: true, simulado: true, id: "ejemplo" } as const)
      : await enviarPorCanal(canal, { para: destino.para, asunto: asunto ?? undefined, texto, remitente: ctx.firma.productor }, { modoPrueba: config.modoPrueba, estado: ctx.estado });
    if (!r.ok) {
      await registrarEventos(
        casos.map((k) => ({
          casoId: k.id,
          tipo: canal === "email" ? ("correo_fallido" as const) : ("error" as const),
          canal,
          resumen: `No salió el ${canal === "email" ? "correo" : "WhatsApp"}: ${r.error}`,
          datos: { texto, para: destino.para, asunto },
          esPrueba: config.modoPrueba,
          corridaId: registro.corridaId,
        })),
      );
      registro.errores.push({ casoId: casos[0].id, mensaje: r.error });
      return error(`No salió: ${r.error}`);
    }
    const momento = ahora();
    for (const k of casos) {
      const intento = ctx.modo === "saliente";
      const prefijo = simularEjemplo
        ? "Caso de ejemplo: se simuló (los ejemplos nunca salen por una conexión real). "
        : r.simulado
          ? "Modo prueba: se simuló, no salió nada. "
          : config.modoPrueba
            ? `Modo prueba: fue a ${destino.para}. `
            : "";
      await actualizarCasos(
        [k.id],
        intento ? { intentos: k.intentos + 1, ultimoContactoEl: momento, ...(CONTACTABLES.includes(k.estado) ? { estado: "sin_respuesta" as const } : {}) } : { ultimoContactoEl: momento },
        {
          tipo: canal === "email" ? "email_enviado" : "whatsapp_enviado",
          canal,
          resumen: `${prefijo}${intento ? textoIntento(k.intentos + 1, diasEntre(ctx.hoy, k.vencimiento), importe(k.monto, k.moneda === "USD" ? "USD" : "ARS")) : "Respuesta al asegurado."}`,
          datos: { texto, asunto, para: destino.para, simulado: r.simulado, idProveedor: r.id },
          esPrueba: config.modoPrueba,
          corridaId: registro.corridaId,
        },
      );
      registro.contactados.add(k.id);
    }
    return { contenido: `Enviado${r.simulado ? " (simulado: modo prueba)" : ""}. Quedó registrado en ${casos.length === 1 ? "el recibo" : `los ${casos.length} recibos`}.` };
  }

  async function llamar(casosPedidos: CasoCobranza[], guion: string): Promise<ResultadoHerramienta> {
    const casos = casosPedidos.filter(permitido);
    if (!casos.length) return error("No se lo puede llamar hoy por esos recibos. No insistas.");
    const telefono = casos[0].contacto.telefono;
    if (!config.canales.telefono.habilitado || !telefono) return error("Las llamadas no están habilitadas o el asegurado no tiene teléfono.");
    if (!config.modoPrueba) {
      await paraAprobar(casos, "telefono", telefono, guion, null, "No hay llamadas automáticas: la hacés vos.");
      return { contenido: "La llamada quedó como tarea para el productor, con tu guion." };
    }
    const momento = ahora();
    for (const k of casos) {
      await actualizarCasos(
        [k.id],
        { intentos: k.intentos + 1, ultimoContactoEl: momento, ...(CONTACTABLES.includes(k.estado) ? { estado: "sin_respuesta" as const } : {}) },
        {
          tipo: "llamada_buzon",
          canal: "telefono",
          resumen: `Llamada simulada (modo prueba): atendió el buzón. ${textoIntento(k.intentos + 1, diasEntre(ctx.hoy, k.vencimiento), importe(k.monto, k.moneda === "USD" ? "USD" : "ARS"))}`,
          datos: { texto: guion, para: destinoDe("telefono", k.contacto, config).para, simulado: true },
          esPrueba: true,
          corridaId: registro.corridaId,
        },
      );
      registro.contactados.add(k.id);
    }
    return { contenido: "La llamada (simulada) fue al buzón. Quedó registrado el intento." };
  }

  /** Cambia el estado en la base y en memoria: lo que sigue en la conversación ya ve el estado nuevo. */
  async function marcar(casos: CasoCobranza[], cambios: Partial<Pick<CasoCobranza, "estado" | "motivo" | "promesaEl">>, evento: Parameters<typeof actualizarCasos>[2]) {
    await actualizarCasos(casos.map((k) => k.id), cambios, evento && { ...evento, esPrueba: config.modoPrueba });
    for (const k of casos) Object.assign(k, cambios);
  }

  async function registrarRespuesta(casos: CasoCobranza[], tipo: TipoRespuesta, fecha: string | undefined, notas: string): Promise<ResultadoHerramienta> {
    const datos = { notas };
    const corridaId = registro.corridaId;
    if (tipo === "promesa_pago" || tipo === "fecha_programada") {
      const dia = fecha ?? sumarDias(ctx.hoy, config.diasGraciaPromesa);
      if (dia < ctx.hoy || dia > sumarDias(ctx.hoy, 90)) return error("La fecha de la promesa tiene que ser de hoy en adelante y dentro de 90 días.");
      await marcar(casos, { estado: "promesa", promesaEl: dia, motivo: "Promesa de pago" }, { tipo: "promesa", resumen: `Prometió pagar el ${diaYMes(dia)}.${notas ? ` ${notas}` : ""}`, datos, corridaId });
      registro.promesas.push(`${casos[0].asegurado.nombre}: pagaría el ${diaYMes(dia)}.`);
      return { contenido: `Promesa registrada para el ${dia}. El agente no le escribe hasta esa fecha más ${config.diasGraciaPromesa} días.` };
    }
    if (tipo === "ya_pago") {
      await marcar(casos, { estado: "informo_pago", motivo: "Dice que ya pagó." }, { tipo: "informo_pago", resumen: `Dice que ya pagó: lo confirma el Validador de pagos.${notas ? ` ${notas}` : ""}`, datos, corridaId });
      return { contenido: "Registrado: dice que ya pagó. Lo confirma el Validador; no le vuelvas a pedir el pago." };
    }
    if (tipo === "respondio") {
      await marcar(casos, { estado: "respondio", motivo: notas || "Hizo una consulta." }, { tipo: "respondio", resumen: notas || "Hizo una consulta.", datos, corridaId });
      registro.escalados.push(`${casos[0].asegurado.nombre} respondió: ${notas || "hizo una consulta"}.`);
      return { contenido: "Registrada la consulta y avisado el productor. Si podés contestarla con lo que sabés, respondé; si no, escalá." };
    }
    if (tipo === "rechazo") {
      await marcar(casos, { estado: "rechazado", motivo: notas || "Dice que no va a pagar." }, { tipo: "rechazo", resumen: notas || "Dice que no va a pagar.", datos, corridaId });
      registro.escalados.push(`${casos[0].asegurado.nombre}: no va a pagar${notas ? ` (${notas})` : ""}.`);
      return { contenido: "Registrado el rechazo. Escalalo al productor." };
    }
    await cambiarNoContactar(casos[0].aseguradoId, true, "baja", notas || undefined);
    await marcar(casos, { estado: "excluido", motivo: "Pidió no recibir más mensajes." }, null);
    for (const k of casos) k.noContactar = "baja";
    return { contenido: "Registrada la baja: nadie le vuelve a escribir. No le respondas más." };
  }

  async function escalar(casos: CasoCobranza[], motivo: string): Promise<ResultadoHerramienta> {
    await marcar(casos, { estado: "escalado", motivo }, { tipo: "escalado", resumen: `Te lo pasé: ${motivo}`, corridaId: registro.corridaId });
    registro.escalados.push(`${casos[0].asegurado.nombre}: ${motivo}`);
    return { contenido: "Escalado al productor. No le escribas más." };
  }

  return {
    async ejecutar(llamada: LlamadaHerramientaIA): Promise<ResultadoHerramienta> {
      if (!esHerramienta(llamada.nombre)) return error(`No existe la herramienta ${llamada.nombre}.`);
      const nombreH = llamada.nombre;
      if (nombreH === "terminar") return { contenido: "Listo.", terminar: true };
      if (nombreH === "cobranza_obtener_polizas") {
        return { contenido: JSON.stringify(contextoParaIA(grupo, ctx, await ultimosEventos(grupo.map((k) => k.id), 4))) };
      }
      const entrada = leerEntrada(nombreH, llamada.entrada);
      if (!entrada.ok) return error(`Entrada inválida: ${entrada.error}`);
      const d = entrada.datos as { casoIds: number[] };
      const casos = casosDe(d.casoIds);
      if (typeof casos === "string") return error(casos);
      switch (nombreH) {
        case "enviar_whatsapp":
          return enviar("whatsapp", casos, null, (entrada.datos as { mensaje: string }).mensaje);
        case "enviar_email": {
          const e = entrada.datos as { asunto: string; mensaje: string };
          return enviar("email", casos, e.asunto, e.mensaje);
        }
        case "llamar":
          return enviar("telefono", casos, null, (entrada.datos as { guion: string }).guion);
        case "cobranza_registrar_respuesta": {
          const r = entrada.datos as { tipoRespuesta: TipoRespuesta; fecha?: string; notas: string };
          return registrarRespuesta(casos, r.tipoRespuesta, r.fecha, r.notas);
        }
        case "escalar_al_productor":
          return escalar(casos, (entrada.datos as { motivo: string }).motivo);
      }
      return error("Herramienta sin implementar.");
    },

    /** Sin IA: un recordatorio con la plantilla del tramo por el canal preferido, a los que todavía no se contactó. */
    async sinIA(): Promise<void> {
      const pendientes = grupo.filter(permitido);
      if (!pendientes.length) return;
      const canal = canalPreferido(k0.asegurado.tipo, canalesDisponibles(k0.contacto, config));
      if (!canal) {
        registro.omitidos.sin_canal = (registro.omitidos.sin_canal ?? 0) + pendientes.length;
        return;
      }
      const recibos = pendientes.map((k) => reciboDe(k, ctx.hoy, ctx.comoPagar(k.compania)));
      if (canal === "telefono") {
        await llamar(pendientes, guionSinIA(nombre, recibos, ctx.firma.productor));
        return;
      }
      const m = mensajeSinIA(nombre, recibos, ctx.firma.productor);
      await enviar(canal, pendientes, canal === "email" ? m.asunto : null, m.texto);
    },

    /** Sin IA, ante una respuesta: registra lo que se entendió y no contesta (lo ve el productor). */
    async responder(tipo: TipoRespuesta, fecha: string | undefined, notas: string): Promise<void> {
      const r = await registrarRespuesta(grupo, tipo, fecha, notas);
      if (r.esError) await registrarRespuesta(grupo, "respondio", undefined, notas);
    },
  };
}

function mensajeInicial(contexto: unknown): string {
  return [
    "Atendé a este asegurado: escribile una sola vez, por el canal que corresponda, sobre los recibos de abajo (mencionalos juntos). Después llamá a terminar.",
    "",
    "Resultado de cobranza_obtener_polizas:",
    "```json",
    JSON.stringify(contexto, null, 2),
    "```",
  ].join("\n");
}

const sumarOmitido = (r: Registro, motivo: MotivoOmision) => (r.omitidos[motivo] = (r.omitidos[motivo] ?? 0) + 1);

/**
 * La corrida completa. No lanza: cualquier error termina la corrida con
 * estado "error" y el motivo. Devuelve el estado final.
 */
export async function correrCobranza(corridaId: number, opciones: OpcionesCorrida, ahora = new Date()): Promise<EstadoCorridaCobranza> {
  const inicio = Date.now();
  const registro = registroVacio(corridaId);
  let aviso: string | undefined;
  try {
    const base = await leerConfigCobranza();
    const config: ConfiguracionCobranza = opciones.forzarPrueba ? { ...base, modoPrueba: true } : base;
    const dia = diaLocal(config);
    const hoy = dia(ahora);
    await sincronizarCasos(hoy, config);
    const inicioMes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`);

    // Llegaron al máximo de intentos sin respuesta: se escalan (sin IA, siempre).
    for (const k of (await listarCasos(inicioMes)).filter((k) => debeEscalarPorIntentos(k, config, hoy))) {
      await actualizarCasos([k.id], { estado: "escalado", motivo: `Sin respuesta después de ${k.intentos} intentos.` }, {
        tipo: "escalado",
        resumen: `Sin respuesta después de ${k.intentos} intentos: te lo pasé para que lo llames.`,
        corridaId,
      });
      registro.escalados.push(`${k.asegurado.nombre}: sin respuesta después de ${k.intentos} intentos.`);
    }

    const momento = motivoDelMomento(config, ahora);
    if (momento) {
      aviso = TEXTO_MOMENTO[momento];
    } else {
      const casos = (await listarCasos(inicioMes)).filter((k) => enGestion(k.estado));
      let elegibles: CasoCobranza[] = [];
      for (const k of casos) {
        const s = situacionDelCaso(k, config, hoy);
        if (s.motivoNoContactar) sumarOmitido(registro, s.motivoNoContactar);
        else elegibles.push(k);
      }
      // Los más atrasados primero.
      elegibles.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.id - b.id);
      if (config.modoPrueba) {
        const f = config.prueba.filtro;
        if (f.tipo === "tramo") elegibles = elegibles.filter((k) => situacionDelCaso(k, config, hoy).tramo?.id === f.tramo);
        if (f.tipo === "compania") elegibles = elegibles.filter((k) => k.compania && companiaCanonica(k.compania) === companiaCanonica(f.compania));
      }
      const limite = config.modoPrueba ? Math.min(config.prueba.maxRecibos, opciones.limite ?? Infinity) : (opciones.limite ?? 200);
      if (elegibles.length > limite) registro.omitidos.limite = elegibles.length - limite;
      elegibles = elegibles.slice(0, limite);

      const grupos = new Map<number, CasoCobranza[]>();
      for (const k of elegibles) grupos.set(k.aseguradoId, [...(grupos.get(k.aseguradoId) ?? []), k]);
      const [firma, estado, comoPagar, ia, historial] = await Promise.all([
        firmaDeLaCuenta(config),
        estadoCanales(),
        mediosDePago(),
        estadoIA({ agente: "cobranza", operacion: "contactar" }),
        ultimosEventos(elegibles.map((k) => k.id), 4),
      ]);
      const ctx: ContextoEjecutor = { config, firma, estado, hoy, registro, modo: "saliente", comoPagar };
      const system = armarInstrucciones(config, firma);
      let conIa = ia.habilitada;
      const cola = [...grupos.values()];
      const atender = async () => {
        for (let grupo = cola.shift(); grupo; grupo = cola.shift()) {
          if (Date.now() - inicio > PRESUPUESTO_MS) {
            registro.omitidos.tiempo = (registro.omitidos.tiempo ?? 0) + grupo.length;
            continue;
          }
          registro.procesados += grupo.length;
          const ejecutor = crearEjecutor(grupo, ctx);
          let resuelto = false;
          if (conIa) {
            const r = await ejecutarAgenteIA({
              agente: "cobranza",
              operacion: "contactar",
              system,
              herramientas: HERRAMIENTAS_COBRANZA,
              mensaje: mensajeInicial(contextoParaIA(grupo, ctx, historial)),
              ejecutar: ejecutor.ejecutar,
            });
            registro.costoUsd = Number((registro.costoUsd + r.costoUsd).toFixed(6));
            if (r.ok) {
              resuelto = true;
              registro.conIa = true;
            } else if (r.motivo === "sin_clave" || r.motivo === "desactivada" || r.motivo === "sin_cuota") {
              conIa = false;
            } else {
              registro.errores.push({ casoId: grupo[0].id, mensaje: `La IA no respondió (${r.motivo}): se usó la plantilla.` });
            }
          }
          if (!resuelto) await ejecutor.sinIA();
        }
      };
      await Promise.all(Array.from({ length: EN_PARALELO }, atender));
      if (!elegibles.length) aviso = "Hoy no había recibos para contactar.";
    }

    const errorAviso = await avisarAlFinal(config, registro, opciones.origen);
    if (errorAviso) registro.errores.push({ casoId: null, mensaje: errorAviso });
    return await cerrarCorrida(corridaId, registro, config.modoPrueba, aviso);
  } catch (e) {
    console.error(`La corrida ${corridaId} de Cobranza falló:`, e);
    registro.errores.push({ casoId: null, mensaje: e instanceof Error ? e.message : "Error inesperado" });
    await db
      .update(c)
      .set({ estado: "error", terminadaEl: new Date(), errores: registro.errores.length, resumen: "La corrida falló por un error inesperado.", detalle: { errores: registro.errores } })
      .where(eq(c.id, corridaId));
    return "error";
  }
}

/** Avisos al productor (escalados, promesas y resumen). Devuelve el error si no pudo avisar. */
export async function avisarAlFinal(config: ConfiguracionCobranza, r: Registro, origen: OrigenCorridaCobranza): Promise<string | null> {
  const n = config.notificaciones;
  const lineas: string[] = [];
  if (n.alEscalar && r.escalados.length) lineas.push("Te pasé estos casos:", ...r.escalados.map((e) => `- ${e}`));
  if (n.alPrometer && r.promesas.length) lineas.push("Prometieron pagar:", ...r.promesas.map((p) => `- ${p}`));
  if (n.resumenDiario && origen === "cron") lineas.push(textoResumen(r, config.modoPrueba));
  if (!lineas.length) return null;
  return avisarAlProductor(config, `Cobranza: ${r.escalados.length ? `${r.escalados.length} para vos` : "resumen"}`, lineas);
}

export function textoResumen(r: Registro, modoPrueba: boolean): string {
  const partes = [
    `Procesó ${r.procesados} ${r.procesados === 1 ? "recibo" : "recibos"}`,
    `contactó ${r.contactados.size}${modoPrueba ? " (modo prueba)" : ""}`,
    ...(r.escalados.length ? [`escaló ${r.escalados.length}`] : []),
    ...(r.errores.length ? [`${r.errores.length} ${r.errores.length === 1 ? "error" : "errores"}`] : []),
  ];
  return `${partes.join(", ")}.${r.conIa ? " Los mensajes los escribió la IA." : r.contactados.size ? " Los mensajes salieron de las plantillas (sin IA)." : ""}`;
}

async function cerrarCorrida(id: number, r: Registro, modoPrueba: boolean, aviso?: string): Promise<EstadoCorridaCobranza> {
  const estado: EstadoCorridaCobranza = r.errores.length ? "con_errores" : "ok";
  const resumen = aviso && !r.procesados ? `${aviso}${r.escalados.length ? ` Escaló ${r.escalados.length}.` : ""}` : textoResumen(r, modoPrueba);
  await db
    .update(c)
    .set({
      estado,
      terminadaEl: new Date(),
      procesados: r.procesados,
      contactados: r.contactados.size,
      errores: r.errores.length,
      costoIaUsd: r.costoUsd || null,
      conIa: r.conIa,
      resumen,
      detalle: { errores: r.errores, omitidos: r.omitidos, escalados: r.escalados.length, ...(aviso ? { aviso } : {}) },
    })
    .where(eq(c.id, id));
  await db.insert(schema.actividadAgentes).values({ agente: "cobranza", referencia: `corrida:${id}`, texto: `${modoPrueba ? "Corrida de prueba" : "Corrida"}: ${resumen}` });
  return estado;
}
