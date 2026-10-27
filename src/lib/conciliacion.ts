import type { CampoImportable } from "@/lib/importacion";

export type CuotaConciliable = {
  asegurado: string;
  polizaNumero: string;
  polizaId: number;
  cuotaNumero: number;
  ramo: string;
  compania: string;
  monto: number;
  pagadaEl: Date | string;
};

export type AcuerdoConciliacion = { compania: string; ramo: string; porcentaje: number };
export type ItemConciliacion = { polizaNumero: string; cuotaNumero: number | null; porcentaje: number | null; comision: number };
export type RetencionesConciliacion = { iibb?: number; ganancias?: number; otras?: number } | null;

export type LiquidacionConciliacion = {
  id: number;
  compania: string;
  periodo: string;
  recibidaEl: string | null;
  montoLiquidado: number;
  depositado: number | null;
  retenciones: RetencionesConciliacion;
  items: ItemConciliacion[];
};

export type HallazgoConciliacion = {
  tipo: "faltante" | "porcentaje" | "retenciones";
  titulo: string;
  monto: number;
  texto: string;
};

export type FilaConciliacion = {
  compania: string;
  periodo: string;
  recibidaEl: string | null;
  esperado: number;
  liquidado: number | null;
  depositado: number | null;
  retenciones: number;
  diferencia: number;
  estado: "sin-liquidacion" | "reclamar" | "cierra";
  resumen: string;
  hallazgos: HallazgoConciliacion[];
};

export type CampoLiquidacion = "compania" | "periodo" | "poliza" | "cuota" | "comision" | "porcentaje" | "depositado" | "iibb" | "ganancias";

export const CAMPOS_LIQUIDACION: CampoImportable<CampoLiquidacion>[] = [
  { id: "compania", nombre: "Compañía", obligatorio: true, sinonimos: /compania|aseguradora/ },
  { id: "periodo", nombre: "Período (AAAA-MM)", obligatorio: true, sinonimos: /periodo|mes liquidado/ },
  { id: "poliza", nombre: "Número de póliza", obligatorio: true, sinonimos: /poliza|numero poliza/ },
  { id: "cuota", nombre: "Número de cuota", sinonimos: /cuota/ },
  { id: "comision", nombre: "Comisión liquidada", obligatorio: true, sinonimos: /comision|importe comision/ },
  { id: "porcentaje", nombre: "Porcentaje", sinonimos: /porcentaje|comision %/ },
  { id: "depositado", nombre: "Depositado", sinonimos: /depositado|deposito neto/ },
  { id: "iibb", nombre: "Retención de IIBB", sinonimos: /iibb|ingresos brutos/ },
  { id: "ganancias", nombre: "Retención de Ganancias", sinonimos: /ganancias/ },
];

function redondear(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100;
}

function montoRetenciones(retenciones: RetencionesConciliacion): number {
  return redondear((retenciones?.iibb ?? 0) + (retenciones?.ganancias ?? 0) + (retenciones?.otras ?? 0));
}

function periodoDe(fecha: Date | string): string {
  if (typeof fecha === "string") return fecha.slice(0, 7);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).format(fecha);
}

/** Compara cuotas efectivamente pagadas en un período con lo informado por cada compañía. */
export function conciliarPeriodo(
  periodo: string,
  cuotas: CuotaConciliable[],
  acuerdos: AcuerdoConciliacion[],
  liquidaciones: LiquidacionConciliacion[],
): FilaConciliacion[] {
  const acuerdoPorRamo = new Map(acuerdos.map((acuerdo) => [`${acuerdo.compania}\0${acuerdo.ramo}`, acuerdo.porcentaje]));
  const esperadoPorCompania = new Map<string, Map<string, { cuota: CuotaConciliable; porcentaje: number; esperado: number }[]>>();
  for (const cuota of cuotas) {
    if (periodoDe(cuota.pagadaEl) !== periodo) continue;
    const porcentaje = acuerdoPorRamo.get(`${cuota.compania}\0${cuota.ramo}`);
    if (porcentaje === undefined) continue;
    const porPoliza = esperadoPorCompania.get(cuota.compania) ?? new Map();
    const items = porPoliza.get(cuota.polizaNumero) ?? [];
    items.push({ cuota, porcentaje, esperado: redondear((cuota.monto * porcentaje) / 100) });
    porPoliza.set(cuota.polizaNumero, items);
    esperadoPorCompania.set(cuota.compania, porPoliza);
  }

  const liquidacionPorCompania = new Map(liquidaciones.filter((l) => l.periodo === periodo).map((l) => [l.compania, l]));
  const companias = new Set([...esperadoPorCompania.keys(), ...liquidacionPorCompania.keys()]);

  return [...companias].sort((a, b) => a.localeCompare(b, "es")).map((compania) => {
    const porPoliza = esperadoPorCompania.get(compania) ?? new Map();
    const liquidacion = liquidacionPorCompania.get(compania);
    const esperado = redondear([...porPoliza.values()].flat().reduce((suma, item) => suma + item.esperado, 0));
    const hallazgos: HallazgoConciliacion[] = [];

    if (!liquidacion) {
      hallazgos.push({
        tipo: "faltante",
        titulo: "Liquidación pendiente",
        monto: esperado,
        texto: `Por las cuotas cobradas en ${periodo} te corresponden ${formatearPesos(esperado)}.`,
      });
    } else {
      const liquidadoPorCuota = new Map<string, ItemConciliacion>();
      for (const item of liquidacion.items) liquidadoPorCuota.set(`${item.polizaNumero}\0${item.cuotaNumero ?? ""}`, item);
      for (const [polizaNumero, cuotasPoliza] of porPoliza) {
        for (const { cuota, porcentaje, esperado: comisionEsperada } of cuotasPoliza) {
          const item = liquidadoPorCuota.get(`${polizaNumero}\0${cuota.cuotaNumero}`) ??
            liquidadoPorCuota.get(`${polizaNumero}\0`);
          const titular = `${cuota.asegurado} · ${cuota.ramo} ${polizaNumero}`;
          if (!item) {
            hallazgos.push({
              tipo: "faltante",
              titulo: `${titular} · comisión faltante`,
              monto: comisionEsperada,
              texto: `La cuota ${cuota.cuotaNumero} se pagó el ${String(cuota.pagadaEl).slice(0, 10)} y no aparece en la liquidación.`,
            });
          } else if (item.porcentaje !== null && Math.abs(item.porcentaje - porcentaje) >= 0.01) {
            hallazgos.push({
              tipo: "porcentaje",
              titulo: `${titular} · porcentaje distinto`,
              monto: Math.max(0, redondear(comisionEsperada - item.comision)),
              texto: `Se liquidó al ${item.porcentaje} % (${formatearPesos(item.comision)}); el acuerdo es ${porcentaje} % (${formatearPesos(comisionEsperada)}).`,
            });
          } else if (Math.abs(item.comision - comisionEsperada) > 1) {
            hallazgos.push({
              tipo: "porcentaje",
              titulo: `${titular} · diferencia de comisión`,
              monto: Math.max(0, redondear(comisionEsperada - item.comision)),
              texto: `Se liquidaron ${formatearPesos(item.comision)} y te corresponden ${formatearPesos(comisionEsperada)}.`,
            });
          }
        }
      }

      const retenciones = montoRetenciones(liquidacion.retenciones);
      if (liquidacion.depositado !== null && retenciones > 0) {
        const explicada = Math.abs(redondear(liquidacion.montoLiquidado - liquidacion.depositado - retenciones)) <= 1;
        hallazgos.push({
          tipo: "retenciones",
          titulo: explicada ? "Depósito neto de retenciones" : "Diferencia entre liquidación y depósito",
          monto: retenciones,
          texto: explicada
            ? `La diferencia de ${formatearPesos(retenciones)} son retenciones informadas. Cierra.`
            : `Las retenciones suman ${formatearPesos(retenciones)}, pero no explican el depósito recibido.`,
        });
      }
    }

    const retenciones = montoRetenciones(liquidacion?.retenciones ?? null);
    const diferencias = hallazgos.filter((h) => h.tipo !== "retenciones");
    const diferencia = redondear(diferencias.reduce((suma, hallazgo) => suma + hallazgo.monto, 0));
    const estado = !liquidacion ? "sin-liquidacion" : diferencias.length ? "reclamar" : "cierra";
    const resumen = !liquidacion
      ? `La liquidación de ${periodo} todavía no llegó.`
      : diferencias.length
        ? diferencias.length === 1
          ? "Hay una diferencia para revisar con la compañía."
          : `Hay ${diferencias.length} diferencias para revisar con la compañía.`
        : "La liquidación coincide con las cuotas cobradas.";

    return {
      compania,
      periodo,
      recibidaEl: liquidacion?.recibidaEl ?? null,
      esperado,
      liquidado: liquidacion?.montoLiquidado ?? null,
      depositado: liquidacion?.depositado ?? null,
      retenciones,
      diferencia,
      estado,
      resumen,
      hallazgos,
    };
  });
}

export function textoReclamoComision(fila: FilaConciliacion): { asunto: string; texto: string } {
  const periodoTexto = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${fila.periodo}-01T00:00:00Z`));
  const asunto = fila.estado === "sin-liquidacion"
    ? `Liquidación de comisiones ${periodoTexto}`
    : `Diferencias de comisión · ${periodoTexto}`;
  const puntos = fila.hallazgos
    .filter((h) => h.tipo !== "retenciones")
    .map((h) => `· ${h.titulo}: ${h.texto}`);
  const pedido = fila.estado === "sin-liquidacion"
    ? `Todavía no recibí la liquidación de comisiones de ${periodoTexto}. ¿Me la podrán enviar o confirmar la fecha estimada?`
    : `En la liquidación de comisiones de ${periodoTexto} encontré estas diferencias:\n\n${puntos.join("\n")}\n\nTotal a revisar: ${formatearPesos(fila.diferencia)}. ¿Podrán revisarlas?`;
  return {
    asunto,
    texto: `Hola, ¿cómo están?\n\n${pedido}\n\nGracias,\n{productor}`,
  };
}

function formatearPesos(monto: number): string {
  return `$ ${monto.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}