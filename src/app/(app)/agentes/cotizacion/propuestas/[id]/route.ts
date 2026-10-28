import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";

export async function GET(_request: Request, context: RouteContext<"/agentes/cotizacion/propuestas/[id]">) {
  await requerirSesion();
  const { id: textoId } = await context.params;
  const id = Number(textoId);
  if (!Number.isInteger(id) || id <= 0) return new Response("Propuesta inexistente.", { status: 404 });
  const [propuesta] = await db.select().from(schema.cotizacionPropuestas).where(eq(schema.cotizacionPropuestas.id, id));
  if (!propuesta || propuesta.estado !== "aprobada") return new Response("La propuesta requiere aprobación.", { status: 403 });
  const nombre = propuesta.nombre.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(propuesta.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(propuesta.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
