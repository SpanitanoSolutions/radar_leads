import { conClave, cuerpoJson, errorApi } from "@/agentes/cobranza/api";
import { guardarConfigCobranza, leerConfigCobranza } from "@/agentes/cobranza/casos";
import { db, schema } from "@/db";
import { aplicarCambios } from "@/lib/cobranza/configuracion";

/** La configuración del agente (con los valores por defecto aplicados) y si ya se guardó alguna vez. */
export async function GET(request: Request) {
  return conClave(request, async () => {
    const [fila] = await db.select({ id: schema.cobranzaConfig.id }).from(schema.cobranzaConfig).limit(1);
    return Response.json({ configuracion: await leerConfigCobranza(), guardada: Boolean(fila) });
  });
}

/** Cambios parciales: los objetos se combinan y las listas se reemplazan. Se valida el resultado completo. */
export async function PUT(request: Request) {
  return conClave(request, async () => {
    const cambios = await cuerpoJson(request);
    if (cambios instanceof Response) return cambios;
    const r = aplicarCambios(await leerConfigCobranza(), cambios);
    if (!r.ok) return errorApi(400, "configuracion_invalida", r.errores.join(" · "));
    await guardarConfigCobranza(r.config);
    return Response.json({ configuracion: r.config });
  });
}
