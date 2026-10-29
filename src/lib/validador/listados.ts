import { z } from "zod";
import type { ProblemaFuente } from "@/db/schema";
import { normalizar } from "@/fuentes/clasificacion";
import type { EstadoCompaniaCuota, MedioPago, Moneda, PagoNormalizado } from "@/lib/conectores/tipos";
import { companiaCanonica, leerFecha, leerMonto, normalizarEncabezado, sugerirMapeo, type CampoImportable, type Tabla } from "@/lib/importacion";

// Listados de cobranza de las compañías (sección 4.2 de
// docs/specs/validador-v2.md): el productor los baja de cada portal y los
// sube. Con la plantilla de la compañía (conector_mapeos, operación
// importar_listado) se leen sin IA: cada columna va a un campo de
// PagoNormalizado y los montos, fechas y estados los entiende este código.
// Una fila que no se puede leer se informa con su número; nunca se descarta
// en silencio.

export const OPERACION_LISTADO = "importar_listado";

export const CAMPOS_LISTADO = [
  "poliza",
  "item",
  "endoso",
  "cuota",
  "cuotaTotal",
  "cupon",
  "monto",
  "moneda",
  "vencimiento",
  "fechaPago",
  "medio",
  "estado",
  "compania",
] as const;
export type CampoListado = (typeof CAMPOS_LISTADO)[number];

const ESTADOS_COMPANIA = ["pendiente", "pagada", "vencida", "anulada"] as const satisfies readonly EstadoCompaniaCuota[];
const MEDIOS = ["debito_tarjeta", "debito_cbu", "pago_facil", "rapipago", "transferencia", "mercadopago", "efectivo_productor"] as const satisfies readonly MedioPago[];

/** El orden importa: cada encabezado va al primer campo que lo reconoce. */
export const COLUMNAS_LISTADO: CampoImportable<CampoListado>[] = [
  { id: "poliza", nombre: "Póliza", sinonimos: /\bpoliza\b|^pol$|^nro pol/ },
  { id: "item", nombre: "Ítem", sinonimos: /\b(item|inciso|unidad|certificado)\b/ },
  { id: "endoso", nombre: "Endoso", sinonimos: /\bendoso\b|^end$/ },
  { id: "cuotaTotal", nombre: "Total de cuotas", sinonimos: /\b(cant(idad)? (de )?cuotas|total (de )?cuotas|cuotas totales|de cuotas)\b/ },
  { id: "cuota", nombre: "Cuota", sinonimos: /\bcuota\b|^nro cuota|^n cuota/ },
  { id: "cupon", nombre: "Cupón", sinonimos: /\b(cupon|recibo|boleta)\b|codigo de pago/ },
  { id: "moneda", nombre: "Moneda", sinonimos: /\b(moneda|divisa)\b|^mon$/ },
  { id: "fechaPago", nombre: "Fecha de pago", sinonimos: /\b(fecha|f)( de)? (pago|cobro|cobranza|acreditacion)\b|\bpagad[oa] el\b/ },
  { id: "vencimiento", nombre: "Vencimiento", sinonimos: /\b(vencimiento|vto|vence|venc)\b/ },
  { id: "monto", nombre: "Monto", sinonimos: /\b(importe|monto|premio|total|saldo|valor)\b/ },
  { id: "medio", nombre: "Medio de pago", sinonimos: /\b(medio|forma)( de)? (pago|cobro)\b|^medio$/ },
  { id: "estado", nombre: "Estado", sinonimos: /\b(estado|situacion|condicion)\b/ },
  { id: "compania", nombre: "Compañía", sinonimos: /\b(compania|aseguradora|cia)\b/ },
];

/**
 * El formato del listado de una compañía, tal como se guarda en
 * conector_mapeos.mapeo. Las columnas se nombran por el encabezado
 * normalizado: si la compañía cambia el orden, sigue sirviendo.
 */
export const esquemaMapeoListado = z.object({
  /** Encabezados que tienen que estar para reconocer el formato la próxima vez. */
  huella: z.array(z.string()).min(1),
  columnas: z.record(z.string(), z.enum(CAMPOS_LISTADO)),
  /** Para listados sin columna de estado: "pagada" en un listado de cobranzas. */
  estadoPorDefecto: z.enum(ESTADOS_COMPANIA).nullable().default(null),
  monedaPorDefecto: z.enum(["ARS", "USD"]).default("ARS"),
  /** Valores propios de la compañía (normalizados) → estado: "cob" → pagada. Se suman a los conocidos. */
  estados: z.record(z.string(), z.enum(ESTADOS_COMPANIA)).default({}),
  medios: z.record(z.string(), z.enum(MEDIOS)).default({}),
});
export type MapeoListado = z.infer<typeof esquemaMapeoListado>;

/** Un mapeo guardado, validado. Si la fila de la base no tiene la forma esperada, null. */
export function leerMapeoListado(valor: unknown): MapeoListado | null {
  const r = esquemaMapeoListado.safeParse(valor);
  return r.success ? r.data : null;
}

// ---------- Valores ----------

/** "Cancelada" queda afuera a propósito: en una cuota puede ser "saldada" o "anulada". Se aclara en la plantilla. */
const ESTADOS_CONOCIDOS: [RegExp, EstadoCompaniaCuota][] = [
  [/^(no pagad[oa]|impag[oa]|sin pago|pendiente( de pago)?|adeudad[oa]|a cobrar|emitid[oa]|deuda)$/, "pendiente"],
  [/^(pagad[oa]|cobrad[oa]|abonad[oa]|acreditad[oa]|pago|cobro|cobranza|saldad[oa])$/, "pagada"],
  [/^(vencid[oa]|en mora|mora|atrasad[oa])$/, "vencida"],
  [/^(anulad[oa]|anulacion|baja|dad[oa] de baja|rescindid[oa])( por falta de pago)?$/, "anulada"],
];

const MEDIOS_CONOCIDOS: [RegExp, MedioPago][] = [
  [/pago ?facil/, "pago_facil"],
  [/rapi ?pago/, "rapipago"],
  [/mercado ?pago|^mp$/, "mercadopago"],
  [/transf/, "transferencia"],
  [/\bcbu\b|debito (bancario|en cuenta|directo)|^dd$/, "debito_cbu"],
  [/tarjeta|\btc\b|visa|master|amex|cabal|naranja/, "debito_tarjeta"],
  [/efectivo|productor/, "efectivo_productor"],
];

const DOLARES = /u\$s|us\$|u\$d|usd|dolar/;

/** "$", "ARS", "Pesos" → ARS; "U$S", "USD", "Dólares" → USD. Vacío: null. */
export function leerMoneda(texto: string): Moneda | "desconocida" | null {
  const t = normalizar(texto);
  if (!t) return null;
  if (DOLARES.test(t)) return "USD";
  if (/^(\$|ars|ar\$|pesos?|peso argentino)$/.test(t)) return "ARS";
  return "desconocida";
}

/** "4/12", "4 de 12", "Cuota 04-12" o solo "4". */
export function leerCuota(texto: string): { n: number; total: number | null } | null {
  const t = normalizar(texto).replace(/^cuota\s*/, "");
  const m = /^0*(\d{1,3})(?:\s*(?:\/|de|-)\s*0*(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const total = m[2] ? Number(m[2]) : null;
  if (n < 1 || (total !== null && total < n)) return null;
  return { n, total };
}

function leerEstado(texto: string, propios: Record<string, EstadoCompaniaCuota>): EstadoCompaniaCuota | "desconocido" | null {
  const t = normalizar(texto);
  if (!t) return null;
  return propios[t] ?? ESTADOS_CONOCIDOS.find(([p]) => p.test(t))?.[1] ?? "desconocido";
}

function leerMedio(texto: string, propios: Record<string, MedioPago>): MedioPago | null {
  const t = normalizar(texto);
  if (!t) return null;
  return propios[t] ?? MEDIOS_CONOCIDOS.find(([p]) => p.test(t))?.[1] ?? null;
}

// ---------- Formato ----------

/** Los encabezados con nombre propio: dos columnas iguales quedan "Importe" e "Importe (2)". */
export function encabezadosUnicos(encabezados: string[]): string[] {
  const vistos = new Map<string, number>();
  return encabezados.map((e, i) => {
    const base = e.trim() || `Columna ${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Qué falta en un mapeo para poder leer el listado. */
export function faltanEnMapeo(mapeo: Pick<MapeoListado, "columnas" | "estadoPorDefecto">): string[] {
  const campos = new Set(Object.values(mapeo.columnas));
  const faltan: string[] = [];
  if (!campos.has("poliza") && !campos.has("cupon")) faltan.push("la póliza o el cupón");
  if (!campos.has("monto")) faltan.push("el monto");
  if (!campos.has("vencimiento")) faltan.push("el vencimiento");
  if (!campos.has("estado") && !campos.has("fechaPago") && !mapeo.estadoPorDefecto) faltan.push("el estado (o decir que todo el listado está pago o impago)");
  return faltan;
}

/** Los encabezados de una tabla con el campo que les toca, para armar o confirmar un mapeo. */
export function mapeoDeColumnas(encabezados: string[], campos: (CampoListado | "")[], extra: Partial<Omit<MapeoListado, "columnas" | "huella">> = {}): MapeoListado {
  const columnas: Record<string, CampoListado> = {};
  encabezados.forEach((e, i) => {
    const campo = campos[i];
    const clave = normalizarEncabezado(e);
    if (campo && clave && !Object.values(columnas).includes(campo)) columnas[clave] = campo;
  });
  return esquemaMapeoListado.parse({ huella: Object.keys(columnas).length ? Object.keys(columnas) : ["?"], columnas, ...extra });
}

/** La propuesta por sinónimos, sin IA, para que el productor la confirme. */
export function proponerMapeoPorSinonimos(encabezados: string[]): MapeoListado {
  return mapeoDeColumnas(encabezados, sugerirMapeo(encabezados, COLUMNAS_LISTADO));
}

/**
 * Lo que propone la IA para un formato nuevo. Va en listas y no en mapas
 * porque así lo aceptan las salidas estructuradas; mapeoDePropuestaIA lo
 * verifica y lo convierte.
 */
export const esquemaPropuestaIA = z.object({
  columnas: z.array(z.object({ encabezado: z.string(), campo: z.enum([...CAMPOS_LISTADO, "ninguno"]) })),
  estadoPorDefecto: z.enum(ESTADOS_COMPANIA).nullable(),
  monedaPorDefecto: z.enum(["ARS", "USD"]),
  estados: z.array(z.object({ valor: z.string(), estado: z.enum(ESTADOS_COMPANIA) })),
  medios: z.array(z.object({ valor: z.string(), medio: z.enum(MEDIOS) })),
});
export type PropuestaIA = z.infer<typeof esquemaPropuestaIA>;

/**
 * La propuesta de la IA, verificada: solo encabezados que están en la tabla y
 * cada campo una sola vez. Queda para que el productor la confirme.
 */
export function mapeoDePropuestaIA(propuesta: PropuestaIA, encabezados: string[]): MapeoListado {
  const campoDe = new Map(propuesta.columnas.filter((c) => c.campo !== "ninguno").map((c) => [normalizarEncabezado(c.encabezado), c.campo as CampoListado]));
  const campos = encabezados.map((e) => campoDe.get(normalizarEncabezado(e)) ?? "");
  return mapeoDeColumnas(encabezados, campos, {
    estadoPorDefecto: propuesta.estadoPorDefecto,
    monedaPorDefecto: propuesta.monedaPorDefecto,
    estados: Object.fromEntries(propuesta.estados.map((e) => [normalizar(e.valor), e.estado]).filter(([valor]) => valor)),
    medios: Object.fromEntries(propuesta.medios.map((m) => [normalizar(m.valor), m.medio]).filter(([valor]) => valor)),
  });
}

export type PlantillaListado = { id: number; compania: string; version: number; mapeo: MapeoListado };

/**
 * La plantilla confirmada de la compañía que corresponde a estos encabezados:
 * tienen que estar todos los de su huella. Si hay varias, la de versión más alta.
 */
export function plantillaParaTabla(encabezados: string[], compania: string, plantillas: PlantillaListado[]): PlantillaListado | null {
  const presentes = new Set(encabezados.map(normalizarEncabezado));
  return plantillas
    .filter((p) => companiaCanonica(p.compania) === companiaCanonica(compania))
    .filter((p) => p.mapeo.huella.every((h) => presentes.has(h)))
    .sort((a, b) => b.version - a.version)[0] ?? null;
}

// ---------- Lectura ----------

export type FilaListado = {
  /** Número de fila en el archivo. */
  fila: number;
  /** La fila tal como vino (solo las celdas con algo). */
  original: Record<string, string>;
  pago: PagoNormalizado;
};

export type LecturaListado = {
  filas: FilaListado[];
  problemas: ProblemaFuente[];
  /** Filas vacías: no cuentan como problema. */
  vacias: number;
};

/**
 * Lee un listado con su mapeo. Cada fila termina en `filas`, en `problemas`
 * (con el número de fila y por qué) o en `vacias`: la suma da el total de
 * filas del archivo debajo del encabezado.
 */
export function leerListado(tabla: Pick<Tabla, "encabezados" | "filas" | "filaInicial">, mapeo: MapeoListado, compania: string): LecturaListado {
  const encabezados = encabezadosUnicos(tabla.encabezados);
  const indice = new Map<CampoListado, number>();
  tabla.encabezados.forEach((e, i) => {
    const campo = mapeo.columnas[normalizarEncabezado(e)];
    if (campo && !indice.has(campo)) indice.set(campo, i);
  });
  const resultado: LecturaListado = { filas: [], problemas: [], vacias: 0 };

  tabla.filas.forEach((celdas, i) => {
    const fila = tabla.filaInicial + i;
    if (celdas.every((c) => !c?.trim())) {
      resultado.vacias++;
      return;
    }
    const original = Object.fromEntries(encabezados.map((e, j) => [e, (celdas[j] ?? "").trim()]).filter(([, v]) => v));
    const valor = (campo: CampoListado) => {
      const j = indice.get(campo);
      return j === undefined ? "" : (celdas[j] ?? "").trim();
    };
    const problema = (mensaje: string) => resultado.problemas.push({ fila, mensaje });

    const poliza = valor("poliza");
    const cupon = valor("cupon") || null;
    if (!poliza && !cupon) {
      const esTotal = celdas.some((c) => /^(sub)?total(es)?\b/.test(normalizar(c ?? "")));
      problema(esTotal ? "Es una fila de totales: no es un pago." : "No tiene póliza ni cupón.");
      return;
    }

    const textoMonto = valor("monto");
    const enDolares = DOLARES.test(normalizar(textoMonto));
    const monto = leerMonto(normalizar(textoMonto).replace(DOLARES, "").replace(/\$/g, ""));
    if (monto === null) {
      problema(textoMonto ? `No entendí el monto "${textoMonto}".` : "No tiene monto.");
      return;
    }
    if (monto <= 0) {
      problema(`El monto es ${textoMonto}: puede ser una devolución o una nota de crédito, revisalo a mano.`);
      return;
    }

    const textoMoneda = valor("moneda");
    const monedaLeida = leerMoneda(textoMoneda);
    if (monedaLeida === "desconocida") {
      problema(`No entendí la moneda "${textoMoneda}".`);
      return;
    }
    const moneda: Moneda = monedaLeida ?? (enDolares ? "USD" : mapeo.monedaPorDefecto);

    const vence = leerFecha(valor("vencimiento"));
    if (!vence || "error" in vence) {
      problema(vence ? `El vencimiento: ${vence.error}.` : "No tiene vencimiento.");
      return;
    }
    const pagada = leerFecha(valor("fechaPago"));
    if (pagada && "error" in pagada) {
      problema(`La fecha de pago: ${pagada.error}.`);
      return;
    }
    const fechaPago = pagada?.iso ?? null;

    let cuotaN = 0;
    let cuotaTotal = 0;
    const textoCuota = valor("cuota");
    if (textoCuota) {
      const cuota = leerCuota(textoCuota);
      if (!cuota) {
        problema(`No entendí la cuota "${textoCuota}".`);
        return;
      }
      cuotaN = cuota.n;
      cuotaTotal = cuota.total ?? 0;
    }
    const total = leerCuota(valor("cuotaTotal"));
    if (total && !cuotaTotal) cuotaTotal = total.n;

    const textoEstado = valor("estado");
    const estadoLeido = leerEstado(textoEstado, mapeo.estados);
    if (estadoLeido === "desconocido") {
      problema(`No entendí el estado "${textoEstado}": aclaralo en la plantilla de la compañía.`);
      return;
    }
    const estadoCompania = estadoLeido ?? (fechaPago ? "pagada" : mapeo.estadoPorDefecto);
    if (!estadoCompania) {
      problema("No dice si está paga o impaga.");
      return;
    }

    resultado.filas.push({
      fila,
      original,
      pago: {
        compania: valor("compania") ? companiaCanonica(valor("compania")) : companiaCanonica(compania),
        // Sin póliza, la cuota se busca por el cupón.
        poliza,
        item: valor("item") || null,
        endoso: valor("endoso") || null,
        cuotaN,
        cuotaTotal,
        cupon,
        monto,
        moneda,
        vencimiento: vence.iso,
        fechaPago,
        medio: leerMedio(valor("medio"), mapeo.medios),
        estadoCompania,
      },
    });
  });
  return resultado;
}
