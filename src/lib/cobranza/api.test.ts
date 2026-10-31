import { describe, expect, it } from "vitest";
import { claveDelEncabezado, generarClave, hashClave, leerPaginacion } from "./api";

describe("claves de la API", () => {
  it("genera claves distintas con su prefijo y hash", () => {
    const a = generarClave();
    const b = generarClave();
    expect(a.clave).toMatch(/^uniqo_[\w-]{43}$/);
    expect(a.clave).not.toBe(b.clave);
    expect(a.prefijo).toBe(a.clave.slice(0, 12));
    expect(a.hash).toBe(hashClave(a.clave));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lee la clave del encabezado Authorization", () => {
    const { clave } = generarClave();
    expect(claveDelEncabezado(`Bearer ${clave}`)).toBe(clave);
    expect(claveDelEncabezado(`bearer  ${clave}`)).toBe(clave);
    expect(claveDelEncabezado(clave)).toBeNull();
    expect(claveDelEncabezado("Bearer otra-cosa-larga-pero-sin-prefijo")).toBeNull();
    expect(claveDelEncabezado("Bearer uniqo_corta")).toBeNull();
    expect(claveDelEncabezado(null)).toBeNull();
  });

  it("paginación con límites", () => {
    expect(leerPaginacion(new URLSearchParams(""))).toEqual({ pagina: 1, porPagina: 50 });
    expect(leerPaginacion(new URLSearchParams("pagina=3&porPagina=500"))).toEqual({ pagina: 3, porPagina: 100 });
    expect(leerPaginacion(new URLSearchParams("pagina=-2&porPagina=abc"))).toEqual({ pagina: 1, porPagina: 50 });
  });
});
