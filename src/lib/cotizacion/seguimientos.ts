import { interpretarEstrategiaSeguimiento, sumarDiasHabiles } from "@/lib/cotizacion";

/** Feriados nacionales de fecha fija, más Carnaval y Viernes Santo calculados para el año consultado. */
export function feriadosNacionalesArgentina(anio: number): string[] {
  const fijos = ["01-01", "03-24", "04-02", "05-01", "05-25", "06-20", "07-09", "08-17", "10-12", "11-20", "12-08", "12-25"];
  const resultado = fijos.map((dia) => `${anio}-${dia}`);
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascua = new Date(Date.UTC(anio, mes - 1, dia));
  for (const diferencia of [-48, -47, -2]) {
    const fecha = new Date(pascua);
    fecha.setUTCDate(fecha.getUTCDate() + diferencia);
    resultado.push(fecha.toISOString().slice(0, 10));
  }
  return resultado;
}

export function calcularProximoSeguimiento(ultimaActividad: Date, ramo: string, textoReglas: string, feriados: string[] = []): Date | null {
  const reglas = interpretarEstrategiaSeguimiento(textoReglas);
  if (!reglas) return null;
  const ramoNormalizado = ramo.trim().toLocaleLowerCase("es-AR");
  const dias = Object.entries(reglas.porRamo).find(([nombre]) => nombre.toLocaleLowerCase("es-AR") === ramoNormalizado)?.[1]
    ?? reglas.intervaloDiasHabiles;
  const fecha = ultimaActividad.toISOString().slice(0, 10);
  const siguiente = sumarDiasHabiles(fecha, dias, feriados);
  return new Date(`${siguiente}T12:00:00-03:00`);
}
