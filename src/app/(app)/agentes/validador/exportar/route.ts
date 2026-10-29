import type { NextRequest } from "next/server";
import { ALCANCE_CARTERA, graciaDeLaCartera } from "@/agentes/validador/cartera";
import { requerirSesion } from "@/lib/auth";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";
import { obtenerCuotasValidador } from "@/lib/datos-validador";
import { diaEnArgentina } from "@/lib/fechas";
import { bloqueDe } from "@/lib/validador/estados";
import {
  conEstados,
  cuotasDePestana,
  leerFiltros,
  leerOrden,
  ORDEN_DE,
  ORIGEN_CONFIRMACION,
  ordenarCuotas,
  periodoDePago,
  textoEstado,
  type CuotaPantalla,
  type PestanaCuotas,
} from "@/lib/validador/pantalla";

const fechaHora = (fecha: Date | null) => (fecha ? fechaCsv(diaEnArgentina(fecha)) : "");

const COLUMNAS: Record<PestanaCuotas, { titulo: string; valor: (c: CuotaPantalla) => string | number | null }[]> = {
  pendientes: [
    { titulo: "Vencimiento", valor: (c) => fechaCsv(c.vencimiento) },
    { titulo: "Fin de gracia", valor: (c) => fechaCsv(c.finDeGracia) },
    { titulo: "Estado", valor: (c) => textoEstado(c).texto },
    { titulo: "Medio de pago", valor: (c) => c.medio },
    { titulo: "Última revisión", valor: (c) => fechaHora(c.ultimaRevision) },
  ],
  pagadas: [
    { titulo: "Vencimiento", valor: (c) => fechaCsv(c.vencimiento) },
    { titulo: "Fecha de pago", valor: (c) => fechaCsv(c.fechaPago) },
    { titulo: "Medio de pago", valor: (c) => c.medio },
    { titulo: "Origen de la confirmación", valor: (c) => (c.origenConfirmacion ? ORIGEN_CONFIRMACION[c.origenConfirmacion] : "") },
  ],
  canceladas: [
    { titulo: "Vencimiento", valor: (c) => fechaCsv(c.vencimiento) },
    { titulo: "Fecha de cancelación", valor: (c) => fechaCsv(c.canceladaEl) },
    { titulo: "Motivo", valor: (c) => c.motivoCancelacion },
    { titulo: "Estado", valor: (c) => textoEstado(c).texto },
    { titulo: "Última revisión", valor: (c) => fechaHora(c.ultimaRevision) },
  ],
};

const COMUNES: { titulo: string; valor: (c: CuotaPantalla) => string | number | null }[] = [
  { titulo: "Asegurado", valor: (c) => c.asegurado },
  { titulo: "Compañía", valor: (c) => c.compania },
  { titulo: "Ramo", valor: (c) => c.ramo },
  { titulo: "Póliza", valor: (c) => c.poliza },
  { titulo: "Cuota", valor: (c) => c.numero },
  { titulo: "Total de cuotas", valor: (c) => c.cantidadCuotas },
  { titulo: "Ítem", valor: (c) => c.item },
  { titulo: "Endoso", valor: (c) => c.endoso },
  { titulo: "Cupón", valor: (c) => c.cupon },
  { titulo: "Moneda", valor: (c) => c.moneda },
  { titulo: "Monto", valor: (c) => montoCsv(c.monto) },
];

/** Las cuotas de una pestaña del Validador en CSV, con los mismos filtros y orden que la pantalla. */
export async function GET(request: NextRequest) {
  await requerirSesion();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const pestana: PestanaCuotas = sp.tab === "pagadas" || sp.tab === "canceladas" ? sp.tab : "pendientes";
  const hoy = diaEnArgentina(new Date());
  const [base, graciaDe] = await Promise.all([obtenerCuotasValidador(hoy), graciaDeLaCartera(ALCANCE_CARTERA)]);
  let cuotas = cuotasDePestana(conEstados(base, hoy, graciaDe), pestana, leerFiltros(sp));
  if (pestana === "pendientes" && (sp.bloque === "semana" || sp.bloque === "proximos" || sp.bloque === "vencidos")) cuotas = cuotas.filter((c) => bloqueDe(c.estado) === sp.bloque);
  if (pestana === "pagadas" && (sp.periodo === "mes" || sp.periodo === "anteriores")) cuotas = cuotas.filter((c) => periodoDePago(c, hoy) === sp.periodo);
  const orden = leerOrden(sp.orden, sp.dir, ORDEN_DE[pestana]);
  const columnas = [...COMUNES, ...COLUMNAS[pestana]];
  return respuestaCsv(
    aCsv([columnas.map((c) => c.titulo), ...ordenarCuotas(cuotas, orden.columna, orden.sentido).map((c) => columnas.map((col) => col.valor(c)))]),
    `validador_${pestana}_${hoy}.csv`,
  );
}
