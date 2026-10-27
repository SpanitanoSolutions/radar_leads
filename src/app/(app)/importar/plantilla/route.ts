import { requerirSesion } from "@/lib/auth";
import { aCsv, respuestaCsv } from "@/lib/csv";
import { PLANTILLA_CARTERA } from "@/lib/importacion";

/** Planilla modelo para armar la cartera en Excel. */
export async function GET() {
  await requerirSesion();
  return respuestaCsv(aCsv(PLANTILLA_CARTERA), "plantilla_cartera_radar.csv");
}
