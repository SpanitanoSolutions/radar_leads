import { describe, expect, it } from "vitest";
import { documentoComparativo, documentoPropuesta, type ResultadoPdf } from "./propuesta";

const resultado = (cambios: Partial<ResultadoPdf>): ResultadoPdf => ({
  envioId: 1, primaTotal: 912000, moneda: "ARS", franquicia: "$ 350.000", vigencia: "01/11/2026 al 01/11/2027", coberturas: [], confirmado: true, ...cambios,
});
const solicitud = { numero: 1042, cliente: "Gómez, Lucía", ramo: "Automotor", bien: "Peugeot 208" };
const envios = [
  { id: 1, compania: "Sancor", estado: "cotizado", paqueteId: 9 },
  { id: 2, compania: "Mapfre", estado: "cotizado", paqueteId: null },
  { id: 3, compania: "Rivadavia", estado: "enviado", paqueteId: null },
];
const cuenta = { organizacion: "Pérez Seguros", nombre: "Julián Pérez", telefono: "223 555-0101", email: null };

describe("contenido de la propuesta", () => {
  it("lleva solo las confirmadas, de la más barata a la más cara, con el mejor precio marcado y la marca de la cuenta", () => {
    const doc = documentoPropuesta({
      solicitud, envios, cuenta, logo: null, fecha: "30/10/2026",
      nombrePaquete: new Map([[9, "Terceros completo"]]),
      resultados: [
        resultado({ envioId: 2, primaTotal: 958000, franquicia: null, coberturas: [{ nombre: "Cristales", valor: "Hasta $ 300.000" }, { nombre: "Terceros completo" }] }),
        resultado({ envioId: 1 }),
        resultado({ envioId: 3, primaTotal: 700000, confirmado: false }),
      ],
    });
    expect(doc.titulo).toBe("Propuesta de seguro para Gómez, Lucía");
    expect(doc.subtitulo).toBe("Solicitud 1042 · Automotor · Peugeot 208");
    expect(doc.marca).toEqual({ organizacion: "Pérez Seguros", productor: "Julián Pérez", contacto: "223 555-0101" });
    expect(doc.tabla.filas.map((fila) => fila.celdas[0])).toEqual(["Sancor · Terceros completo", "Mapfre"]);
    expect(doc.tabla.filas[0]).toMatchObject({ destacada: true, etiqueta: "Mejor precio" });
    expect(doc.tabla.filas[1].destacada).toBeUndefined();
    expect(doc.tabla.filas[1].celdas.slice(1)).toEqual([expect.stringMatching(/958\.000/), "A confirmar", "01/11/2026 al 01/11/2027"]);
    expect(doc.secciones).toEqual([{ titulo: "Coberturas informadas", lineas: ["Mapfre. Cristales: Hasta $ 300.000. Otras: Terceros completo."] }]);
  });

  it("sin organización usa el nombre del productor", () => {
    const doc = documentoPropuesta({ solicitud, envios, cuenta: { ...cuenta, organizacion: null }, logo: null, fecha: "30/10/2026", nombrePaquete: new Map(), resultados: [resultado({})] });
    expect(doc.marca.organizacion).toBe("Julián Pérez");
  });
});

describe("comparativo exportado", () => {
  it("lleva todas las compañías, con su estado y si falta confirmar", () => {
    const doc = documentoComparativo({
      solicitud, cuenta, logo: null, fecha: "30/10/2026",
      filas: [
        { compania: "Sancor", estado: "Cotizado", resultado: resultado({ envioId: 1 }) },
        { compania: "Mapfre", estado: "Respondió", resultado: resultado({ envioId: 2, primaTotal: 800000, confirmado: false }) },
        { compania: "Rivadavia", estado: "Enviado por correo", resultado: null },
      ],
    });
    expect(doc.titulo).toBe("Comparativa de la solicitud 1042");
    expect(doc.tabla.filas.map((fila) => [fila.celdas[0], fila.celdas[4], Boolean(fila.destacada)])).toEqual([
      ["Sancor", "Sí", true],
      ["Mapfre", "Falta confirmar", false],
      ["Rivadavia", "—", false],
    ]);
  });
});
