import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Asegurado } from "@/db/schema";
import { agruparCobros, type Cobro } from "@/lib/validador";
import { referenciaDe, type Paso, type Pendiente } from "@/lib/cobranza";
import { contactoParaCobranza } from "@/lib/cobranza/reglas";
import { obtenerCuotas } from "@/lib/datos-agentes";
import { diasDeGracia } from "@/lib/validador/gracia";
import { graciaDeLaCartera } from "../validador/cartera";
import { diaYMes, sumarDias } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { completarPlantilla, nombreDePila } from "@/lib/plantillas";
import { cuotasDelCobro } from "../cobros";
import { asegurarCaso, registrarEventos } from "./casos";
import { PASOS_COBRANZA } from "./secuencia";

/**
 * Los pedidos puntuales que el Validador de pagos le deja a Cobranza:
 * recordatorio, aviso de vencida, pedir la diferencia, pedir otro comprobante
 * y el recibo de pago. Siempre quedan para aprobar ("Para aprobar" del
 * tablero) y se anotan en la línea de tiempo del caso. Lo demás lo escribe el
 * agente (src/agentes/cobranza/motor.ts).
 */
export type ContextoMensaje = {
  tipo: Pendiente;
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
};

export function redactarPedido(c: ContextoMensaje): string {
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
    default: {
      const paso = PASOS_COBRANZA.find((p) => p.paso === c.tipo);
      return completarPlantilla(paso?.plantilla ?? PASOS_COBRANZA[0].plantilla, vars);
    }
  }
}

/** Lo que dice el problema del comprobante, contado para el asegurado. */
function problemaParaElCliente(texto: string, compania: string): string {
  if (/destino no es/i.test(texto)) return `El pago figura a una cuenta que no es de ${compania}`;
  if (/^faltan/i.test(texto)) return "El monto no llega al de la cuota";
  if (/de más/i.test(texto)) return "El monto es mayor que el de la cuota";
  if (/ya se usó/i.test(texto)) return "Ese comprobante ya lo habíamos recibido por otro pago";
  if (/código de pago/i.test(texto)) return "El código de pago no corresponde a esta póliza";
  return "Hay un dato que no coincide con la cuota";
}

/** A quién y por dónde: el contacto de cobranza (en empresas, administración primero). */
export function destinatarioDe(a: Asegurado, preferido: "whatsapp" | "email") {
  const { telefono, email } = contactoParaCobranza(a);
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

const MOTIVO: Record<Paso, string> = {
  1: "Faltan pocos días para el vencimiento: es el primer recordatorio de esta cuota.",
  2: "Hoy vence la cuota.",
  3: "La cuota venció y todavía no figura el pago.",
  4: "No respondió los mensajes anteriores.",
  5: "Se acerca el fin del plazo de gracia de la compañía.",
};

/**
 * Deja para aprobar un pedido del Validador sobre un cobro. Si ya hay uno
 * igual esperando, devuelve ese. Devuelve null si el asegurado no tiene cómo
 * recibirlo.
 */
export async function prepararMensaje(
  cabezaId: number,
  tipo: Pendiente,
  extra: { motivo?: string; pagado?: number; problema?: string; agente?: "cobranza" | "validador" } = {},
): Promise<{ id: number } | null> {
  const referencia = referenciaDe(cabezaId, tipo);
  const [ya] = await db
    .select({ id: schema.mensajes.id })
    .from(schema.mensajes)
    .where(and(eq(schema.mensajes.referencia, referencia), eq(schema.mensajes.estado, "borrador")));
  if (ya) return { id: ya.id };

  const { cobro, asegurado: a, compania } = await datosDelCobro(cabezaId);
  // Las empresas manejan los pagos por email (administración); las personas, por WhatsApp.
  const destino = destinatarioDe(a, a.tipo === "persona" ? "whatsapp" : "email");
  if (!destino) return null;

  const texto = redactarPedido({
    tipo,
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
  });
  const motivo = extra.motivo ?? (typeof tipo === "number" ? MOTIVO[tipo] : null);
  const [m] = await db
    .insert(schema.mensajes)
    .values({
      aseguradoId: a.id,
      agente: extra.agente ?? "cobranza",
      canal: destino.canal,
      destinatario: destino.para,
      asunto: destino.canal === "email" ? `${cobro.compania ?? "Seguro"} · cuota ${cobro.cuotas[0].numero}` : null,
      referencia,
      motivo,
      texto,
      esEjemplo: a.esEjemplo,
    })
    .returning({ id: schema.mensajes.id });

  const caso = await asegurarCaso(cabezaId);
  await registrarEventos([
    {
      casoId: caso.id,
      tipo: "para_aprobar",
      canal: destino.canal,
      resumen: `${motivo ?? "Mensaje preparado"} Quedó en "Para aprobar".`,
      datos: { mensajeId: m.id, texto, para: destino.para, origen: "validador" },
    },
  ]);
  return { id: m.id };
}

export type { Cobro };
