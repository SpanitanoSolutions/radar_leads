import { diaDeLaSemana, diaYMes, diasEntre, sumarDias } from "./fechas";

// Cobranza: la secuencia de cinco pasos de cada cobro (qué paso toca hoy,
// cuál viene después, si está en pausa) y los textos que la explican.

export type Paso = 1 | 2 | 3 | 4 | 5;

/** Fecha en que corresponde cada paso. El 5 depende del plazo de gracia de la compañía. */
export function fechaDelPaso(paso: Paso, vencimiento: string, diasGracia: number): string {
  switch (paso) {
    case 1:
      return sumarDias(vencimiento, -3);
    case 2:
      return vencimiento;
    case 3:
      return sumarDias(vencimiento, 3);
    case 4:
      return sumarDias(vencimiento, 10);
    case 5:
      return sumarDias(vencimiento, diasGracia - 5);
  }
}

function pasosEnOrden(vencimiento: string, diasGracia: number) {
  return ([1, 2, 3, 4, 5] as Paso[])
    .map((paso) => ({ paso, fecha: fechaDelPaso(paso, vencimiento, diasGracia) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.paso - b.paso);
}

/**
 * El paso que toca hoy: el último cuya fecha ya llegó y que todavía no se hizo.
 * Si se saltearon días, no se mandan todos los atrasados: solo el más reciente.
 */
export function pasoQueToca(vencimiento: string, hoy: string, diasGracia: number, hecho: number): Paso | null {
  const vencidos = pasosEnOrden(vencimiento, diasGracia).filter((p) => p.fecha <= hoy && p.paso > hecho);
  return vencidos.at(-1)?.paso ?? null;
}

/** El próximo paso que todavía no llegó. */
export function proximoPaso(vencimiento: string, hoy: string, diasGracia: number, hecho: number): { paso: Paso; fecha: string } | null {
  return pasosEnOrden(vencimiento, diasGracia).find((p) => p.fecha > hoy && p.paso > hecho) ?? null;
}

const NOMBRE_PASO: Record<Paso, string> = {
  1: "Recordatorio",
  2: "Aviso del vencimiento",
  3: "Mensaje de cuota vencida",
  4: "Llamada tuya",
  5: "Aviso de riesgo de cobertura",
};

/** Qué tipo de borrador espera aprobación: un paso de la secuencia o algo puntual del cobro. */
export type Pendiente = Paso | "diferencia" | "comprobante" | "recibo";

/** "cuota:12:paso:2" → { cuotaId: 12, tipo: 2 }; "cuota:12:diferencia" → { cuotaId: 12, tipo: "diferencia" }. */
export function leerReferencia(referencia: string | null): { cuotaId: number; tipo: Pendiente } | null {
  const m = /^cuota:(\d+):(?:paso:([1-5])|(diferencia|comprobante|recibo))$/.exec(referencia ?? "");
  if (!m) return null;
  return { cuotaId: Number(m[1]), tipo: m[2] ? (Number(m[2]) as Paso) : (m[3] as Pendiente) };
}

export function referenciaDe(cuotaId: number, tipo: Pendiente): string {
  return typeof tipo === "number" ? `cuota:${cuotaId}:paso:${tipo}` : `cuota:${cuotaId}:${tipo}`;
}

/** Lo que se muestra como "Próximo paso" en la tabla de seguimiento. */
export function textoProximo(s: {
  vencimiento: string;
  hoy: string;
  diasGracia: number;
  hecho: number;
  pausa: { motivo: string; hasta: string | null } | null;
  sinContacto: boolean;
  pendiente: { tipo: Pendiente; canal: "whatsapp" | "email" | "llamada" } | null;
}): string {
  if (s.pausa) return s.pausa.hasta ? `En pausa hasta el ${diaYMes(s.pausa.hasta)}` : "En pausa hasta que lo resuelvas";
  if (s.sinContacto) return "Completar el contacto en la ficha";
  if (s.pendiente) {
    const canal = s.pendiente.canal === "whatsapp" ? "WhatsApp" : "email";
    if (s.pendiente.tipo === "diferencia") return "Pedir la diferencia · para aprobar";
    if (s.pendiente.tipo === "comprobante") return "Pedir otro comprobante · para aprobar";
    if (s.pendiente.tipo === "recibo") return "Recibo de pago · para aprobar";
    if (s.pendiente.tipo === 4) return "Llamada tuya · hoy";
    if (s.pendiente.tipo === 1) return `Recordatorio por ${canal} · para aprobar`;
    if (s.pendiente.tipo === 2) return `Aviso por ${canal} · para aprobar`;
    return `${NOMBRE_PASO[s.pendiente.tipo]} · para aprobar`;
  }
  const proximo = proximoPaso(s.vencimiento, s.hoy, s.diasGracia, s.hecho);
  return proximo ? `${NOMBRE_PASO[proximo.paso]} el ${diaYMes(proximo.fecha)}` : "Sin pasos pendientes";
}

/** Pastilla de cada tarjeta para aprobar: "Paso 2 · Vence en 2 días", "Pago incompleto". */
export function etiquetaPendiente(tipo: Pendiente, vencimiento: string, hoy: string): { texto: string; tono: "aviso" | "vencida" | "llamada" | "problema" } {
  if (tipo === "diferencia") return { texto: "Pago incompleto", tono: "problema" };
  if (tipo === "comprobante") return { texto: "Comprobante con problemas", tono: "problema" };
  if (tipo === "recibo") return { texto: "Recibo de pago", tono: "aviso" };
  const dias = diasEntre(hoy, vencimiento);
  const cuando =
    dias > 0 ? `Vence en ${dias === 1 ? "1 día" : `${dias} días`}` : dias === 0 ? "Vence hoy" : `Vencida hace ${-dias === 1 ? "1 día" : `${-dias} días`}`;
  return { texto: `Paso ${tipo} · ${cuando}`, tono: tipo === 4 ? "llamada" : dias < 0 ? "vencida" : "aviso" };
}

/** "vence el jueves 29/10", "vence hoy", "venció el 22/10". */
export function textoVencimiento(vencimiento: string, hoy: string): string {
  const dias = diasEntre(hoy, vencimiento);
  if (dias === 0) return "vence hoy";
  if (dias < 0) return `venció el ${diaYMes(vencimiento)}`;
  return dias <= 6 ? `vence el ${diaDeLaSemana(vencimiento)}` : `vence el ${diaYMes(vencimiento)}`;
}

export type Grupo = "vencidas" | "porvencer" | "pausadas";

export function grupoDe(vencimiento: string, hoy: string, pausado: boolean): Grupo {
  if (pausado) return "pausadas";
  return vencimiento < hoy ? "vencidas" : "porvencer";
}

/** Color del estado en la tabla: bien (promesa), mal (problema o muy atrasada) o neutro. */
export function tonoEstado(s: { pausa: { hasta: string | null } | null; sinContacto: boolean; problema: boolean; atraso: number; hecho: number }) {
  if (s.pausa?.hasta) return "ok" as const;
  if (s.pausa || s.sinContacto || s.problema || (s.atraso > 0 && s.hecho >= 3)) return "mal" as const;
  return "neutro" as const;
}

/** Regla "enviar solo de lunes a sábado, entre las 9 y las 20 h" (hora argentina). */
export function dentroDeHorario(fecha: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(fecha);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  return dia !== "Sun" && hora >= 9 && hora < 20;
}

/** Atraso a partir del cual una cuota está cerca de quedar sin cobertura (el paso 4, la llamada). */
export const ATRASO_RIESGO = 10;

export function kpisCobranza(
  cobros: { asegurado: string; aseguradoId: number; monto: number; vencimiento: string; pagada: boolean; cuotas: number }[],
  hoy: string,
) {
  const mes = hoy.slice(0, 7);
  const delMes = cobros.filter((c) => c.vencimiento.startsWith(mes));
  const total = delMes.reduce((s, c) => s + c.monto, 0);
  const cobrado = delMes.filter((c) => c.pagada).reduce((s, c) => s + c.monto, 0);
  const vencidas = cobros.filter((c) => !c.pagada && c.vencimiento < hoy);
  const riesgo = vencidas
    .map((c) => ({ ...c, atraso: diasEntre(c.vencimiento, hoy) }))
    .filter((c) => c.atraso >= ATRASO_RIESGO)
    .sort((a, b) => b.atraso - a.atraso);
  return {
    porCobrar: total,
    cuotasDelMes: delMes.reduce((n, c) => n + c.cuotas, 0),
    aseguradosDelMes: new Set(delMes.map((c) => c.aseguradoId)).size,
    cobrado,
    porcentaje: total ? Math.round((cobrado / total) * 100) : 0,
    vencidas: vencidas.length,
    montoVencido: vencidas.reduce((s, c) => s + c.monto, 0),
    riesgo,
  };
}
