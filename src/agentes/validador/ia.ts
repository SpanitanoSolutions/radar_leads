import "server-only";
import { z } from "zod";
import type { TablaExtraida } from "@/db/schema";
import type { AdjuntoIA } from "@/lib/ia";
import { ejecutarIA, estadoIA } from "@/lib/ia/ejecutar";
import type { ResultadoIA } from "@/lib/ia/motor";
import { esquemaComprobanteIA, type ComprobanteExtraido } from "@/lib/validador/comprobantes";
import { CAMPOS_LISTADO, esquemaPropuestaIA, type PropuestaIA } from "@/lib/validador/listados";
import type { AlcanceValidador } from "./cartera";

// La IA del Validador. Extrae y explica; nunca decide: lo que devuelve lo
// verifica el código (listados.ts, comprobantes.ts, matching.ts) y lo que no
// se puede verificar queda para que lo confirme el productor. Todo pasa por
// ejecutarIA(): modelo por tarea, zod, ia_uso y cuota. Sin IA, el agente
// sigue con formatos conocidos y carga manual.

const AGENTE = "validador";

export const OPERACIONES_IA = {
  mapear: "mapear_listado",
  extraerListado: "extraer_listado",
  extraerComprobante: "extraer_comprobante",
  explicar: "explicar_caso",
  resumir: "resumir_corrida",
} as const;
export type OperacionIA = (typeof OPERACIONES_IA)[keyof typeof OPERACIONES_IA];

export async function iaDisponible(operacion: OperacionIA, alcance: AlcanceValidador): Promise<boolean> {
  return (await estadoIA({ agente: AGENTE, operacion, ...alcance })).habilitada;
}

const CAMPOS = `Campos posibles (o "ninguno"): ${CAMPOS_LISTADO.join(", ")}.
- poliza: número de póliza. item: ítem, certificado o unidad (en flotas, un vehículo por ítem). endoso.
- cuota: número de cuota, solo o como "4/12". cuotaTotal: cantidad de cuotas.
- cupon: número de cupón, recibo o código de pago.
- monto: lo que se pagó o se debe de la cuota (el premio, no la prima ni la comisión). moneda.
- vencimiento: fecha de vencimiento de la cuota. fechaPago: fecha en que se cobró.
- medio: medio o forma de pago. estado: si está paga, impaga, vencida o anulada. compania: aseguradora.`;

const REGLAS_MAPEO = `Proponés cómo leer el listado de cobranza de una compañía de seguros argentina.
${CAMPOS}
Reglas:
- Usá los encabezados tal como están escritos. Cada campo va en una sola columna; si dudás, "ninguno".
- estadoPorDefecto: solo si el listado no tiene columna de estado y por su título o contenido es claramente de cuotas pagas ("pagada") o impagas ("pendiente"); si no, null.
- estados: los valores propios de la compañía en la columna de estado y qué significan (pendiente, pagada, vencida o anulada). "Cancelada" en una cuota puede ser saldada o anulada: decidilo por el contexto o dejalo afuera.
- medios: los valores propios de la columna de medio de pago y a qué medio corresponden.
- monedaPorDefecto: ARS salvo que el listado sea en dólares.`;

/** Paso 1 con un formato nuevo: Haiku propone el mapeo de columnas. El productor lo confirma. */
export async function proponerMapeoConIA(tabla: TablaExtraida, alcance: AlcanceValidador): Promise<ResultadoIA<PropuestaIA>> {
  const muestra = tabla.filas.filter((f) => f.some((c) => c.trim())).slice(0, 12);
  return ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES_IA.mapear,
    tarea: "mapear",
    ...alcance,
    system: REGLAS_MAPEO,
    mensaje: `Encabezados: ${JSON.stringify(tabla.encabezados)}\nPrimeras filas: ${JSON.stringify(muestra)}`,
    esquema: esquemaPropuestaIA,
  });
}

const esquemaListadoPdf = z.object({
  encabezados: z.array(z.string()),
  filas: z.array(z.array(z.string())),
  propuesta: esquemaPropuestaIA,
});

/**
 * Un listado en PDF: Haiku transcribe la tabla celda por celda (sin calcular
 * ni corregir) y propone el mapeo. Los montos, fechas y estados los lee
 * después el código con la plantilla.
 */
export async function extraerListadoPdf(pdf: AdjuntoIA, alcance: AlcanceValidador): Promise<ResultadoIA<{ tabla: TablaExtraida; propuesta: PropuestaIA }>> {
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES_IA.extraerListado,
    tarea: "extraer",
    ...alcance,
    system: `Transcribís la tabla de cuotas de un listado de cobranza de una compañía de seguros argentina.
- Copiá cada celda tal como está escrita: no calcules, no corrijas ni cambies formatos de montos o fechas.
- Una fila por cuota, con el mismo orden de columnas que los encabezados. Una celda vacía va como "".
- Si la tabla sigue en varias páginas, juntala en una sola. Salteá títulos, pies y totales.
${REGLAS_MAPEO}`,
    mensaje: "Transcribí la tabla del PDF adjunto y proponé cómo leerla.",
    adjuntos: [pdf],
    esquema: esquemaListadoPdf,
  });
  if (!r.ok) return r;
  const ancho = r.datos.encabezados.length;
  const filas = r.datos.filas.map((f) => Array.from({ length: ancho }, (_, i) => (f[i] ?? "").trim()));
  return { ...r, datos: { tabla: { encabezados: r.datos.encabezados.map((e) => e.trim()), filas }, propuesta: r.datos.propuesta } };
}

/** Un comprobante (imagen o PDF): Haiku lee monto, fecha, medio, referencia, pagador y destino. */
export async function extraerComprobante(archivo: AdjuntoIA, alcance: AlcanceValidador): Promise<ResultadoIA<ComprobanteExtraido>> {
  return ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES_IA.extraerComprobante,
    tarea: "extraer",
    ...alcance,
    system: `Leés comprobantes de pago argentinos (transferencias, Mercado Pago, Pago Fácil, Rapipago) que mandan los asegurados.
- Copiá lo que está escrito; lo que no se lee con claridad va en null. No adivines.
- monto: el importe pagado, como número (1.915,61 → 1915.61). moneda: ARS o USD.
- fecha: la del pago, en AAAA-MM-DD.
- medio: el tipo de pago y el banco o la billetera ("Transferencia · Banco Nación").
- referencia: concepto, referencia o código de pago. numeroOperacion: número de operación o transacción.
- pagador y documentoPagador: quien pagó y su DNI, CUIT o CUIL. destinoTitular y destinoCuenta: a quién se pagó y su CBU, CVU o alias.`,
    mensaje: "Leé el comprobante adjunto.",
    adjuntos: [archivo],
    esquema: esquemaComprobanteIA,
  });
}

export const ACCIONES_PROPUESTAS = ["confirmar", "revisar", "enviar_a_cobranza", "avisar_productor"] as const;
export type AccionPropuesta = (typeof ACCIONES_PROPUESTAS)[number];

const esquemaExplicacion = z.object({
  explicacion: z.string(),
  accion: z.enum(ACCIONES_PROPUESTAS),
  cuotaSugeridaId: z.number().int().nullable(),
});

export type CasoParaExplicar = {
  pago: unknown;
  motivo: string;
  candidatos: { cuotaId: number; puntaje: number; motivos: string[]; cuota: unknown }[];
};

/**
 * Un caso "a revisar": Sonnet explica qué pasa, cuál es el candidato más
 * probable y qué haría. Solo sugiere: la cuota sugerida tiene que ser una de
 * las candidatas o se descarta.
 */
export async function explicarCaso(caso: CasoParaExplicar, alcance: AlcanceValidador): Promise<ResultadoIA<z.infer<typeof esquemaExplicacion>>> {
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES_IA.explicar,
    tarea: "explicar",
    ...alcance,
    system: `Ayudás a un productor de seguros argentino a revisar un pago que la compañía informó y no coincide del todo con su cartera.
- Explicá en dos o tres oraciones, en castellano rioplatense y con voseo, qué pasa y cuál de las cuotas candidatas es la más probable y por qué.
- Casos típicos: monto distinto (ajuste, recargo o pago parcial), otra cuota, pago agrupado de varias cuotas o de una flota, cuota pagada que vuelve a impaga, anulación sin aviso.
- accion: "confirmar" si es claramente esa cuota; "revisar" si hay que mirarlo; "enviar_a_cobranza" si falta plata del asegurado; "avisar_productor" si la compañía informa algo raro.
- cuotaSugeridaId: el id de una de las candidatas, o null. Nunca inventes un id.`,
    mensaje: JSON.stringify(caso),
    esquema: esquemaExplicacion,
  });
  if (!r.ok) return r;
  const validas = new Set(caso.candidatos.map((c) => c.cuotaId));
  const cuotaSugeridaId = r.datos.cuotaSugeridaId !== null && validas.has(r.datos.cuotaSugeridaId) ? r.datos.cuotaSugeridaId : null;
  return { ...r, datos: { ...r.datos, explicacion: r.datos.explicacion.trim().slice(0, 1000), cuotaSugeridaId } };
}

/** El resumen diario para el productor, sobre los números que ya calculó el código. */
export async function resumirCorrida(datos: { resumenBase: string; casos: string[] }, alcance: AlcanceValidador): Promise<ResultadoIA<{ resumen: string }>> {
  const r = await ejecutarIA({
    agente: AGENTE,
    operacion: OPERACIONES_IA.resumir,
    tarea: "explicar",
    ...alcance,
    system: `Escribís el resumen diario del Validador de pagos para un productor de seguros argentino: tres o cuatro oraciones, en castellano rioplatense con voseo.
- Usá solo los números del resumen base: no calcules ni inventes otros.
- Si hay casos para revisar, mencioná los más importantes en pocas palabras.`,
    mensaje: JSON.stringify(datos),
    esquema: z.object({ resumen: z.string() }),
  });
  if (!r.ok) return r;
  return { ...r, datos: { resumen: r.datos.resumen.trim().slice(0, 1500) } };
}
