/**
 * Lee un CSV que llega en pedazos (por ejemplo, una descarga en streaming) y
 * devuelve una fila por vez como { columna: valor }. Así se pueden recorrer
 * archivos de cientos de MB sin cargarlos enteros en memoria.
 *
 * Soporta campos entre comillas, comillas escapadas ("") y saltos de línea
 * dentro de un campo, aunque queden partidos entre dos pedazos. Los nombres de
 * columna se limpian de espacios ("Razon _Social" → "Razon_Social").
 */
export async function* filasCsv(
  pedazos: AsyncIterable<string> | Iterable<string>,
  separador = ",",
): AsyncGenerator<Record<string, string>> {
  let encabezado: string[] | null = null;
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  // Una comilla al final de un pedazo: recién con el pedazo siguiente se sabe
  // si cierra el campo o si es una comilla escapada.
  let comillaPendiente = false;
  let primero = true;

  function* cerrarFila(): Generator<Record<string, string>> {
    fila.push(campo);
    campo = "";
    const completa = fila;
    fila = [];
    if (completa.length === 1 && completa[0] === "") return; // línea vacía
    if (!encabezado) {
      encabezado = completa.map((c) => c.replace(/\s+/g, ""));
      return;
    }
    const objeto: Record<string, string> = {};
    encabezado.forEach((col, i) => (objeto[col] = completa[i] ?? ""));
    yield objeto;
  }

  for await (let pedazo of pedazos) {
    if (primero) {
      pedazo = pedazo.replace(/^﻿/, "");
      primero = false;
    }
    let i = 0;
    if (comillaPendiente) {
      comillaPendiente = false;
      if (pedazo[0] === '"') {
        campo += '"';
        i = 1;
      } else {
        entreComillas = false;
      }
    }
    for (; i < pedazo.length; i++) {
      const c = pedazo[i];
      if (entreComillas) {
        if (c !== '"') {
          campo += c;
        } else if (i + 1 === pedazo.length) {
          comillaPendiente = true;
        } else if (pedazo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else if (c === '"') {
        entreComillas = true;
      } else if (c === separador) {
        fila.push(campo);
        campo = "";
      } else if (c === "\n") {
        yield* cerrarFila();
      } else if (c !== "\r") {
        campo += c;
      }
    }
  }
  if (campo !== "" || fila.length > 0) yield* cerrarFila();
}
