import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sin base ni Google: la fila de la conexión y el token se simulan, y fetch
// anota lo que se le mandaría a Gmail.
const base = vi.hoisted(() => ({
  fila: null as { estado: string; datos: Record<string, unknown> } | null,
  renovaciones: [] as boolean[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./estado", () => ({ leerConexion: async () => base.fila }));
vi.mock("./secretos", () => ({
  leerCredenciales: async () => (base.fila ? { accessToken: "token" } : null),
  tokenVigente: async (_clave: string, _proveedor: string, renovar = false) => {
    base.renovaciones.push(renovar);
    return renovar ? "renovado" : "token";
  },
  borrarCredenciales: async () => {},
}));

const { email, remitenteDe } = await import("./email");

const fetchSimulado = vi.fn();

/** El correo tal como le llegaría a Gmail, ya decodificado. */
function correoEnviado(): string {
  const [, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
  return Buffer.from(JSON.parse(String(init.body)).raw, "base64url").toString("utf8");
}

beforeEach(() => {
  base.fila = { estado: "conectado", datos: { direccion: "productor@gmail.com", proveedor: "Gmail" } };
  base.renovaciones.length = 0;
  fetchSimulado.mockReset();
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => vi.unstubAllGlobals());

describe("remitenteDe", () => {
  it("pone el nombre, con acentos, al lado de la dirección", () => {
    expect(remitenteDe("productor@gmail.com", "Julián Pérez")).toBe(`=?UTF-8?B?${Buffer.from("Julián Pérez").toString("base64")}?= <productor@gmail.com>`);
  });

  it("sin nombre queda solo la dirección, y un nombre no puede agregar encabezados", () => {
    expect(remitenteDe("productor@gmail.com", null)).toBe("productor@gmail.com");
    expect(remitenteDe("productor@gmail.com", "  ")).toBe("productor@gmail.com");
    expect(remitenteDe("productor@gmail.com", 'Ana\r\nBcc: otro@x.com "<x>"')).not.toMatch(/[\r\n]/);
  });
});

describe("email.enviar", () => {
  it("manda por Gmail con el remitente, el asunto y el texto", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    const r = await email.enviar({ para: "cotizaciones@compania.com.ar", asunto: "Cotización · Auto", texto: "Hola, ¿cómo están?", remitente: "Julián Pérez" });
    expect(r).toEqual({ ok: true, id: "abc" });
    expect(fetchSimulado.mock.calls[0][0]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    const correo = correoEnviado();
    expect(correo).toContain("To: cotizaciones@compania.com.ar\r\n");
    expect(correo).toContain(`From: ${remitenteDe("productor@gmail.com", "Julián Pérez")}\r\n`);
    expect(correo).toContain(`Subject: =?UTF-8?B?${Buffer.from("Cotización · Auto").toString("base64")}?=\r\n`);
    expect(Buffer.from(correo.split("\r\n\r\n")[1], "base64").toString("utf8")).toBe("Hola, ¿cómo están?");
  });

  it("sin Gmail conectado no llama a Google", async () => {
    base.fila = null;
    expect(await email.enviar({ para: "a@b.com", asunto: "x", texto: "y" })).toEqual({ ok: false, error: "Gmail no está conectado." });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("si Google no dio el permiso de enviar, pide volver a autorizar", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Insufficient Permission" } }), { status: 403 }));
    const r = await email.enviar({ para: "a@b.com", asunto: "x", texto: "y" });
    expect(r).toEqual({ ok: false, error: "Google no dio permiso para enviar correos con esta cuenta. Volvé a autorizar Gmail." });
  });

  it("si Google rechaza el token antes de que venza, lo renueva y reintenta una vez", async () => {
    fetchSimulado
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    expect(await email.enviar({ para: "a@b.com", asunto: "x", texto: "y" })).toEqual({ ok: true, id: "abc" });
    expect(base.renovaciones).toEqual([false, true]);
    const cabeceras = fetchSimulado.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
    expect(cabeceras.map((h) => h.Authorization)).toEqual(["Bearer token", "Bearer renovado"]);
  });

  it("otros errores de Gmail dicen qué respondió", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid To header" } }), { status: 400 }));
    expect(await email.enviar({ para: "a@b.com", asunto: "x", texto: "y" })).toEqual({ ok: false, error: "Gmail respondió 400: Invalid To header" });
  });
});
