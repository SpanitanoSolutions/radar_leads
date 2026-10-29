import type { Chequeo, CuentaCompania } from "@/db/schema";
import { normalizar } from "@/fuentes/clasificacion";
import { diaEnArgentina, diasEntre } from "./fechas";
import { pesos } from "./formato";

// Validador de pagos: junta las cuotas que se pagan juntas (un "cobro") y
// revisa los comprobantes contra la cuota. Lo que muestra la pantalla está en
// src/lib/validador/pantalla.ts.

export type CuotaConPoliza = {
  id: number;
  numero: number;
  monto: number;
  vencimiento: string;
  estado: "pendiente" | "pagada" | "vencida";
  pagadaEl: Date | null;
  medioPago: string | null;
  polizaId: number;
  polizaNumero: string | null;
  ramo: string;
  compania: string | null;
  cantidadCuotas: number;
  aseguradoId: number;
  asegurado: string;
};

export type Cobro = {
  /** La primera cuota del cobro: a ella apuntan comprobantes y seguimientos. */
  cabezaId: number;
  cuotas: CuotaConPoliza[];
  aseguradoId: number;
  asegurado: string;
  compania: string | null;
  vencimiento: string;
  monto: number;
  /** "Auto · 88-322019", "Flota · 3 pólizas", "Auto y Vida · 2 pólizas". */
  poliza: string;
  /** "Cuota 4 de 12". */
  cuota: string;
  pagada: boolean;
  pagadaEl: Date | null;
  medioPago: string | null;
  numerosPoliza: string[];
};

/** Las cuotas del mismo asegurado, compañía y vencimiento se cobran juntas. */
export function agruparCobros(cuotas: CuotaConPoliza[]): Cobro[] {
  const grupos = new Map<string, CuotaConPoliza[]>();
  for (const c of cuotas) {
    const clave = `${c.aseguradoId}|${c.compania ?? ""}|${c.vencimiento}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }
  return [...grupos.values()].map((lista) => {
    lista.sort((a, b) => a.id - b.id);
    const [primera] = lista;
    const ramos = [...new Set(lista.map((c) => c.ramo))];
    const numeros = lista.map((c) => c.polizaNumero).filter((n): n is string => Boolean(n));
    const poliza =
      lista.length === 1
        ? [primera.ramo, primera.polizaNumero].filter(Boolean).join(" · ")
        : `${ramos.length > 1 ? `${ramos.slice(0, -1).join(", ")} y ${ramos.at(-1)}` : ramos[0]} · ${lista.length} pólizas`;
    const pagada = lista.every((c) => c.estado === "pagada");
    return {
      cabezaId: primera.id,
      cuotas: lista,
      aseguradoId: primera.aseguradoId,
      asegurado: primera.asegurado,
      compania: primera.compania,
      vencimiento: primera.vencimiento,
      monto: Math.round(lista.reduce((s, c) => s + c.monto, 0) * 100) / 100,
      poliza,
      cuota: `Cuota ${primera.numero} de ${primera.cantidadCuotas}`,
      pagada,
      pagadaEl: pagada ? (lista.map((c) => c.pagadaEl).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null) : null,
      medioPago: pagada ? (primera.medioPago ?? null) : null,
      numerosPoliza: numeros,
    };
  });
}

export type ComprobanteLeido = {
  medio: string | null;
  fecha: Date | null;
  monto: number | null;
  destino: string | null;
  numeroOperacion: string | null;
};

/** Rapipago, Pago Fácil y similares se pagan con un código de la póliza, no a una cuenta. */
export function esPagoConCodigo(medio: string | null): boolean {
  return /rapipago|pago ?facil|cobro ?express|provincia ?net/.test(normalizar(medio ?? ""));
}

const limpiar = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "");

/** Los cuatro chequeos del comprobante contra el cobro. */
export function chequearComprobante(
  comprobante: ComprobanteLeido,
  cobro: Pick<Cobro, "monto" | "vencimiento" | "compania" | "numerosPoliza">,
  contexto: { cuentas: CuentaCompania[]; operacionesUsadas: Set<string> },
): Chequeo[] {
  const chequeos: Chequeo[] = [];
  const conCodigo = esPagoConCodigo(comprobante.medio);

  // 1. Monto
  if (comprobante.monto === null) {
    chequeos.push({ id: "monto", resultado: "duda", texto: "No se lee el monto en el comprobante." });
  } else {
    const diferencia = Math.round((cobro.monto - comprobante.monto) * 100) / 100;
    if (Math.abs(diferencia) < 1) chequeos.push({ id: "monto", resultado: "ok", texto: "El monto coincide con la cuota." });
    else if (diferencia > 0)
      chequeos.push({
        id: "monto",
        resultado: "mal",
        texto: `Faltan ${pesos(diferencia)}: pagó ${pesos(comprobante.monto)} y la cuota es ${pesos(cobro.monto)}.`,
      });
    else
      chequeos.push({
        id: "monto",
        resultado: "duda",
        texto: `Pagó ${pesos(-diferencia)} de más: pagó ${pesos(comprobante.monto)} y la cuota es ${pesos(cobro.monto)}.`,
      });
  }

  // 2. Destino
  const destino = limpiar(comprobante.destino ?? "");
  const compania = cobro.compania ?? "la compañía";
  if (!destino) {
    chequeos.push({ id: "destino", resultado: "duda", texto: "No se lee a quién se pagó." });
  } else if (conCodigo) {
    const coincide = cobro.numerosPoliza.some((n) => destino.includes(limpiar(n)));
    chequeos.push(
      coincide
        ? { id: "destino", resultado: "ok", texto: "El código de pago corresponde a esta póliza." }
        : { id: "destino", resultado: "mal", texto: "El código de pago no corresponde a esta póliza." },
    );
  } else {
    const cuentas = contexto.cuentas.flatMap((c) => [c.titular, c.alias, c.cbu].filter((x): x is string => Boolean(x)).map(limpiar));
    const coincide = cuentas.some((c) => c && (destino.includes(c) || c.includes(destino)));
    chequeos.push(
      coincide
        ? { id: "destino", resultado: "ok", texto: "El destino es la cuenta de la compañía." }
        : { id: "destino", resultado: "mal", texto: `El destino no es una cuenta de ${compania}. Confirmar a quién le transfirió.` },
    );
  }

  // 3. Fecha
  if (!comprobante.fecha) {
    chequeos.push({ id: "fecha", resultado: "duda", texto: "No se lee la fecha del pago." });
  } else {
    const atraso = diasEntre(cobro.vencimiento, diaEnArgentina(comprobante.fecha));
    chequeos.push(
      atraso <= 0
        ? { id: "fecha", resultado: "ok", texto: "Pagó antes del vencimiento." }
        : {
            id: "fecha",
            resultado: "duda",
            texto: `Pagó ${atraso === 1 ? "1 día" : `${atraso} días`} después del vencimiento: revisar si la póliza sigue vigente.`,
          },
    );
  }

  // 4. Número de operación
  const operacion = limpiar(comprobante.numeroOperacion ?? "");
  const nombre = conCodigo ? "La transacción" : "El número de operación";
  if (!operacion) chequeos.push({ id: "operacion", resultado: "duda", texto: "No se lee el número de operación." });
  else if (contexto.operacionesUsadas.has(operacion))
    chequeos.push({ id: "operacion", resultado: "mal", texto: `${nombre} ya se usó en otro pago.` });
  else chequeos.push({ id: "operacion", resultado: "ok", texto: `${nombre} no se usó antes.` });

  return chequeos;
}

export const normalizarOperacion = limpiar;

export function problemasDe(chequeos: Chequeo[]): number {
  return chequeos.filter((c) => c.resultado !== "ok").length;
}

/** "Hoy", "En 3 días", "Hace 8 días", con su tono. */
export function textoVence(vencimiento: string, hoy: string): { texto: string; tono: "rojo" | "ambar-fuerte" | "ambar" | "gris" } {
  const dias = diasEntre(hoy, vencimiento);
  if (dias < 0) return { texto: `Hace ${-dias === 1 ? "1 día" : `${-dias} días`}`, tono: "rojo" };
  if (dias === 0) return { texto: "Hoy", tono: "ambar-fuerte" };
  return { texto: `En ${dias === 1 ? "1 día" : `${dias} días`}`, tono: dias <= 7 ? "ambar" : "gris" };
}

/** Qué falta conectar para que el validador trabaje solo. Null si está todo. */
export function avisoConexionesValidador(c: { whatsapp: boolean; mercadopago: boolean; banco: boolean }): string | null {
  const cobros = c.mercadopago || c.banco;
  if (c.whatsapp && cobros) return null;
  if (!c.whatsapp && !cobros) {
    return "Hoy el agente lee los comprobantes que llegan por email. Conectá WhatsApp para recibirlos desde el chat y Mercado Pago o tu banco para confirmar cobros sin comprobante.";
  }
  if (!c.whatsapp) return "Hoy el agente lee los comprobantes que llegan por email. Conectá WhatsApp para recibirlos desde el chat.";
  return "Conectá Mercado Pago o tu banco para que el agente confirme los cobros que llegan sin comprobante.";
}

export type AccionCobro = "confirmar" | "pedir" | "confirmarIgual" | "recordatorio" | "marcarPagada" | "completarContacto" | "recibo";

/** "Hoy", "Ayer" o "dd/mm", según el día en Argentina. */
function cuandoFue(fecha: Date, hoy: string): string {
  const dias = diasEntre(diaEnArgentina(fecha), hoy);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  const d = diaEnArgentina(fecha);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/**
 * Lo que muestra cada fila del validador: el estado del comprobante, el
 * título del detalle, los chequeos y qué se puede hacer.
 */
export function detalleCobro(
  cobro: Pick<Cobro, "pagada" | "pagadaEl" | "medioPago">,
  comprobante: { chequeos: Chequeo[] } | null,
  contexto: { hoy: string; tieneContacto: boolean; ultimoEnvio: { canal: string; enviadoEl: Date } | null },
): {
  estado: { texto: string; tono: "verde" | "rojo" | "texto-verde" | "texto" };
  titulo: string;
  chequeos: Chequeo[];
  acciones: AccionCobro[];
} {
  if (cobro.pagada) {
    const cuando = cobro.pagadaEl ? cuandoFue(cobro.pagadaEl, contexto.hoy) : "Hace poco";
    const texto = `${cuando} · ${(cobro.medioPago ?? "confirmado").toLowerCase()}`;
    return {
      estado: { texto, tono: "texto-verde" },
      titulo: "Pago confirmado",
      chequeos: [{ id: "monto", resultado: "ok", texto: `Cuota registrada como pagada: ${texto.toLowerCase()}.` }],
      acciones: ["recibo"],
    };
  }
  if (comprobante) {
    const malos = problemasDe(comprobante.chequeos);
    return malos === 0
      ? {
          estado: { texto: "Recibido · todo coincide", tono: "verde" },
          titulo: "El comprobante está bien",
          chequeos: comprobante.chequeos,
          acciones: ["confirmar"],
        }
      : {
          estado: { texto: `Recibido · ${malos === 1 ? "1 problema" : `${malos} problemas`}`, tono: "rojo" },
          titulo: "Hay algo que no cierra",
          chequeos: comprobante.chequeos,
          acciones: ["pedir", "confirmarIgual"],
        };
  }
  if (!contexto.tieneContacto) {
    return {
      estado: { texto: "Sin comprobante · sin contacto", tono: "texto" },
      titulo: "Todavía no llegó el comprobante",
      chequeos: [{ id: "destino", resultado: "mal", texto: "El asegurado no tiene teléfono ni email cargados: el agente no puede avisarle." }],
      acciones: ["completarContacto", "marcarPagada"],
    };
  }
  const envio = contexto.ultimoEnvio;
  return {
    estado: { texto: envio ? "Sin comprobante · avisado" : "Sin comprobante", tono: "texto" },
    titulo: "Todavía no llegó el comprobante",
    chequeos: [
      {
        id: "fecha",
        resultado: "duda",
        texto: envio
          ? `Recordatorio enviado ${cuandoFue(envio.enviadoEl, contexto.hoy).toLowerCase().replace(/^(\d)/, "el $1")} por ${envio.canal === "whatsapp" ? "WhatsApp" : "email"}.`
          : "Todavía no se le envió recordatorio.",
      },
    ],
    acciones: ["recordatorio", "marcarPagada"],
  };
}
