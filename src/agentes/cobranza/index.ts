import "server-only";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Asegurado, ConfigCobranza } from "@/db/schema";
import { enviarMensaje } from "@/agentes/envio";
import { agruparCobros, type Cobro } from "@/lib/validador";
import { dentroDeHorario, pasoQueToca, referenciaDe, type Paso, type Pendiente } from "@/lib/cobranza";
import { obtenerCuotas, obtenerCuotasRecientes } from "@/lib/datos-agentes";
import { diasDeGracia } from "@/lib/validador/gracia";
import { graciaDeLaCartera, recalcularEstados } from "../validador/cartera";
import { diaYMes, sumarDias } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { completarPlantilla, nombreDePila } from "@/lib/plantillas";
import { cuotasDelCobro } from "../cobros";
import { CONFIG_COBRANZA_INICIAL, PASOS_COBRANZA } from "./secuencia";

/**
 * Redacción de los mensajes de cobranza.
 *
 * Hoy es determinista: plantillas con variables. Acá se enchufa un modelo que
 * redacte cada mensaje con el historial del asegurado (implementá
 * RedactorCobranza y cambiá `redactor`). Ningún mensaje sale sin aprobación
 * salvo los pasos marcados como automáticos.
 */
export interface RedactorCobranza {
  redactar(contexto: ContextoMensaje): string;
}

export type ContextoMensaje = {
  tipo: Pendiente;
  plantilla?: string;
  nombre: string;
  compania: string;
  ramo: string;
  cuota: number;
  monto: number;
  vencimiento: string;
  diasGracia: number;
  mediosPago: string;
  pagado?: number;
  problema?: string;
  enviados?: string[];
};

export const redactorConPlantillas: RedactorCobranza = {
  redactar(c) {
    const vars = {
      nombre: c.nombre,
      compañía: c.compania,
      ramo: c.ramo,
      cuota: String(c.cuota),
      monto: pesos(c.monto),
      vence: diaYMes(c.vencimiento),
      "medios de pago": c.mediosPago,
      "fin de gracia": diaYMes(sumarDias(c.vencimiento, c.diasGracia)),
    };
    switch (c.tipo) {
      case "diferencia":
        return completarPlantilla(
          `Hola {nombre}, ¿cómo estás? Recibimos ${pesos(c.pagado ?? 0)} por la cuota {cuota} de {ramo} con {compañía}, muchas gracias. La cuota es de {monto}, así que quedan ${pesos(
            c.monto - (c.pagado ?? 0),
          )} pendientes antes del {vence}. ¿Podrás transferir la diferencia a la misma cuenta? Cualquier duda, avisame. Saludos, {productor}`,
          vars,
        );
      case "comprobante":
        return completarPlantilla(
          `Hola {nombre}, gracias por mandar el comprobante de la cuota {cuota} de {ramo}. ${c.problema ?? "Hay un dato que no coincide con la cuota"}. ¿Me podrás mandar otro comprobante o contarme cómo lo pagaste? Saludos, {productor}`,
          vars,
        );
      case "recibo":
        return completarPlantilla(
          "Hola {nombre}, te confirmo que recibimos el pago de la cuota {cuota} de tu seguro de {ramo} con {compañía} ({monto}). ¡Gracias! Saludos, {productor}",
          vars,
        );
      case 4: {
        const fechas = c.enviados ?? [];
        return fechas.length
          ? `El agente ya le escribió el ${fechas.join(" y el ")} y no hubo respuesta. Una llamada tuya suele destrabarlo más rápido que otro mensaje.`
          : "Todavía no hubo respuesta a los avisos. Una llamada tuya suele destrabarlo más rápido que otro mensaje.";
      }
      default:
        return completarPlantilla(c.plantilla ?? PASOS_COBRANZA[c.tipo - 1].plantilla, vars);
    }
  },
};

export const redactor: RedactorCobranza = redactorConPlantillas;

/** Lo que dice el problema del comprobante, contado para el asegurado. */
function problemaParaElCliente(texto: string, compania: string): string {
  if (/destino no es/i.test(texto)) return `El pago figura a una cuenta que no es de ${compania}`;
  if (/^faltan/i.test(texto)) return "El monto no llega al de la cuota";
  if (/de más/i.test(texto)) return "El monto es mayor que el de la cuota";
  if (/ya se usó/i.test(texto)) return "Ese comprobante ya lo habíamos recibido por otro pago";
  if (/código de pago/i.test(texto)) return "El código de pago no corresponde a esta póliza";
  return "Hay un dato que no coincide con la cuota";
}

export async function leerConfigCobranza(): Promise<ConfigCobranza> {
  const [fila] = await db.select().from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, "cobranza"));
  const config = fila?.config as Partial<ConfigCobranza> | undefined;
  return {
    pasos: config?.pasos?.length ? config.pasos : CONFIG_COBRANZA_INICIAL.pasos,
    reglas: { ...CONFIG_COBRANZA_INICIAL.reglas, ...config?.reglas },
  };
}

/** A quién y por dónde: en empresas, al contacto de administración si la regla está activa. */
export function destinatarioDe(a: Asegurado, reglaAdministracion: boolean, preferido: "whatsapp" | "email") {
  const admin = a.tipo === "empresa" && reglaAdministracion;
  const telefono = (admin ? a.contactoTelefono || a.telefono : a.telefono || a.contactoTelefono) || null;
  const email = (admin ? a.contactoEmail || a.email : a.email || a.contactoEmail) || null;
  const nombre =
    a.tipo === "persona"
      ? nombreDePila(a.nombre, false)
      : a.contactoNombre?.replace(/\(.*\)/, "").replace(/^(dra?|ing|lic|sr|sra)\.?\s+/i, "").trim().split(/\s+/)[0] || a.nombre;
  if (preferido === "whatsapp" && telefono) return { canal: "whatsapp" as const, para: telefono, nombre };
  if (email) return { canal: "email" as const, para: email, nombre };
  if (telefono) return { canal: "whatsapp" as const, para: telefono, nombre };
  return null;
}

async function datosDelCobro(cabezaId: number) {
  const ids = await cuotasDelCobro(cabezaId);
  const [cobro] = agruparCobros(await obtenerCuotas(ids));
  if (!cobro) throw new Error("Cobro inexistente");
  const [a] = await db.select().from(schema.asegurados).where(eq(schema.asegurados.id, cobro.aseguradoId));
  const [compania] = cobro.compania ? await db.select().from(schema.companias).where(eq(schema.companias.nombre, cobro.compania)) : [];
  return { cobro, asegurado: a, compania };
}

/** Fechas (dd/mm) de los mensajes de cobranza ya enviados de este cobro. */
async function enviadosDe(cabezaId: number): Promise<string[]> {
  const filas = await db
    .select({ enviadoEl: schema.mensajes.enviadoEl })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.estado, "enviado"), like(schema.mensajes.referencia, `cuota:${cabezaId}:%`)))
    .orderBy(schema.mensajes.enviadoEl);
  return filas
    .map((f) => f.enviadoEl)
    .filter((d): d is Date => Boolean(d))
    .map((d) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" }).format(d));
}

const MOTIVO: Record<Paso, string> = {
  1: "Faltan 3 días para el vencimiento: es el primer recordatorio de esta cuota.",
  2: "Hoy vence la cuota.",
  3: "Pasaron 3 días del vencimiento y todavía no figura el pago.",
  4: "No respondió los mensajes anteriores y se acerca el plazo de gracia de la compañía.",
  5: "Faltan 5 días para que termine el plazo de gracia: la compañía puede suspender la cobertura.",
};

/**
 * Prepara (o, si el paso es automático, envía) un mensaje de un cobro.
 * Devuelve null si el asegurado no tiene cómo recibirlo.
 */
export async function prepararMensaje(
  cabezaId: number,
  tipo: Pendiente,
  extra: { motivo?: string; pagado?: number; problema?: string; agente?: "cobranza" | "validador" } = {},
  ahora: Date = new Date(),
): Promise<{ id: number; enviado: boolean } | null> {
  const referencia = referenciaDe(cabezaId, tipo);
  const [ya] = await db
    .select({ id: schema.mensajes.id })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.referencia, referencia), eq(schema.mensajes.estado, "borrador")));
  if (ya) return { id: ya.id, enviado: false };

  const config = await leerConfigCobranza();
  const { cobro, asegurado: a, compania } = await datosDelCobro(cabezaId);
  // Las empresas manejan los pagos por email (administración); las personas, por WhatsApp.
  const destino = destinatarioDe(
    a,
    config.reglas.contactoAdministracion,
    tipo === 4 || a.tipo === "persona" ? "whatsapp" : "email",
  );
  if (!destino) return null;
  if (tipo === 4 && destino.canal !== "whatsapp") return null; // sin teléfono no hay llamada

  const texto = redactor.redactar({
    tipo,
    plantilla: typeof tipo === "number" ? config.pasos.find((p) => p.paso === tipo)?.plantilla : undefined,
    nombre: destino.nombre,
    compania: cobro.compania ?? "la compañía",
    ramo: cobro.cuotas[0].ramo.toLowerCase(),
    cuota: cobro.cuotas[0].numero,
    monto: cobro.monto,
    vencimiento: cobro.vencimiento,
    diasGracia: diasDeGracia((await graciaDeLaCartera())(cobro.compania, cobro.cuotas[0].ramo), cobro.cuotas[0].numero),
    mediosPago: compania?.mediosPago ?? "transferencia",
    pagado: extra.pagado,
    problema: extra.problema ? problemaParaElCliente(extra.problema, cobro.compania ?? "la compañía") : undefined,
    enviados: tipo === 4 ? await enviadosDe(cabezaId) : undefined,
  });
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a.id,
      agente: extra.agente ?? "cobranza",
      canal: tipo === 4 ? "llamada" : destino.canal,
      destinatario: destino.para,
      asunto: destino.canal === "email" ? `${cobro.compania ?? "Seguro"} · cuota ${cobro.cuotas[0].numero}` : null,
      referencia,
      motivo: extra.motivo ?? (typeof tipo === "number" ? MOTIVO[tipo] : null),
      texto,
      esEjemplo: a.esEjemplo,
    })
    .returning({ id: schema.mensajes.id });

  const paso = typeof tipo === "number" ? config.pasos.find((p) => p.paso === tipo) : undefined;
  const puedeSalir = !config.reglas.horario || dentroDeHorario(ahora);
  if (paso?.automatico && tipo !== 4 && puedeSalir) {
    const r = await enviarMensaje(m.id);
    if (r.ok) {
      await marcarPaso(cabezaId, tipo as Paso, destino.canal === "whatsapp" ? "WhatsApp" : "Email", ahora);
      return { id: m.id, enviado: true };
    }
  }
  return { id: m.id, enviado: false };
}

/** Registra que se cumplió un paso de la secuencia. */
export async function marcarPaso(cabezaId: number, paso: Paso, contacto: string, ahora: Date = new Date()) {
  const valores = {
    paso: sql`greatest(${schema.seguimientosCobranza.paso}, ${paso})`,
    ultimaNovedad: paso === 4 ? "Llamada registrada" : "Enviado, sin respuesta",
    ultimoContacto: contacto,
    ultimaNovedadEl: ahora,
    actualizadoEl: ahora,
  };
  await db
    .insert(schema.seguimientosCobranza)
    .values({ cuotaId: cabezaId, paso, ultimaNovedad: valores.ultimaNovedad, ultimoContacto: contacto, ultimaNovedadEl: ahora })
    .onConflictDoUpdate({ target: schema.seguimientosCobranza.cuotaId, set: valores });
}

/**
 * Lo que corre el cron cada mañana: actualiza los estados con la gracia del
 * Validador (una cuota en gracia todavía no está vencida), retoma las
 * promesas de pago que ya pasaron y prepara el mensaje del paso que toca en
 * cada cobro impago. No envía nada que no esté marcado como automático.
 */
export async function generarBorradores(hoy: string, ahora: Date = new Date()) {
  await recalcularEstados(hoy);
  await db
    .update(schema.seguimientosCobranza)
    .set({ estado: "activo", motivoPausa: null, ultimaNovedad: "No pagó en la fecha prometida", actualizadoEl: ahora })
    .where(and(eq(schema.seguimientosCobranza.estado, "pausado"), sql`${schema.seguimientosCobranza.promesaPagoEl} < ${hoy}`));

  const cobros = agruparCobros(await obtenerCuotasRecientes(hoy)).filter((c) => !c.pagada);
  const cabezas = cobros.map((c) => c.cabezaId);
  const seguimientos = cabezas.length
    ? await db.select().from(schema.seguimientosCobranza).where(inArray(schema.seguimientosCobranza.cuotaId, cabezas))
    : [];
  const comprobantes = cabezas.length
    ? await db
        .select({ cuotaId: schema.comprobantes.cuotaId })
        .from(schema.comprobantes)
        .where(and(inArray(schema.comprobantes.cuotaId, cabezas), eq(schema.comprobantes.estado, "por_revisar")))
    : [];
  const esperandoValidacion = new Set(comprobantes.map((c) => c.cuotaId));
  const graciaDe = await graciaDeLaCartera();

  let preparados = 0;
  let enviados = 0;
  let sinContacto = 0;
  for (const cobro of cobros) {
    const seg = seguimientos.find((s) => s.cuotaId === cobro.cabezaId);
    if (seg && seg.estado !== "activo") continue;
    if (esperandoValidacion.has(cobro.cabezaId)) continue;
    const gracia = diasDeGracia(graciaDe(cobro.compania, cobro.cuotas[0].ramo), cobro.cuotas[0].numero);
    const paso = pasoQueToca(cobro.vencimiento, hoy, gracia, seg?.paso ?? 0);
    if (!paso) continue;
    const r = await prepararMensaje(cobro.cabezaId, paso, {}, ahora);
    if (!r) {
      sinContacto++;
      await db
        .insert(schema.seguimientosCobranza)
        .values({ cuotaId: cobro.cabezaId, ultimaNovedad: "Sin teléfono ni email", ultimoContacto: "No se le pudo avisar" })
        .onConflictDoUpdate({
          target: schema.seguimientosCobranza.cuotaId,
          set: { ultimaNovedad: "Sin teléfono ni email", ultimoContacto: "No se le pudo avisar", actualizadoEl: ahora },
        });
      continue;
    }
    if (r.enviado) enviados++;
    else preparados++;
    if (!seg) await db.insert(schema.seguimientosCobranza).values({ cuotaId: cobro.cabezaId }).onConflictDoNothing();
  }
  await db.insert(schema.actividadAgentes).values({
    agente: "cobranza",
    texto: `Revisó ${cobros.length} cobros impagos: ${preparados} mensajes para aprobar, ${enviados} enviados solos y ${sinContacto} sin contacto.`,
  });
  return { cobros: cobros.length, preparados, enviados, sinContacto };
}

export type { Cobro };
