import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";

export async function GET(_request: Request, context: RouteContext<"/agentes/cotizacion/archivos/[id]">) {
  await requerirSesion();
  const { id: textoId } = await context.params;
  const id = Number(textoId);
  if (!Number.isInteger(id) || id <= 0) return new Response("Archivo inexistente.", { status: 404 });
  const [archivo] = await db.select().from(schema.cotizacionArchivos).where(eq(schema.cotizacionArchivos.id, id));
  if (!archivo) return new Response("Archivo inexistente.", { status: 404 });
  const nombre = archivo.nombre.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(archivo.bytes), {
    headers: {
      "Content-Type": archivo.mime,
      "Content-Length": String(archivo.tamano),
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
