import { ALCANCE_CARTERA, configValidador } from "@/agentes/validador/cartera";
import { correrEnriquecimiento, correrValidacion, iniciarCorrida, ultimaCorridaCron } from "@/agentes/validador/corrida";
import { cronAutorizado } from "@/lib/cron";
import { agenteConfigurado } from "@/lib/datos-agentes";
import { proximaEjecucion, tocaEjecutar, type Etapa } from "@/lib/validador/programacion";

export const maxDuration = 300;

/**
 * Validador de pagos (ver vercel.json). El cron puede pasar más seguido que
 * la frecuencia configurada: cada etapa corre una vez por período, desde su
 * hora en la zona horaria de la Programación, y solo con el agente activo.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!(await agenteConfigurado("validador"))) {
    return Response.json({ desactivado: true, mensaje: "El Validador de pagos está desactivado." });
  }
  const ahora = new Date();
  const alcance = ALCANCE_CARTERA;
  const config = await configValidador(alcance);
  const resultado: Partial<Record<Etapa, { corridaId: number; estado: string } | { proxima: string }>> = {};
  for (const etapa of ["validacion", "enriquecimiento"] as const) {
    const ultima = await ultimaCorridaCron(etapa);
    if (!tocaEjecutar(config, etapa, ultima, ahora)) {
      resultado[etapa] = { proxima: proximaEjecucion(config, etapa, ultima, ahora).toISOString() };
      continue;
    }
    const { id, nueva } = await iniciarCorrida("cron", etapa, alcance, ahora);
    if (!nueva) {
      resultado[etapa] = { corridaId: id, estado: "en_curso" };
      continue;
    }
    const estado = etapa === "validacion" ? await correrValidacion(id, "cron", alcance, ahora) : await correrEnriquecimiento(id, "cron", alcance);
    resultado[etapa] = { corridaId: id, estado };
  }
  return Response.json(resultado);
}
