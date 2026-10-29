import { fechaCorta } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import type { Total } from "@/lib/validador/estados";
import {
  etiquetaDias,
  haceDias,
  ORIGEN_CONFIRMACION,
  textoCuota,
  textoEstado,
  type CuotaPantalla,
  type GrupoAsegurado,
} from "@/lib/validador/pantalla";
import type { CuotaFila, GrupoFila } from "./ListaAsegurados";

// Cómo se arman las URLs y las filas de la pantalla del Validador.

export type Parametros = Record<string, string>;

/** Los parámetros de la URL que definen lo que se ve (no el aviso de la última acción). */
export function parametrosDe(sp: Record<string, string | string[] | undefined>): Parametros {
  return Object.fromEntries(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "aviso" && e[1] !== ""),
  );
}

/** La URL de la pantalla con los parámetros actuales y estos cambios (null o "" lo saca). */
export function urlValidador(actuales: Parametros, cambios: Record<string, string | number | null> = {}): string {
  const p = new URLSearchParams(actuales);
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null || valor === "") p.delete(clave);
    else p.set(clave, String(valor));
  }
  const qs = p.toString();
  return qs ? `/agentes/validador?${qs}` : "/agentes/validador";
}

/** Una línea por moneda; sin nada, $ 0,00. */
export function montos(total: Total): string[] {
  return total.montos.length ? total.montos.map((m) => importe(m.monto, m.moneda)) : [importe(0, "ARS")];
}

export function filaCuota(c: CuotaPantalla, hoy: string, conComprobante: Set<number>): CuotaFila {
  return {
    id: c.id,
    poliza: c.poliza ?? "—",
    cuota: textoCuota(c),
    item: c.item ?? "—",
    endoso: c.endoso ?? "—",
    cupon: c.cupon ?? "—",
    monto: importe(c.monto, c.moneda),
    vencimiento: fechaCorta(c.vencimiento),
    medio: c.medio ?? "—",
    estado: textoEstado(c),
    revision: haceDias(c.ultimaRevision, hoy),
    fechaPago: c.fechaPago ? fechaCorta(c.fechaPago) : "—",
    origen: c.origenConfirmacion ? ORIGEN_CONFIRMACION[c.origenConfirmacion] : "—",
    abierta: c.estado !== "pagada" && c.estado !== "cancelada",
    conComprobante: conComprobante.has(c.id),
  };
}

export function filaGrupo(
  g: GrupoAsegurado<CuotaPantalla>,
  modo: "pendientes" | "pagadas",
  contexto: { hoy: string; contactables: Set<number>; conComprobante: Set<number> },
): GrupoFila {
  const primera = g.cuotas[0];
  return {
    aseguradoId: g.aseguradoId,
    asegurado: g.asegurado,
    cantidad: g.cuotas.length,
    companias: g.companias.join(", "),
    montos: montos(g.total),
    etiqueta: modo === "pendientes" ? etiquetaDias(primera) : { texto: primera.fechaPago ? fechaCorta(primera.fechaPago) : "—", tono: "verde" },
    contactable: contexto.contactables.has(g.aseguradoId),
    cuotas: g.cuotas.map((c) => filaCuota(c, contexto.hoy, contexto.conComprobante)),
  };
}
