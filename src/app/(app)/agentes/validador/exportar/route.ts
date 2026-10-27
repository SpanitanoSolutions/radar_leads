import type { NextRequest } from "next/server";
import { requerirSesion } from "@/lib/auth";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";
import { obtenerComprobantes, obtenerCuotasRecientes } from "@/lib/datos-agentes";
import { diaEnArgentina } from "@/lib/fechas";
import { agruparCobros, pestanaDe } from "@/lib/validador";

/** Las cuotas de una pestaña del validador, en CSV. */
export async function GET(request: NextRequest) {
  await requerirSesion();
  const pestana = request.nextUrl.searchParams.get("tab") ?? "pendientes";
  const hoy = diaEnArgentina(new Date());
  const cobros = agruparCobros(await obtenerCuotasRecientes(hoy));
  const comprobantes = await obtenerComprobantes(cobros.map((c) => c.cabezaId));
  const filas = cobros
    .filter((c) => {
      const comp = comprobantes.get(c.cabezaId);
      return pestanaDe(c, comp?.estado === "por_revisar" ? comp : null, hoy) === pestana;
    })
    .map((c) => [c.asegurado, c.compania, c.poliza, c.cuota, montoCsv(c.monto), fechaCsv(c.vencimiento), c.pagada ? "Pagada" : "Impaga"]);
  return respuestaCsv(
    aCsv([["Asegurado", "Compañía", "Póliza", "Cuota", "Monto", "Vencimiento", "Estado"], ...filas]),
    `cuotas_${pestana}_${hoy}.csv`,
  );
}
