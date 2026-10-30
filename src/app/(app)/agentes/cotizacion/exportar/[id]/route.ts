import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";
import { escribirXlsx } from "@/lib/xlsx-escribir";
import { generarPdfPropuesta } from "@/lib/cotizacion/propuesta-pdf";
import { tablaContactos } from "@/lib/cotizacion/detalle";
import { contextoDeEnvios } from "@/agentes/cotizacion/detalle";

function campoCsv(valor: string | number | null | undefined): string {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request, context: RouteContext<"/agentes/cotizacion/exportar/[id]">) {
  await requerirSesion();
  const { id: idTexto } = await context.params;
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) return new Response("No encontramos la solicitud.", { status: 404 });
  const [solicitud] = await db.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.id, id));
  if (!solicitud) return new Response("No encontramos la solicitud.", { status: 404 });
  const envios = await db.select().from(schema.cotizacionEnvios).where(eq(schema.cotizacionEnvios.solicitudId, id)).orderBy(schema.cotizacionEnvios.id);
  const resultados = envios.length ? await db.select().from(schema.cotizacionResultados)
    .where(inArray(schema.cotizacionResultados.envioId, envios.map((envio) => envio.id))) : [];
  const resultadoPorEnvio = new Map(resultados.map((resultado) => [resultado.envioId, resultado]));
  const parametros = new URL(request.url).searchParams;
  if (parametros.get("vista") === "contactos") {
    // La tabla de Contactos tal como se ve en el detalle (y como la copia el botón Copiar).
    const contactos = tablaContactos(envios, await contextoDeEnvios(envios, resultados));
    if (parametros.get("formato") === "xlsx") return new Response(Buffer.from(escribirXlsx(contactos)), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contactos-${solicitud.numero}.xlsx"`,
      "Cache-Control": "private, no-store",
    } });
    return new Response(`﻿${contactos.map((fila) => fila.map(campoCsv).join(",")).join("\r\n")}`, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contactos-${solicitud.numero}.csv"`,
      "Cache-Control": "private, no-store",
    } });
  }
  const filas: (string | number | null)[][] = [
    ["Compañía", "Estado", "Prima neta", "Prima total", "Gastos", "Impuestos", "Franquicia", "Suma asegurada", "Vigencia", "Condiciones", "Confirmada"],
    ...envios.map((envio) => {
      const resultado = resultadoPorEnvio.get(envio.id);
      return [envio.compania, envio.estado, resultado?.primaNeta ?? null, resultado?.primaTotal ?? null,
        resultado?.gastos ?? null, resultado?.impuestos ?? null, resultado?.franquicia ?? null,
        resultado?.sumaAsegurada ?? null, resultado?.vigencia ?? null, resultado?.condiciones ?? null,
        resultado?.confirmado ? "Sí" : "No"];
    }),
  ];
  if (!envios.length) filas.push(...solicitud.cotizaciones.map((cotizacion) => [cotizacion.compania, "histórica", null, cotizacion.precio, null, null, null, null, null, cotizacion.observacion ?? null, "No"]));
  const formato = parametros.get("formato");
  if (formato === "pdf") {
    const propuesta = generarPdfPropuesta(`Comparativa ${solicitud.numero} - ${solicitud.cliente}`, filas.slice(1).map((fila) => ({ etiqueta: String(fila[0] ?? ""), valor: fila.slice(1).filter((valor) => valor != null && valor !== "").join(" | ") || "Sin respuesta" })));
    return new Response(Buffer.from(propuesta), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comparativa-${solicitud.numero}.pdf"`,
      "Cache-Control": "private, no-store",
    } });
  }
  const excel = formato === "xlsx";
  if (excel) return new Response(Buffer.from(escribirXlsx(filas)), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="cotizacion-${solicitud.numero}.xlsx"`,
    "Cache-Control": "private, no-store",
  } });
  const csv = `\uFEFF${filas.map((fila) => fila.map(campoCsv).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="cotizacion-${solicitud.numero}.csv"`,
    "Cache-Control": "private, no-store",
  } });
}
