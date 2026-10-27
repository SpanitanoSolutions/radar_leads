// Armado de CSV para bajar (Excel en castellano usa ";" como separador).

/** Encierra entre comillas lo que haga falta y duplica las comillas internas. */
function celda(valor: string | number | null | undefined, separador: string): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return /["\r\n]/.test(texto) || texto.includes(separador) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Filas a CSV, con BOM para que Excel reconozca las tildes. */
export function aCsv(filas: (string | number | null | undefined)[][], separador = ";"): string {
  return "﻿" + filas.map((f) => f.map((v) => celda(v, separador)).join(separador)).join("\r\n") + "\r\n";
}

/** 1234567.5 → "1234567,50" (Excel en castellano). */
export function montoCsv(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "" : valor.toFixed(2).replace(".", ",");
}

/** "2026-11-05" → "05/11/2026". */
export function fechaCsv(iso: string | null | undefined): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}

export function respuestaCsv(contenido: string, archivo: string): Response {
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
