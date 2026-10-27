import { conciliarPeriodo } from "@/lib/conciliacion";
import { obtenerDatosConciliacion } from "@/lib/datos-agentes";
import { requerirSesion } from "@/lib/auth";

function escaparCsv(valor: string | number | null): string {
  const texto = valor === null ? "" : String(valor);
  return `"${texto.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  await requerirSesion();
  const periodo = new URL(request.url).searchParams.get("periodo") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return new Response("Período inválido", { status: 400 });
  const datos = await obtenerDatosConciliacion(periodo);
  const filas = conciliarPeriodo(periodo, datos.cuotas, datos.acuerdos, datos.liquidaciones);
  const lineas = [
    ["Compañía", "Período", "Te corresponde", "Liquidado", "Depositado", "Retenciones", "Diferencia", "Estado"],
    ...filas.map((fila) => [fila.compania, fila.periodo, fila.esperado, fila.liquidado, fila.depositado, fila.retenciones, fila.diferencia, fila.estado]),
  ];
  const csv = `\uFEFF${lineas.map((linea) => linea.map(escaparCsv).join(";")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conciliacion-${periodo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}