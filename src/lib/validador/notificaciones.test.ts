import { describe, expect, it } from "vitest";
import { avisoDeResumen, avisosPorEvento, leerDestinatarios, leerNotificaciones, type Hechos } from "./notificaciones";

const HECHOS: Hechos = { pagosConfirmados: 3, porVencer: 0, vencidas: 2, errores: [{ compania: "Sancor", codigo: "timeout", mensaje: "No respondió." }] };

describe("leerNotificaciones", () => {
  it("sin configuración, todo apagado y en modo resumen", () => {
    expect(leerNotificaciones(null)).toEqual({
      whatsapp: { activo: false, destinatarios: [] },
      email: { activo: false, destinatarios: [] },
      eventos: [],
      modo: "resumen",
    });
  });

  it("descarta eventos desconocidos y destinatarios vacíos", () => {
    const leidas = leerNotificaciones({
      email: { activo: true, destinatarios: ["a@b.com", " "] },
      eventos: ["vencidas", "otro" as never],
      modo: "evento",
    });
    expect(leidas.email).toEqual({ activo: true, destinatarios: ["a@b.com"] });
    expect(leidas.eventos).toEqual(["vencidas"]);
    expect(leidas.modo).toBe("evento");
  });
});

describe("leerDestinatarios", () => {
  it("emails y teléfonos, uno por línea o separados por coma, sin repetir", () => {
    expect(leerDestinatarios("julian@uniqo.com.ar\nmal@\njulian@uniqo.com.ar, otro@x.com", "email")).toEqual({
      destinatarios: ["julian@uniqo.com.ar", "otro@x.com"],
      invalidos: ["mal@"],
    });
    expect(leerDestinatarios("+54 9 223 555-1234\n123", "whatsapp")).toEqual({ destinatarios: ["+54 9 223 555-1234"], invalidos: ["123"] });
  });
});

describe("avisos", () => {
  it("evento por evento: uno por cada evento elegido con novedades", () => {
    const avisos = avisosPorEvento(HECHOS, ["por_vencer", "vencidas", "errores"], "https://uniqo.app/agentes/validador");
    expect(avisos.map((a) => a.asunto)).toEqual(["Validador: cuotas vencidas", "Validador: la corrida tuvo errores"]);
    expect(avisos[0].texto).toBe("2 cuotas vencidas (pasó la gracia).\n\nDetalle: https://uniqo.app/agentes/validador");
    expect(avisos[1].texto).toMatch(/^La corrida tuvo 1 error: Sancor: No respondió\./);
  });

  it("resumen: un solo aviso con el resumen del día y las líneas de lo elegido", () => {
    const aviso = avisoDeResumen("Se confirmaron 3 pagos.", HECHOS, ["pagos_confirmados", "por_vencer"], null);
    expect(aviso).toEqual({ asunto: "Validador de pagos: resumen del día", texto: "Se confirmaron 3 pagos.\n\n• 3 pagos confirmados." });
    expect(avisoDeResumen("Nada.", { ...HECHOS, pagosConfirmados: 0 }, ["pagos_confirmados"], null)?.texto).toBe("Nada.\n\nSin novedades en lo que elegiste avisar.");
    expect(avisoDeResumen("Nada.", HECHOS, [], null)).toBeNull();
  });
});
