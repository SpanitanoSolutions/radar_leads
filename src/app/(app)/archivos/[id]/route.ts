import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requerirSesion } from "@/lib/auth";

/** Baja un archivo guardado (documento de la ficha, comprobante). Solo con sesión. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requerirSesion();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("No encontrado", { status: 404 });
  const [archivo] = await db.select().from(schema.archivos).where(eq(schema.archivos.id, id));
  if (!archivo) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(archivo.contenido), {
    headers: {
      "Content-Type": archivo.tipo,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
