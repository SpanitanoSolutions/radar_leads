import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type CasoEvaluacion = {
  clasificacionEsperada: string;
  clasificacionObtenida: string;
  camposEsperados: Record<string, string | number | null>;
  camposObtenidos: Record<string, string | number | null>;
};

type SetEvaluacion = { casos: CasoEvaluacion[] };

function normalizar(valor: string | number | null | undefined): string {
  return String(valor ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
}

async function main() {
  const origen = process.argv[2];
  if (!origen) {
    process.stderr.write("Uso: npm run evaluar:siniestros -- <archivo-json-anonimizado>\n");
    process.exitCode = 2;
    return;
  }

  const dataset = JSON.parse(await readFile(resolve(process.cwd(), origen), "utf8")) as SetEvaluacion;
  if (!Array.isArray(dataset.casos) || dataset.casos.length === 0) throw new Error("El JSON debe incluir un arreglo casos con al menos un ejemplo.");

  let clasificacionesCorrectas = 0;
  let camposCorrectos = 0;
  let camposTotales = 0;
  for (const caso of dataset.casos) {
    if (normalizar(caso.clasificacionEsperada) === normalizar(caso.clasificacionObtenida)) clasificacionesCorrectas += 1;
    for (const [campo, esperado] of Object.entries(caso.camposEsperados ?? {})) {
      if (normalizar(esperado) === "") continue;
      camposTotales += 1;
      if (normalizar(esperado) === normalizar(caso.camposObtenidos?.[campo])) camposCorrectos += 1;
    }
  }

  const precisionClasificacion = clasificacionesCorrectas / dataset.casos.length;
  const precisionExtraccion = camposTotales ? camposCorrectos / camposTotales : 0;
  process.stdout.write(`Casos evaluados: ${dataset.casos.length}\n`);
  process.stdout.write(`Clasificación: ${(precisionClasificacion * 100).toFixed(1)}% (${clasificacionesCorrectas}/${dataset.casos.length})\n`);
  process.stdout.write(`Extracción: ${(precisionExtraccion * 100).toFixed(1)}% (${camposCorrectos}/${camposTotales} campos)\n`);
  if (dataset.casos.length < 10) process.stdout.write("La meta de aceptación requiere al menos 10 expedientes anonimizados.\n");
  if (precisionClasificacion < 0.95 || precisionExtraccion < 0.9 || dataset.casos.length < 10) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : "No se pudo ejecutar la evaluación.";
  process.stderr.write(`${mensaje}\n`);
  process.exitCode = 1;
});
