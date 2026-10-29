import { readFileSync } from "node:fs";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

// borrarEjemplosDeCartera() borra los archivos que ya no usa nadie. Si una
// tabla que guarda un archivo no está en esa consulta, se borran archivos
// reales (pasó con los listados del Validador, los gastos y los informes).
describe("borrarEjemplosDeCartera", () => {
  const consulta = readFileSync(new URL("./ejemplos.ts", import.meta.url), "utf8");
  const referencias = Object.values(schema as Record<string, unknown>)
    .filter((tabla): tabla is PgTable => is(tabla, PgTable))
    .flatMap((tabla) => {
      const { name, foreignKeys } = getTableConfig(tabla);
      return foreignKeys
        .map((fk) => fk.reference())
        .filter((ref) => getTableConfig(ref.foreignTable).name === "archivos")
        .flatMap((ref) => ref.columns.map((columna) => ({ tabla: name, columna: columna.name })));
    });

  it("encuentra las tablas que guardan archivos", () => {
    expect(referencias.map((r) => r.tabla)).toEqual(expect.arrayContaining(["comprobantes", "documentos_asegurado", "validador_fuentes"]));
  });

  it.each(referencias)("no borra un archivo que usa $tabla.$columna", ({ tabla, columna }) => {
    expect(consulta).toMatch(new RegExp(`not exists \\(select 1 from ${tabla} \\w+ where \\w+\\.${columna} = a\\.id\\)`));
  });
});
