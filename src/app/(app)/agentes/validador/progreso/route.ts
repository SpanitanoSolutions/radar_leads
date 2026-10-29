import { requerirSesion } from "@/lib/auth";
import { obtenerCorridasEnCurso } from "@/lib/datos-validador";

/** Las corridas en curso, con su progreso: lo consulta "Ejecutar validación" mientras corre. */
export async function GET() {
  await requerirSesion();
  const enCurso = await obtenerCorridasEnCurso();
  return Response.json(
    { enCurso: enCurso.map((c) => ({ id: c.id, etapa: c.etapa, progreso: c.progreso })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
