import type { ConfigCobranza } from "@/db/schema";

// Los cinco pasos de la secuencia de cobranza, con su plantilla por defecto.
// Las plantillas usan {nombre}, {compañía}, {ramo}, {cuota}, {monto}, {vence},
// {medios de pago}, {fin de gracia} y {productor}.

export type DefinicionPaso = {
  paso: number;
  titulo: string;
  cuando: string;
  canal: string;
  /** El paso 4 es una tarea para el productor: el agente no escribe. */
  tarea?: boolean;
  plantilla: string;
};

export const PASOS_COBRANZA: DefinicionPaso[] = [
  {
    paso: 1,
    titulo: "Recordatorio",
    cuando: "3 días antes del vencimiento",
    canal: "Email y WhatsApp",
    plantilla:
      "Hola {nombre}, te recuerdo que el {vence} vence la cuota {cuota} de tu seguro de {ramo} con {compañía} ({monto}). Podés pagarla por {medios de pago}. Saludos, {productor}",
  },
  {
    paso: 2,
    titulo: "Vence hoy",
    cuando: "El día del vencimiento",
    canal: "WhatsApp",
    plantilla:
      "Hola {nombre}, hoy vence la cuota {cuota} de tu seguro de {ramo} ({monto}). Si ya la pagaste, mandame el comprobante por acá. Saludos, {productor}",
  },
  {
    paso: 3,
    titulo: "Cuota vencida",
    cuando: "3 días después",
    canal: "WhatsApp",
    plantilla:
      "Hola {nombre}, la cuota {cuota} de tu seguro de {ramo} venció el {vence} y todavía no me figura el pago. Si ya pagaste, mandame el comprobante y lo reviso. Saludos, {productor}",
  },
  {
    paso: 4,
    titulo: "Llamada tuya",
    cuando: "10 días después",
    canal: "Tarea para vos",
    tarea: true,
    plantilla:
      'El agente no escribe: te deja el cliente en "Para aprobar" con el teléfono y el historial de mensajes para que lo llames.',
  },
  {
    paso: 5,
    titulo: "Aviso de riesgo de cobertura",
    cuando: "5 días antes del fin del plazo de gracia",
    canal: "WhatsApp y email",
    plantilla:
      "Hola {nombre}, la cuota {cuota} de tu seguro de {ramo} sigue impaga. Si no se regulariza antes del {fin de gracia}, {compañía} puede suspender la cobertura. Escribime y lo resolvemos. Saludos, {productor}",
  },
];

export const CONFIG_COBRANZA_INICIAL: ConfigCobranza = {
  pasos: PASOS_COBRANZA.map((p) => ({ paso: p.paso, plantilla: p.plantilla, automatico: p.paso === 1 })),
  reglas: { cortarAlConfirmar: true, horario: true, contactoAdministracion: true, avisarRespuestas: true },
};
