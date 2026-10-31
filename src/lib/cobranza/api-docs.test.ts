import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE_API, ejemploCurl, ejemploJs, ENDPOINTS } from "./api-docs";

describe("referencia de la API", () => {
  it("cada endpoint documentado existe y exporta su método", () => {
    for (const e of ENDPOINTS) {
      const archivo = `src/app${BASE_API}${e.ruta.replace(/:id/g, "[id]")}/route.ts`;
      expect(existsSync(archivo), archivo).toBe(true);
      expect(readFileSync(archivo, "utf8"), `${e.metodo} ${e.ruta}`).toMatch(new RegExp(`export async function ${e.metodo}\\(`));
    }
  });

  it("arma los ejemplos con la clave en una variable", () => {
    const crear = ENDPOINTS.find((e) => e.id === "corridas-crear")!;
    expect(ejemploCurl(crear, "https://www.un1qo.com")).toBe(
      'curl -X POST "https://www.un1qo.com/api/v1/agentes/cobranza/corridas" \\\n  -H "Authorization: Bearer $UNIQO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"modoPrueba":true,"limite":10}\'',
    );
    expect(ejemploJs(crear, "")).toContain('method: "POST"');
    expect(ejemploCurl(ENDPOINTS.find((e) => e.id === "casos-leer")!, "")).toContain("/casos/128");
  });
});
