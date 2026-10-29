import { z } from "zod";
import type { CuentaCompania } from "@/db/schema";
import { normalizar } from "@/fuentes/clasificacion";
import type { Moneda } from "@/lib/conectores/tipos";
import { leerFecha } from "@/lib/importacion";
import type { CobroCandidato, ComprobanteParaMatch } from "./matching";

// Comprobantes del asegurado subidos sueltos (sección 4.2, punto 2, de
// docs/specs/validador-v2.md): la IA lee la imagen o el PDF, este código
// verifica lo leído y arma los cobros candidatos; proponerCobros (matching.ts)
// propone a cuál corresponde. Nunca se marca pagado sin el productor.

/** Lo que la IA lee de un comprobante. Fechas AAAA-MM-DD; lo que no se lee, null. */
export const esquemaComprobanteIA = z.object({
  monto: z.number().nullable(),
  moneda: z.enum(["ARS", "USD"]).nullable(),
  fecha: z.string().nullable(),
  /** "Transferencia · Banco Nación", "Rapipago", "Mercado Pago". */
  medio: z.string().nullable(),
  numeroOperacion: z.string().nullable(),
  /** Concepto, referencia o código de pago que figura en el comprobante. */
  referencia: z.string().nullable(),
  pagador: z.string().nullable(),
  documentoPagador: z.string().nullable(),
  destinoTitular: z.string().nullable(),
  /** CBU, CVU o alias de destino. */
  destinoCuenta: z.string().nullable(),
});
export type ComprobanteExtraido = z.infer<typeof esquemaComprobanteIA>;

/**
 * Lo leído, verificado por código: una fecha que no existe o un monto que no
 * es positivo quedan en null (el productor los completa), y el texto se limpia.
 */
export function verificarExtraccion(datos: ComprobanteExtraido): ComprobanteExtraido {
  const texto = (valor: string | null) => valor?.trim().slice(0, 200) || null;
  const fecha = datos.fecha ? leerFecha(datos.fecha) : null;
  return {
    monto: datos.monto !== null && Number.isFinite(datos.monto) && datos.monto > 0 ? Math.round(datos.monto * 100) / 100 : null,
    moneda: datos.moneda,
    fecha: fecha && "iso" in fecha ? fecha.iso : null,
    medio: texto(datos.medio),
    numeroOperacion: texto(datos.numeroOperacion),
    referencia: texto(datos.referencia),
    pagador: texto(datos.pagador),
    documentoPagador: texto(datos.documentoPagador),
    destinoTitular: texto(datos.destinoTitular),
    destinoCuenta: texto(datos.destinoCuenta),
  };
}

const limpiar = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "");

/** La compañía dueña de la cuenta a la que se pagó (titular, alias o CBU), si se reconoce una sola. */
export function companiaDeDestino(destinos: (string | null)[], cuentas: Map<string, CuentaCompania[]>): string | null {
  const buscados = destinos.filter((d): d is string => Boolean(d)).map(limpiar).filter((d) => d.length >= 4);
  if (!buscados.length) return null;
  const encontradas = [...cuentas].filter(([, lista]) =>
    lista.some((c) => [c.titular, c.alias, c.cbu].filter((x): x is string => Boolean(x)).map(limpiar).some((c) => c.length >= 4 && buscados.some((d) => d.includes(c) || c.includes(d)))),
  );
  return encontradas.length === 1 ? encontradas[0][0] : null;
}

/** Lo que usa el matching. La referencia junta el concepto y el número de operación. */
export function comprobanteParaMatch(datos: ComprobanteExtraido, compania: string | null): ComprobanteParaMatch {
  return {
    monto: datos.monto,
    moneda: datos.moneda,
    fecha: datos.fecha,
    referencia: [datos.referencia, datos.numeroOperacion].filter(Boolean).join(" ") || null,
    pagador: datos.pagador,
    documentoPagador: datos.documentoPagador,
    compania,
  };
}

/** Una cuota impaga con lo que necesita el matching de comprobantes. */
export type CuotaAbierta = {
  id: number;
  aseguradoId: number;
  asegurado: string;
  documento: string | null;
  compania: string | null;
  poliza: string | null;
  cupon: string | null;
  monto: number;
  moneda: Moneda;
  vencimiento: string;
};

/**
 * Las cuotas que se pagan juntas (mismo asegurado, compañía, vencimiento y
 * moneda), como cobros candidatos. Los montos se suman por cobro.
 */
export function cobrosParaComprobante(cuotas: CuotaAbierta[]): CobroCandidato[] {
  const grupos = new Map<string, CuotaAbierta[]>();
  for (const c of cuotas) {
    const clave = `${c.aseguradoId}|${c.compania ?? ""}|${c.vencimiento}|${c.moneda}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }
  return [...grupos.values()].map((lista) => {
    lista.sort((a, b) => a.id - b.id);
    const [primera] = lista;
    const distintos = (valores: (string | null)[]) => [...new Set(valores.filter((v): v is string => Boolean(v)))];
    return {
      cuotaIds: lista.map((c) => c.id),
      asegurado: primera.asegurado,
      documento: primera.documento,
      compania: primera.compania,
      polizas: distintos(lista.map((c) => c.poliza)),
      cupones: distintos(lista.map((c) => c.cupon)),
      monto: Math.round(lista.reduce((s, c) => s + c.monto, 0) * 100) / 100,
      moneda: primera.moneda,
      vencimiento: primera.vencimiento,
    };
  });
}
