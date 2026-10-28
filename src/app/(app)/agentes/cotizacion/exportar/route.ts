import { requerirSesion } from "@/lib/auth";
import { filtrarSolicitudes } from "@/lib/cotizacion";
import { obtenerSolicitudesCotizacion } from "@/lib/datos-agentes";
import { aCsv } from "@/lib/csv";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export async function GET(request: Request) {
  await requerirSesion();
  const parametros = new URL(request.url).searchParams;
  const registros = await obtenerSolicitudesCotizacion();
  const solicitudes = registros.map(({ solicitud, asegurado, lead }) => ({
    ...solicitud,
    cliente: asegurado ?? lead ?? solicitud.cliente,
    respuestas: solicitud.cotizaciones.filter((cotizacion) => cotizacion.precio !== null).length,
  }));
  const filtradas = filtrarSolicitudes(solicitudes, {
    q: parametros.get("q") ?? "", estado: parametros.get("estado") ?? "", ramo: parametros.get("ramo") ?? "",
    origen: parametros.get("origen") ?? "", ejecutivo: parametros.get("ejecutivo") ?? "",
    desde: parametros.get("desde") ?? "", hasta: parametros.get("hasta") ?? "",
  });
  const filas: (string | number)[][] = [
    ["Solicitud", "Cliente", "Ramo", "Estado", "Cotizaciones recibidas", "Aseguradoras", "Inicio", "Ejecutivo"],
    ...filtradas.map((solicitud) => [solicitud.numero, solicitud.cliente, solicitud.ramo, solicitud.estado,
      solicitud.respuestas, solicitud.companias.length, solicitud.creadoEl.toLocaleDateString("es-AR"), solicitud.ejecutivo ?? ""]),
  ];
  if (parametros.get("formato") === "xlsx") return new Response(Buffer.from(escribirXlsx(filas)), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": "attachment; filename=solicitudes-cotizacion.xlsx", "Cache-Control": "private, no-store",
  } });
  return new Response(aCsv(filas), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=solicitudes-cotizacion.csv", "Cache-Control": "private, no-store",
  } });
}
