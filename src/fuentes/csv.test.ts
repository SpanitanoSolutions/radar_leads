import { describe, expect, it } from "vitest";
import { celdasCsv, filasCsv } from "./csv";

async function leer(pedazos: string[], separador?: string) {
  const filas: Record<string, string>[] = [];
  for await (const f of filasCsv(pedazos, separador)) filas.push(f);
  return filas;
}

const CSV =
  '﻿Numero_Proceso,Razon _Social,Monto\r\n' +
  '68-0001-LPR26,"SENDEROS DE LA COSTA S.A.","83,932,554.11"\r\n' +
  '21-0003-LPR26,"Dijo ""hola""\ny siguió",10\r\n' +
  "\r\n" +
  "47-0042-CDI26,JOSE MOZCUZZA Y CIA SA,740.72";

const ESPERADO = [
  { Numero_Proceso: "68-0001-LPR26", Razon_Social: "SENDEROS DE LA COSTA S.A.", Monto: "83,932,554.11" },
  { Numero_Proceso: "21-0003-LPR26", Razon_Social: 'Dijo "hola"\ny siguió', Monto: "10" },
  { Numero_Proceso: "47-0042-CDI26", Razon_Social: "JOSE MOZCUZZA Y CIA SA", Monto: "740.72" },
];

describe("filasCsv", () => {
  it("lee comillas, comillas escapadas, saltos de línea en un campo y CRLF", async () => {
    expect(await leer([CSV])).toEqual(ESPERADO);
  });

  it("da lo mismo aunque el archivo llegue cortado en cualquier lugar", async () => {
    for (let corte = 1; corte < CSV.length; corte++) {
      expect(await leer([CSV.slice(0, corte), CSV.slice(corte)])).toEqual(ESPERADO);
    }
    expect(await leer(CSV.split(""))).toEqual(ESPERADO);
  });

  it("con conservarVacias, las líneas en blanco llegan como filas vacías, aunque el archivo llegue cortado", async () => {
    const texto = "a;b\r\n\r\nc;d\n\n";
    const leerCeldas = async (pedazos: string[], opciones?: { conservarVacias: boolean }) => {
      const filas: string[][] = [];
      for await (const f of celdasCsv(pedazos, ";", opciones)) filas.push(f);
      return filas;
    };
    for (let corte = 1; corte < texto.length; corte++) {
      expect(await leerCeldas([texto.slice(0, corte), texto.slice(corte)], { conservarVacias: true })).toEqual([["a", "b"], [], ["c", "d"], []]);
    }
    expect(await leerCeldas([texto])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("acepta otro separador", async () => {
    expect(await leer(["FECHA;LOCALIDAD\n01/02/2025;MAR DEL PLATA\n"], ";")).toEqual([
      { FECHA: "01/02/2025", LOCALIDAD: "MAR DEL PLATA" },
    ]);
  });
});
