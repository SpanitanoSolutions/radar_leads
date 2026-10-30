import { timingSafeEqual } from "node:crypto";
import { registrarResultadoCotizacion } from "@/agentes/cotizacion/solicitudes";

function autorizado(authorization: string | null, secreto: string | undefined): boolean {
  if (!secreto || !authorization?.startsWith("Bearer ")) return false;
  const recibido = Buffer.from(authorization.slice(7));
  const esperado = Buffer.from(secreto);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export async function POST(request: Request) {
  const secreto = process.env.COTIZACION_WEBHOOK_SECRET;
  if (!secreto || Buffer.byteLength(secreto) < 32) {
    return Response.json({ error: "La recepción automática de cotizaciones no está configurada." }, { status: 503 });
  }
  if (!autorizado(request.headers.get("authorization"), secreto)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Faltan los datos de la cotización." }, { status: 400 });

  const datos = body as Record<string, unknown>;
  const solicitudId = Number(datos.solicitudId);
  const compania = typeof datos.compania === "string" ? datos.compania.trim() : "";
  const precio = Number(datos.precio);
  const observacion = typeof datos.observacion === "string" ? datos.observacion.slice(0, 500) : undefined;
  if (!Number.isInteger(solicitudId) || solicitudId <= 0 || !compania || !Number.isFinite(precio) || precio <= 0) {
    return Response.json({ error: "La solicitud, compañía o prima anual no son válidas." }, { status: 400 });
  }

  try {
    // Entra sin confirmar: no cuenta en el comparativo hasta que el productor la revise.
    const resultado = await registrarResultadoCotizacion({ solicitudId, compania, precio, condiciones: observacion ?? null, origen: "portal", confirmado: false, actor: "compania" });
    return Response.json({ ok: true, resultado });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "No se pudo guardar la cotización.";
    const esperado = ["Solicitud inválida.", "El precio debe ser mayor que cero.", "Solicitud inexistente.", "La solicitud ya está cerrada.", "La compañía no forma parte de esta solicitud.", "La solicitud no tiene un envío para esa compañía: cargá la respuesta a mano."].includes(mensaje);
    return Response.json({ error: esperado ? mensaje : "No se pudo guardar la cotización." }, { status: esperado ? 422 : 500 });
  }
}
