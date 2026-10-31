import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { claveCorreo, claveTelefono, clasificarSinIA, referenciaCaso } from "@/lib/cobranza/entrantes";
import { EN_GESTION, enGestion } from "@/lib/cobranza/estados";
import { HERRAMIENTAS_COBRANZA } from "@/lib/cobranza/herramientas";
import { armarInstrucciones } from "@/lib/cobranza/prompt";
import type { ConfiguracionCobranza } from "@/lib/cobranza/tipos";
import { ejecutarAgenteIA, estadoIA } from "@/lib/ia/ejecutar";
import { estadoCanales } from "./canales";
import { leerConfigCobranza, registrarEventos } from "./casos";
import { diaLocal, listarCasos, ultimosEventos } from "./datos";
import { avisarAlFinal, contextoParaIA, crearEjecutor, firmaDeLaCuenta, mediosDePago, registroVacio, type ContextoEjecutor } from "./motor";

// Cuando un asegurado responde (webhook de WhatsApp o correo, o "Simular
// respuesta" en modo prueba): se busca de quién es, se anota en la línea de
// tiempo de sus recibos abiertos y el agente lo procesa con el flujo
// "Respuesta entrante". Sin IA, se clasifica con reglas simples y no se contesta.

export type Entrante = {
  canal: "whatsapp" | "email";
  /** Número o correo de quien escribe. */
  de: string;
  texto: string;
  asunto?: string | null;
  /** "Simular respuesta": el caso ya se sabe. */
  casoId?: number;
};

export type ResultadoEntrante = { estado: "procesado" | "sin_caso"; casoIds: number[]; conIa: boolean; resumen: string };

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** El asegurado que escribió: por la referencia "C-123", por su teléfono o correo y, en modo prueba, por el destino de prueba. */
async function quienEscribe(m: Entrante, config: ConfiguracionCobranza): Promise<{ aseguradoId: number; prueba: boolean } | null> {
  const porCaso = async (id: number) => {
    const [k] = await db.select({ aseguradoId: schema.cobranzaCasos.aseguradoId }).from(schema.cobranzaCasos).where(eq(schema.cobranzaCasos.id, id));
    return k?.aseguradoId ?? null;
  };
  if (m.casoId) {
    const id = await porCaso(m.casoId);
    return id ? { aseguradoId: id, prueba: true } : null;
  }
  const ref = referenciaCaso(m.asunto, m.texto);
  if (ref) {
    const id = await porCaso(ref);
    if (id) return { aseguradoId: id, prueba: false };
  }
  const abiertos = sql`exists (select 1 from cobranza_casos k where k.asegurado_id = ${schema.asegurados.id} and k.estado in (${sql.join(EN_GESTION.map((e) => sql`${e}`), sql`, `)}))`;
  if (m.canal === "whatsapp") {
    const clave = claveTelefono(m.de);
    if (clave) {
      const [a] = await db
        .select({ id: schema.asegurados.id })
        .from(schema.asegurados)
        .where(
          and(
            isNull(schema.asegurados.bajaEl),
            abiertos,
            sql`(right(regexp_replace(coalesce(${schema.asegurados.telefono}, ''), '\\D', '', 'g'), 10) = ${clave} or right(regexp_replace(coalesce(${schema.asegurados.contactoTelefono}, ''), '\\D', '', 'g'), 10) = ${clave})`,
          ),
        )
        .limit(1);
      if (a) return { aseguradoId: a.id, prueba: false };
    }
  } else {
    const clave = claveCorreo(m.de);
    if (clave) {
      const [a] = await db
        .select({ id: schema.asegurados.id })
        .from(schema.asegurados)
        .where(and(isNull(schema.asegurados.bajaEl), abiertos, sql`(lower(${schema.asegurados.email}) = ${clave} or lower(${schema.asegurados.contactoEmail}) = ${clave})`))
        .limit(1);
      if (a) return { aseguradoId: a.id, prueba: false };
    }
  }
  // Modo prueba: responde el destino de prueba; es del último caso al que se le escribió ahí.
  if (!config.modoPrueba) return null;
  const p = config.prueba;
  const esDePrueba =
    m.canal === "whatsapp"
      ? [p.whatsapp, p.telefono].some((t) => claveTelefono(t) && claveTelefono(t) === claveTelefono(m.de))
      : Boolean(claveCorreo(p.email)) && claveCorreo(p.email) === claveCorreo(m.de);
  if (!esDePrueba) return null;
  const [ultimo] = await db
    .select({ aseguradoId: schema.cobranzaCasos.aseguradoId })
    .from(schema.cobranzaEventos)
    .innerJoin(schema.cobranzaCasos, eq(schema.cobranzaCasos.id, schema.cobranzaEventos.casoId))
    .where(and(eq(schema.cobranzaEventos.esPrueba, true), inArray(schema.cobranzaEventos.tipo, ["whatsapp_enviado", "email_enviado"])))
    .orderBy(desc(schema.cobranzaEventos.creadoEl), desc(schema.cobranzaEventos.id))
    .limit(1);
  return ultimo ? { aseguradoId: ultimo.aseguradoId, prueba: true } : null;
}

export async function procesarEntrante(m: Entrante, ahora = new Date()): Promise<ResultadoEntrante> {
  const config = await leerConfigCobranza();
  const hoy = diaLocal(config)(ahora);
  const quien = await quienEscribe(m, config);
  const sinCaso = (resumen: string): ResultadoEntrante => ({ estado: "sin_caso", casoIds: [], conIa: false, resumen });
  if (!quien) {
    await db.insert(schema.actividadAgentes).values({ agente: "cobranza", texto: `Llegó un ${m.canal === "email" ? "correo" : "WhatsApp"} que no corresponde a ningún recibo abierto.` });
    return sinCaso("No encontré un recibo abierto de quien escribió.");
  }
  const inicioMes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`);
  const casos = (await listarCasos(inicioMes)).filter((k) => k.aseguradoId === quien.aseguradoId && (enGestion(k.estado) || k.id === m.casoId));
  if (!casos.length) return sinCaso("Ese asegurado no tiene recibos abiertos.");

  const prueba = quien.prueba || config.modoPrueba;
  await registrarEventos(
    casos.map((k) => ({
      casoId: k.id,
      tipo: m.canal === "email" ? ("email_respondido" as const) : ("whatsapp_respondido" as const),
      canal: m.canal,
      resumen: `Respondió: “${recortar(m.texto.trim(), 160)}”`,
      datos: { texto: m.texto, de: m.de, asunto: m.asunto ?? null },
      esPrueba: prueba,
    })),
  );

  const [firma, estado, comoPagar, ia, historial] = await Promise.all([
    firmaDeLaCuenta(config),
    estadoCanales(),
    mediosDePago(),
    estadoIA({ agente: "cobranza", operacion: "responder" }),
    ultimosEventos(casos.map((k) => k.id), 5),
  ]);
  const registro = registroVacio(null);
  const ctx: ContextoEjecutor = { config, firma, estado, hoy, registro, modo: "entrante", comoPagar };
  const ejecutor = crearEjecutor(casos, ctx);
  let conIa = false;
  if (ia.habilitada) {
    const contexto = { ...contextoParaIA(casos, ctx, historial), canalEntrante: m.canal };
    const r = await ejecutarAgenteIA({
      agente: "cobranza",
      operacion: "responder",
      system: armarInstrucciones(config, firma),
      herramientas: HERRAMIENTAS_COBRANZA,
      mensaje: [
        `Mensaje del asegurado (por ${m.canal === "email" ? "correo" : "WhatsApp"})${m.asunto ? ` · asunto: ${recortar(m.asunto, 150)}` : ""}:`,
        '"""',
        recortar(m.texto, 4000),
        '"""',
        "",
        'Seguí el flujo "Respuesta entrante". Si contestás, hacelo por el mismo canal. Resultado de cobranza_obtener_polizas:',
        "```json",
        JSON.stringify(contexto, null, 2),
        "```",
      ].join("\n"),
      ejecutar: ejecutor.ejecutar,
    });
    conIa = r.ok;
  }
  if (!conIa) {
    const c = clasificarSinIA(m.texto, hoy);
    await ejecutor.responder(c.tipo, c.fecha, `“${recortar(m.texto.trim(), 300)}”`);
  }
  await avisarAlFinal(config, registro, "api");
  await db.insert(schema.actividadAgentes).values({ agente: "cobranza", texto: `Respondió ${casos[0].asegurado.nombre} por ${m.canal === "email" ? "correo" : "WhatsApp"}${prueba ? " (modo prueba)" : ""}.` });
  return {
    estado: "procesado",
    casoIds: casos.map((k) => k.id),
    conIa,
    resumen: conIa ? "El agente leyó la respuesta y la registró." : "Se registró la respuesta sin IA; si es una consulta, te espera en el caso.",
  };
}
