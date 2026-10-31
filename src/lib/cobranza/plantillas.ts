import { unirConY } from "@/lib/asegurados";
import { diaYMes } from "@/lib/fechas";

// Mensajes sin IA: cuando la IA no está (sin clave, apagada o sin cuota), el
// agente escribe con estas plantillas, según el recibo más atrasado del
// asegurado. Pasan por las mismas reglas que los de la IA.

export type ReciboParaPlantilla = {
  compania: string | null;
  ramo: string;
  poliza: string | null;
  recibo: string;
  /** Ya formateado ("$ 14.974,43"). */
  monto: string;
  vencimiento: string;
  diasParaVencer: number;
  comoPagar: string | null;
};

const detalle = (r: ReciboParaPlantilla) =>
  `${r.ramo.toLowerCase()} con ${r.compania ?? "la compañía"} (${r.monto}, ${r.diasParaVencer < 0 ? "venció" : "vence"} el ${diaYMes(r.vencimiento)})`;

/** Asunto y texto de un recordatorio para uno o varios recibos del mismo asegurado. */
export function mensajeSinIA(nombre: string, recibos: ReciboParaPlantilla[], firma: string): { asunto: string; texto: string } {
  const ordenados = [...recibos].sort((a, b) => a.diasParaVencer - b.diasParaVencer);
  const peor = ordenados[0];
  const varios = ordenados.length > 1;
  const pagar = peor.comoPagar ? ` Podés pagarlo por ${peor.comoPagar}.` : "";
  let cuerpo: string;
  if (varios) {
    cuerpo = `te escribo por las cuotas de tus seguros: ${unirConY(ordenados.map(detalle))}.${pagar} Si ya las pagaste, avisame y lo reviso.`;
  } else if (peor.diasParaVencer > 0) {
    cuerpo = `te recuerdo que el ${diaYMes(peor.vencimiento)} vence la cuota de tu seguro de ${peor.ramo.toLowerCase()} con ${peor.compania ?? "la compañía"} (${peor.monto}).${pagar} Si ya la pagaste, avisame.`;
  } else if (peor.diasParaVencer === 0) {
    cuerpo = `hoy vence la cuota de tu seguro de ${peor.ramo.toLowerCase()} con ${peor.compania ?? "la compañía"} (${peor.monto}).${pagar} Si ya la pagaste, mandame el comprobante por acá.`;
  } else if (peor.diasParaVencer > -15) {
    cuerpo = `la cuota de tu seguro de ${peor.ramo.toLowerCase()} con ${peor.compania ?? "la compañía"} (${peor.monto}) venció el ${diaYMes(peor.vencimiento)} y todavía no me figura el pago. Si ya la pagaste, mandame el comprobante y lo reviso.`;
  } else {
    cuerpo = `la cuota de tu seguro de ${peor.ramo.toLowerCase()} con ${peor.compania ?? "la compañía"} (${peor.monto}) sigue impaga desde el ${diaYMes(peor.vencimiento)}. Te escribo para que no te quedes sin cobertura: si ya la pagaste, mandame el comprobante; si no, decime cuándo podés y lo anoto.`;
  }
  const asunto = varios ? "Tus cuotas de seguro pendientes" : `${peor.compania ?? "Tu seguro"} · póliza ${peor.poliza ?? "s/n"} · ${peor.diasParaVencer < 0 ? "cuota vencida" : "recordatorio de pago"}`;
  return { asunto, texto: `Hola ${nombre}, ¿cómo estás? ${cuerpo[0].toUpperCase()}${cuerpo.slice(1)} Saludos, ${firma}` };
}

export function guionSinIA(nombre: string, recibos: ReciboParaPlantilla[], firma: string): string {
  return `Presentate como asistente de ${firma}. Recordale a ${nombre} ${recibos.length > 1 ? "las cuotas" : "la cuota"} de ${unirConY(recibos.map(detalle))}. Preguntale cuándo puede pagar y anotá la fecha.`;
}

const ORDINAL = ["", "Primer", "Segundo", "Tercer", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo"];

/** "Cuarto intento. Póliza vencida hace 11 días, $ 14.974,43." */
export function textoIntento(n: number, diasParaVencer: number, monto: string): string {
  const intento = n < ORDINAL.length ? `${ORDINAL[n]} intento` : `Intento ${n}`;
  const dias = (d: number) => (d === 1 ? "1 día" : `${d} días`);
  const situacion =
    diasParaVencer < 0 ? `Póliza vencida hace ${dias(-diasParaVencer)}` : diasParaVencer === 0 ? "Vence hoy" : `Vence en ${dias(diasParaVencer)}`;
  return `${intento}. ${situacion}, ${monto}.`;
}
