import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrar, claveCredenciales, descifrar } from "./cifrado";

const CLAVE = randomBytes(32).toString("base64");

describe("cifrado de credenciales", () => {
  it("cifra y descifra sin dejar el secreto a la vista", () => {
    const secreto = "Clave.Del.Portal-2026";
    const cifrado = cifrar(secreto, CLAVE);
    expect(cifrado).not.toContain(secreto);
    expect(cifrado.split(".")).toHaveLength(3);
    expect(descifrar(cifrado, CLAVE)).toBe(secreto);
  });

  it("cada cifrado es distinto aunque el secreto sea el mismo", () => {
    expect(cifrar("igual", CLAVE)).not.toBe(cifrar("igual", CLAVE));
  });

  it("detecta un dato alterado y una clave distinta, sin mostrar el secreto", () => {
    const cifrado = cifrar("secreto-muy-privado", CLAVE);
    const [iv, tag, contenido] = cifrado.split(".");
    const alterado = [iv, tag, `${contenido.slice(0, -2)}AA`].join(".");
    expect(() => descifrar(alterado, CLAVE)).toThrow(/no se puede leer/);
    expect(() => descifrar(cifrado, randomBytes(32).toString("base64"))).toThrow(/no se puede leer/);
    try {
      descifrar(cifrado, randomBytes(32).toString("base64"));
    } catch (error) {
      expect(String(error)).not.toContain("secreto-muy-privado");
    }
  });

  it("pide la clave y que tenga 32 bytes", () => {
    expect(() => cifrar("x", undefined)).toThrow("Falta CREDENCIALES_PORTAL_KEY.");
    expect(() => cifrar("x", Buffer.from("corta").toString("base64"))).toThrow("debe contener 32 bytes");
    expect(() => descifrar("a.b", CLAVE)).toThrow(/no se puede leer/);
  });

  it("usa la clave de Cotización si no hay una propia", () => {
    expect(claveCredenciales({ CREDENCIALES_PORTAL_KEY: "a", COTIZACION_CREDENTIALS_KEY: "b" })).toEqual({ clave: "a", nombre: "CREDENCIALES_PORTAL_KEY" });
    expect(claveCredenciales({ COTIZACION_CREDENTIALS_KEY: "b" })).toEqual({ clave: "b", nombre: "COTIZACION_CREDENTIALS_KEY" });
    expect(claveCredenciales({}).clave).toBeUndefined();
  });
});
