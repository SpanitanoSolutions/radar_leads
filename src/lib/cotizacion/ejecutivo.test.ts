import { describe, expect, it } from "vitest";
import type { ContextoEnvios, EnvioDetalle } from "./detalle";
import { etiquetaRiesgo, huellaDeTexto, resumenParaEjecutivo } from "./ejecutivo";

const base: EnvioDetalle = {
  id: 1, compania: "Sancor", estado: "pendiente", estadoBorrador: "pendiente", canalUsado: null, numeroCompania: null,
  folio: null, paqueteId: null, ultimoError: null, preguntasPendientes: null, intentos: [], proximoSeguimiento: null,
  cantidadSeguimientos: 0, ultimaActividad: new Date("2026-10-30T13:00:00Z"),
};

describe("resumen para el ejecutivo", () => {
  it("lleva el riesgo con sus nombres, cada compañía con su estado y el mejor precio confirmado", () => {
    const ctx: ContextoEnvios = {
      cotizando: new Set(), sinEnviar: new Set(), consultas: new Map(),
      nombrePaquete: new Map([[9, "Terceros completo"]]),
      resultados: new Map([
        [1, { envioId: 1, primaTotal: 912000, confirmado: true }],
        [2, { envioId: 2, primaTotal: 880000, confirmado: false }],
      ]),
    };
    const { asunto, cuerpo } = resumenParaEjecutivo({
      solicitud: { numero: 1043, cliente: "Gómez, Lucía", ramo: "Automotor", tipo: "negocio_nuevo", bien: "Toyota Corolla", datosRiesgo: { marca: "Toyota", anio: "2022", codigoPostal: "7600", conductor: "" } },
      envios: [
        { ...base, id: 1, paqueteId: 9, estado: "cotizado" },
        { ...base, id: 2, compania: "Mapfre", estado: "enviado" },
        { ...base, id: 3, compania: "Rivadavia", estado: "requiere_atencion", preguntasPendientes: "¿Uso del vehículo?" },
      ],
      ctx,
      saludo: "Julián",
    });
    expect(asunto).toBe("Resumen – Automotor – Gómez, Lucía – Solicitud 1043");
    expect(cuerpo).toContain("Hola Julián:");
    expect(cuerpo).toContain("negocio nuevo de Automotor, Toyota Corolla.");
    expect(cuerpo).toContain("- Marca: Toyota\n- Año: 2022\n- Código postal: 7600");
    expect(cuerpo).not.toContain("Conductor");
    expect(cuerpo).toMatch(/- Sancor \(Terceros completo\): cotizó \$\s?912\.000 · mejor precio\./);
    expect(cuerpo).toMatch(/- Mapfre: cotizó \$\s?880\.000, falta confirmarla\./);
    expect(cuerpo).toContain("- Rivadavia: Requiere atención. Pregunta: ¿Uso del vehículo?");
    expect(cuerpo).toMatch(/2 de 3 respondieron\. Mejor precio confirmado: Sancor, \$\s?912\.000\.$/);
  });

  it("sin respuestas lo dice, y sin saludo no deja un espacio de más", () => {
    const { cuerpo } = resumenParaEjecutivo({
      solicitud: { numero: 1, cliente: "X", ramo: "Hogar", tipo: "renovacion", bien: null, datosRiesgo: {} },
      envios: [base],
      ctx: { cotizando: new Set(), sinEnviar: new Set(), consultas: new Map(), nombrePaquete: new Map(), resultados: new Map() },
      saludo: null,
    });
    expect(cuerpo.startsWith("Hola:\n\nTe paso el resumen de la solicitud 1 de X: renovación de Hogar.")).toBe(true);
    expect(cuerpo).toContain("Datos del riesgo: todavía no se cargaron.");
    expect(cuerpo).toContain("0 de 1 respondieron. Todavía no hay precios confirmados.");
  });

  it("nombra los campos del riesgo y la huella cambia si cambia el texto", () => {
    expect(etiquetaRiesgo("codigoPostal")).toBe("Código postal");
    expect(etiquetaRiesgo("cantidadUnidades")).toBe("Cantidad de unidades");
    expect(etiquetaRiesgo("sumaAsegurada")).toBe("Suma asegurada");
    expect(etiquetaRiesgo("otro")).toBe("otro");
    expect(huellaDeTexto("hola")).toBe(huellaDeTexto("hola"));
    expect(huellaDeTexto("hola")).not.toBe(huellaDeTexto("hola."));
    expect(huellaDeTexto("hola")).toMatch(/^[0-9a-f]{8}$/);
  });
});
