import { after } from "next/server";
import { conClave, cuerpoJson, errorApi } from "@/agentes/cobranza/api";
import { leerConfigCobranza } from "@/agentes/cobranza/casos";
import { listarCorridas } from "@/agentes/cobranza/corridas";
import { correrCobranza, iniciarCorrida } from "@/agentes/cobranza/motor";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const maxDuration = 300;

/** Las últimas corridas (hasta 100). */
export async function GET(request: Request) {
  return conClave(request, async () => Response.json({ datos: await listarCorridas(100) }));
}

/**
 * Dispara una corrida en segundo plano: { modoPrueba?: boolean, limite?: number }.
 * modoPrueba: true la fuerza en modo prueba; si no, manda la configuración.
 * 409 si ya hay una en curso.
 */
export async function POST(request: Request) {
  return conClave(request, async () => {
    const cuerpo = await cuerpoJson(request);
    if (cuerpo instanceof Response) return cuerpo;
    const { modoPrueba, limite } = (cuerpo ?? {}) as { modoPrueba?: unknown; limite?: unknown };
    if (modoPrueba !== undefined && typeof modoPrueba !== "boolean") return errorApi(400, "dato_invalido", "modoPrueba tiene que ser true o false.");
    if (limite !== undefined && (!Number.isInteger(limite) || (limite as number) < 1 || (limite as number) > 500)) return errorApi(400, "dato_invalido", "limite tiene que ser un entero entre 1 y 500.");
    const config = await leerConfigCobranza();
    if (!modoPrueba && !config.modoPrueba) {
      const [agente] = await db.select({ configurado: schema.configuracionAgentes.configurado }).from(schema.configuracionAgentes).where(eq(schema.configuracionAgentes.agente, "cobranza"));
      if (!agente?.configurado) return errorApi(403, "agente_inactivo", "El agente está desactivado: activalo o corré en modo prueba.");
    }
    const opciones = { origen: "api" as const, forzarPrueba: modoPrueba === true, limite: limite as number | undefined };
    const { id, nueva } = await iniciarCorrida(opciones);
    if (!nueva) return errorApi(409, "corrida_en_curso", `Ya hay una corrida en curso (${id}).`);
    after(() => correrCobranza(id, opciones));
    return Response.json({ id, estado: "en_curso" }, { status: 202 });
  });
}
