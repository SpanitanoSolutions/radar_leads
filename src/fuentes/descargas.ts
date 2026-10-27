// Pedidos a las fuentes públicas. Se identifican como UNIQO, no reintentan
// en loop y respetan una pausa entre descargas del mismo sitio.

const AGENTE = "UNIQO/1.0 (captura diaria de datos publicos)";

export async function pedir(url: string, opciones: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 120_000, headers, ...resto } = opciones;
  const respuesta = await fetch(url, {
    ...resto,
    headers: { "User-Agent": AGENTE, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!respuesta.ok) throw new Error(`${url} respondió ${respuesta.status}`);
  return respuesta;
}

/** Versión publicada de un archivo (ETag o fecha de modificación), sin descargarlo. */
export async function versionDeArchivo(url: string): Promise<string | null> {
  const r = await pedir(url, { method: "HEAD", timeoutMs: 30_000 });
  return r.headers.get("etag") ?? r.headers.get("last-modified");
}

/** Texto de una descarga en pedazos, para procesar archivos grandes sin cargarlos enteros. */
export async function* textoEnPedazos(respuesta: Response): AsyncGenerator<string> {
  if (!respuesta.body) return;
  const lector = respuesta.body.pipeThrough(new TextDecoderStream("utf-8")).getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return;
    yield value;
  }
}

export const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
