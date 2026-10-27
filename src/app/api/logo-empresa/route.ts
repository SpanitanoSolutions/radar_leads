import { obtenerLogoEmpresa } from "@/lib/datos";
import { requerirSesion } from "@/lib/auth";

export async function GET() {
  await requerirSesion();
  const guardado = await obtenerLogoEmpresa();
  const coincidencia = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(guardado ?? "");
  if (!coincidencia) return new Response(null, { status: 404 });

  const archivo = Buffer.from(coincidencia[2], "base64");
  if (!archivo.byteLength || archivo.byteLength > 512 * 1024) return new Response(null, { status: 404 });
  const cuerpo = new Uint8Array(archivo.byteLength);
  cuerpo.set(archivo);

  return new Response(cuerpo, {
    headers: {
      "Content-Type": coincidencia[1],
      "Content-Length": String(cuerpo.byteLength),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
