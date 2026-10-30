import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";
import { aCsv } from "@/lib/csv";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export async function GET(request: Request) {
  await requerirSesion();
  const aseguradoras = await db.select().from(schema.cotizacionAseguradoras).orderBy(schema.cotizacionAseguradoras.nombre);
  const filas = [
    ["Aseguradora", "Ramos", "Contactos", "Código de productor", "Activa"],
    ...aseguradoras.map((item) => [item.nombre, item.ramos.join(", "), item.contactos.map((contacto) => `${contacto.nombre} <${contacto.email}>`).join("; "), item.codigoProductor ?? "", item.activa ? "Sí" : "No"]),
  ];
  if (new URL(request.url).searchParams.get("formato") === "xlsx") return new Response(Buffer.from(escribirXlsx(filas)), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=aseguradoras-cotizacion.xlsx", "Cache-Control": "private, no-store" },
  });
  return new Response(aCsv(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=aseguradoras-cotizacion.csv", "Cache-Control": "private, no-store" },
  });
}
