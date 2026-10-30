import { deflateSync, inflateSync } from "node:zlib";

// El logo de la cuenta (ajustes.productor_logo, migración 0012) para la
// propuesta en PDF. Se guarda como data URI PNG, JPG o WebP de hasta 512 KB.
// El JPG entra tal cual (DCTDecode). El PNG se descomprime, se le sacan los
// filtros de cada fila y se vuelve a comprimir; la transparencia va aparte,
// como máscara (SMask). El WebP no se puede poner en un PDF sin una librería:
// la propuesta sale sin logo y la pantalla pide subirlo en PNG o JPG.

export type ImagenPdf = {
  ancho: number;
  alto: number;
  espacioColor: "DeviceRGB" | "DeviceGray";
  filtro: "DCTDecode" | "FlateDecode";
  datos: Uint8Array;
  /** La transparencia del PNG, en escala de grises y comprimida. */
  mascara?: Uint8Array;
};

export type LogoPdf = { ok: true; imagen: ImagenPdf } | { ok: false; motivo: "sin_logo" | "webp" | "no_soportado" };

const MAXIMO_PIXELES = 4_000_000;

function jpeg(bytes: Uint8Array): ImagenPdf | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marcador = bytes[i + 1];
    // Sin longitud: los de reinicio y el relleno.
    if (marcador === 0xff) { i++; continue; }
    if (marcador >= 0xd0 && marcador <= 0xd9) { i += 2; continue; }
    const largo = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0, SOF1 y SOF2: dicen el tamaño y los componentes.
    if (marcador >= 0xc0 && marcador <= 0xc2) {
      const alto = (bytes[i + 5] << 8) | bytes[i + 6];
      const ancho = (bytes[i + 7] << 8) | bytes[i + 8];
      const componentes = bytes[i + 9];
      if (!ancho || !alto || (componentes !== 1 && componentes !== 3)) return null;
      return { ancho, alto, espacioColor: componentes === 1 ? "DeviceGray" : "DeviceRGB", filtro: "DCTDecode", datos: bytes };
    }
    i += 2 + largo;
  }
  return null;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const leer32 = (bytes: Uint8Array, i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;

function png(bytes: Uint8Array): ImagenPdf | null {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!firma.every((valor, indice) => bytes[indice] === valor)) return null;
  let ancho = 0, alto = 0, profundidad = 0, tipo = -1, entrelazado = 0;
  let paleta: Uint8Array | null = null;
  let transparencia: Uint8Array | null = null;
  const partes: Uint8Array[] = [];
  for (let i = 8; i + 8 <= bytes.length;) {
    const largo = leer32(bytes, i);
    const nombre = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const datos = bytes.subarray(i + 8, i + 8 + largo);
    if (nombre === "IHDR") {
      ancho = leer32(datos, 0); alto = leer32(datos, 4);
      profundidad = datos[8]; tipo = datos[9]; entrelazado = datos[12];
    } else if (nombre === "PLTE") paleta = datos;
    else if (nombre === "tRNS") transparencia = datos;
    else if (nombre === "IDAT") partes.push(datos);
    else if (nombre === "IEND") break;
    i += 12 + largo;
  }
  const canales = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo as 0 | 2 | 3 | 4 | 6];
  if (!canales || !ancho || !alto || ancho * alto > MAXIMO_PIXELES || entrelazado !== 0) return null;
  if (tipo === 3 ? ![1, 2, 4, 8].includes(profundidad) || !paleta : profundidad !== 8) return null;

  const crudo = inflateSync(Buffer.concat(partes));
  const bytesPorPixel = Math.max(1, (canales * profundidad) >> 3);
  const porFila = Math.ceil((ancho * canales * profundidad) / 8);
  if (crudo.length < (porFila + 1) * alto) return null;
  const filas = new Uint8Array(porFila * alto);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (porFila + 1)];
    const origen = crudo.subarray(y * (porFila + 1) + 1, (y + 1) * (porFila + 1));
    const base = y * porFila;
    for (let x = 0; x < porFila; x++) {
      const izquierda = x >= bytesPorPixel ? filas[base + x - bytesPorPixel] : 0;
      const arriba = y ? filas[base - porFila + x] : 0;
      const diagonal = y && x >= bytesPorPixel ? filas[base - porFila + x - bytesPorPixel] : 0;
      const prediccion = filtro === 1 ? izquierda : filtro === 2 ? arriba : filtro === 3 ? (izquierda + arriba) >> 1 : filtro === 4 ? paeth(izquierda, arriba, diagonal) : 0;
      filas[base + x] = (origen[x] + prediccion) & 0xff;
    }
  }

  const pixeles = ancho * alto;
  const color = new Uint8Array(pixeles * (tipo === 0 || tipo === 4 ? 1 : 3));
  let alfa: Uint8Array | null = null;
  if (tipo === 0 || tipo === 2) color.set(filas);
  else if (tipo === 4 || tipo === 6) {
    alfa = new Uint8Array(pixeles);
    const colores = canales - 1;
    for (let p = 0; p < pixeles; p++) {
      for (let c = 0; c < colores; c++) color[p * colores + c] = filas[p * canales + c];
      alfa[p] = filas[p * canales + colores];
    }
  } else {
    // Paleta: cada píxel es un índice de 1, 2, 4 u 8 bits.
    if (transparencia) alfa = new Uint8Array(pixeles);
    const mascaraBits = (1 << profundidad) - 1;
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const bit = x * profundidad;
        const indice = (filas[y * porFila + (bit >> 3)] >> (8 - profundidad - (bit & 7))) & mascaraBits;
        const p = y * ancho + x;
        color.set(paleta!.subarray(indice * 3, indice * 3 + 3), p * 3);
        if (alfa) alfa[p] = indice < transparencia!.length ? transparencia![indice] : 255;
      }
    }
  }
  return {
    ancho,
    alto,
    espacioColor: tipo === 0 || tipo === 4 ? "DeviceGray" : "DeviceRGB",
    filtro: "FlateDecode",
    datos: deflateSync(color),
    ...(alfa && alfa.some((valor) => valor < 255) ? { mascara: deflateSync(alfa) } : {}),
  };
}

/** El logo guardado (data URI) listo para el PDF, o por qué no se puede usar. */
export function logoParaPdf(dataUri: string | null | undefined): LogoPdf {
  if (!dataUri) return { ok: false, motivo: "sin_logo" };
  const partes = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  if (!partes) return { ok: false, motivo: "no_soportado" };
  if (partes[1] === "image/webp") return { ok: false, motivo: "webp" };
  try {
    const bytes = new Uint8Array(Buffer.from(partes[2], "base64"));
    const imagen = partes[1] === "image/png" ? png(bytes) : jpeg(bytes);
    return imagen ? { ok: true, imagen } : { ok: false, motivo: "no_soportado" };
  } catch {
    return { ok: false, motivo: "no_soportado" };
  }
}
