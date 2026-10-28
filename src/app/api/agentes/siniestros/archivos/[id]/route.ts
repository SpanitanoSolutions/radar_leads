import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requerirSesion();
  const { id: idTexto } = await params;
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) return new Response("Archivo inválido", { status: 400 });

  const [fila] = await db
    .select({ archivo: schema.archivos })
    .from(schema.siniestroArchivos)
    .innerJoin(schema.archivos, eq(schema.archivos.id, schema.siniestroArchivos.archivoId))
    .where(eq(schema.siniestroArchivos.id, id));
  if (!fila) return new Response("Archivo inexistente", { status: 404 });

  const nombre = encodeURIComponent(fila.archivo.nombre.replace(/[\r\n"\\]/g, "_"));
  return new Response(fila.archivo.contenido, {
    headers: {
      "Content-Type": fila.archivo.tipo,
      "Content-Length": String(fila.archivo.tamano),
      "Content-Disposition": `attachment; filename="documento"; filename*=UTF-8''${nombre}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
