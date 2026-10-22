import { beforeAll, describe, expect, it } from "vitest";
import { claveCorrecta, crearToken, DURACION_SESION_MS, tokenValido } from "./sesion";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.APP_PASSWORD = "clave-de-prueba";
});

describe("sesión", () => {
  it("acepta un token recién creado", async () => {
    expect(await tokenValido(await crearToken())).toBe(true);
  });

  it("rechaza tokens vencidos, alterados o vacíos", async () => {
    const ahora = Date.now();
    const token = await crearToken(ahora);
    expect(await tokenValido(token, ahora + DURACION_SESION_MS + 1)).toBe(false);

    const [vence, firma] = token.split(".");
    expect(await tokenValido(`${Number(vence) + 1000}.${firma}`)).toBe(false);
    expect(await tokenValido(`${vence}.${firma.slice(0, -2)}xx`)).toBe(false);
    expect(await tokenValido(undefined)).toBe(false);
    expect(await tokenValido("basura")).toBe(false);
  });

  it("valida la contraseña", async () => {
    expect(await claveCorrecta("clave-de-prueba")).toBe(true);
    expect(await claveCorrecta("otra")).toBe(false);
  });
});
