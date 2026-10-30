import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sin base: la fila de la conexión vive en memoria y fetch hace de Google.
const base = vi.hoisted(() => ({
  fila: null as { estado: string; datos: Record<string, unknown> } | null,
  guardadas: [] as { clave: string; estado: string; datos: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("./estado", () => ({
  leerConexion: async () => base.fila,
  guardarConexion: async (clave: string, estado: string, datos: Record<string, unknown> = {}) => {
    base.guardadas.push({ clave, estado, datos });
    base.fila = { estado, datos };
  },
}));

process.env.SESSION_SECRET = "x".repeat(40);
process.env.GOOGLE_CLIENT_ID = "cliente";
process.env.GOOGLE_CLIENT_SECRET = "secreto";

const { cifrarSecreto, leerCredenciales, tokenVigente } = await import("./secretos");

const fetchSimulado = vi.fn();

beforeEach(() => {
  base.guardadas.length = 0;
  base.fila = {
    estado: "conectado",
    datos: {
      direccion: "productor@gmail.com",
      proveedor: "Gmail",
      credencialesCifradas: cifrarSecreto(JSON.stringify({ accessToken: "viejo", refreshToken: "renovar", venceEl: Date.now() - 1000 })),
    },
  };
  fetchSimulado.mockReset();
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => vi.unstubAllGlobals());

describe("tokenVigente", () => {
  it("renueva el token vencido y guarda el nuevo sin perder la dirección", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ access_token: "nuevo", expires_in: 3600 }), { status: 200 }));
    expect(await tokenVigente("email", "google")).toBe("nuevo");
    expect(base.guardadas).toHaveLength(1);
    expect(base.guardadas[0]).toMatchObject({ clave: "email", estado: "conectado", datos: { direccion: "productor@gmail.com", proveedor: "Gmail" } });
    expect(await leerCredenciales("email")).toMatchObject({ accessToken: "nuevo", refreshToken: "renovar" });
  });

  it("si Google ya no acepta la autorización, la marca para volver a autorizar y borra el token", async () => {
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 }));
    await expect(tokenVigente("email", "google")).rejects.toThrow("Google ya no acepta la autorización de esta cuenta. Volvé a autorizarla.");
    expect(base.guardadas).toEqual([
      {
        clave: "email",
        estado: "en_proceso",
        datos: { direccion: "productor@gmail.com", proveedor: "Gmail", error: "Google ya no acepta la autorización de esta cuenta. Volvé a autorizarla." },
      },
    ]);
    expect(await leerCredenciales("email")).toBeNull();
  });

  it("otro error del proveedor no toca la conexión: puede ser pasajero", async () => {
    fetchSimulado.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(tokenVigente("email", "google")).rejects.toThrow("El proveedor rechazó renovar la autorización.");
    expect(base.guardadas).toEqual([]);
  });

  it("con el token vigente no llama a Google, salvo que se pida renovarlo", async () => {
    base.fila!.datos.credencialesCifradas = cifrarSecreto(JSON.stringify({ accessToken: "vigente", refreshToken: "renovar", venceEl: Date.now() + 3_600_000 }));
    expect(await tokenVigente("email", "google")).toBe("vigente");
    expect(fetchSimulado).not.toHaveBeenCalled();
    fetchSimulado.mockResolvedValue(new Response(JSON.stringify({ access_token: "nuevo", expires_in: 3600 }), { status: 200 }));
    expect(await tokenVigente("email", "google", true)).toBe("nuevo");
  });
});
