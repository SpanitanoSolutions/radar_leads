import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { logoParaPdf } from "./logo-pdf";

/** Un PNG mínimo (el lector no controla el CRC). */
function png(ancho: number, alto: number, profundidad: number, tipo: number, crudo: number[], extra: [string, number[]][] = []): string {
  const trozo = (nombre: string, datos: number[]) => {
    const largo = [datos.length >>> 24, (datos.length >>> 16) & 255, (datos.length >>> 8) & 255, datos.length & 255];
    return [...largo, ...[...nombre].map((c) => c.charCodeAt(0)), ...datos, 0, 0, 0, 0];
  };
  const ihdr = [0, 0, 0, ancho, 0, 0, 0, alto, profundidad, tipo, 0, 0, 0];
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10, ...trozo("IHDR", ihdr), ...extra.flatMap(([n, d]) => trozo(n, d)), ...trozo("IDAT", [...deflateSync(Uint8Array.from(crudo))]), ...trozo("IEND", [])];
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("el logo de la cuenta para el PDF", () => {
  it("un PNG con transparencia: saca los filtros de cada fila y separa la máscara", () => {
    // Fila 1 sin filtro; fila 2 con el filtro "arriba".
    const fila1 = [255, 0, 0, 255, 0, 255, 0, 128];
    const fila2 = [0, 0, 255, 255, 255, 255, 255, 0].map((valor, i) => (valor - fila1[i] + 256) & 255);
    const logo = logoParaPdf(png(2, 2, 8, 6, [0, ...fila1, 2, ...fila2]));
    expect(logo.ok).toBe(true);
    if (!logo.ok) return;
    expect(logo.imagen).toMatchObject({ ancho: 2, alto: 2, espacioColor: "DeviceRGB", filtro: "FlateDecode" });
    expect([...inflateSync(logo.imagen.datos)]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    expect([...inflateSync(logo.imagen.mascara!)]).toEqual([255, 128, 255, 0]);
  });

  it("un PNG con paleta de 4 bits y transparencia", () => {
    const logo = logoParaPdf(png(3, 1, 4, 3, [0, 0x01, 0x20], [["PLTE", [255, 0, 0, 0, 255, 0, 0, 0, 255]], ["tRNS", [255, 0]]]));
    expect(logo.ok).toBe(true);
    if (!logo.ok) return;
    expect([...inflateSync(logo.imagen.datos)]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    expect([...inflateSync(logo.imagen.mascara!)]).toEqual([255, 0, 255]);
  });

  it("un PNG opaco no lleva máscara", () => {
    const logo = logoParaPdf(png(1, 1, 8, 2, [0, 10, 20, 30]));
    expect(logo.ok && logo.imagen.mascara).toBeFalsy();
  });

  it("un JPG va tal cual, con el tamaño de su encabezado", () => {
    const jpg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9];
    const logo = logoParaPdf(`data:image/jpeg;base64,${Buffer.from(jpg).toString("base64")}`);
    expect(logo.ok).toBe(true);
    if (!logo.ok) return;
    expect(logo.imagen).toMatchObject({ ancho: 3, alto: 2, espacioColor: "DeviceRGB", filtro: "DCTDecode" });
    expect([...logo.imagen.datos]).toEqual(jpg);
  });

  it("sin logo, en WebP o roto: dice por qué no va", () => {
    expect(logoParaPdf(null)).toEqual({ ok: false, motivo: "sin_logo" });
    expect(logoParaPdf("data:image/webp;base64,UklGRg==")).toEqual({ ok: false, motivo: "webp" });
    expect(logoParaPdf("data:image/png;base64,AAAA")).toEqual({ ok: false, motivo: "no_soportado" });
    expect(logoParaPdf("data:image/gif;base64,AAAA")).toEqual({ ok: false, motivo: "no_soportado" });
  });
});
