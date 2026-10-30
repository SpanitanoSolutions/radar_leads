import { describe, expect, it } from "vitest";
import { leerSubTipos, ramosParaSolicitud, RAMOS_POR_DEFECTO, validarTipoSeguro } from "./tipos-seguro";

const existentes = [{ id: 1, ramo: "Automotor" }, { id: 2, ramo: "Caución" }];

describe("tipos de seguro", () => {
  it("lee los sub-tipos separados por coma, punto y coma o renglón, sin repetidos", () => {
    expect(leerSubTipos("Livianos, pesados;  Mixta\nLIVIANOS, ,")).toEqual(["Livianos", "pesados", "Mixta"]);
    expect(leerSubTipos("")).toEqual([]);
  });

  it("un ramo nuevo no puede repetir otro, sin distinguir mayúsculas ni tildes", () => {
    expect(validarTipoSeguro({ ramo: "  caucion ", descripcion: "", subTipos: "" }, existentes)).toEqual({ ok: false, error: "ramo-repetido" });
    expect(validarTipoSeguro({ ramo: " ", descripcion: "", subTipos: "" }, existentes)).toEqual({ ok: false, error: "ramo-vacio" });
    expect(validarTipoSeguro({ ramo: "Embarcaciones  de placer", descripcion: " Cascos y RC ", subTipos: "Veleros, Lanchas" }, existentes))
      .toEqual({ ok: true, tipo: { ramo: "Embarcaciones de placer", descripcion: "Cascos y RC", subTipos: ["Veleros", "Lanchas"] } });
  });

  it("al editar, el ramo no cambia aunque llegue otro nombre", () => {
    expect(validarTipoSeguro({ id: 1, ramo: "Autos", descripcion: "Particulares", subTipos: "RC" }, existentes))
      .toEqual({ ok: true, tipo: { ramo: "Automotor", descripcion: "Particulares", subTipos: ["RC"] } });
  });

  it("la nueva solicitud ofrece los activos, o los de la spec si no hay ninguno cargado", () => {
    expect(ramosParaSolicitud([
      { ramo: "Automotor", descripcion: "Autos", activo: true },
      { ramo: "Caución", descripcion: "", activo: false },
    ])).toEqual([{ ramo: "Automotor", descripcion: "Autos" }]);
    expect(ramosParaSolicitud([]).map((r) => r.ramo)).toEqual(RAMOS_POR_DEFECTO);
    expect(ramosParaSolicitud([{ ramo: "Caución", descripcion: "", activo: false }])).toEqual([]);
  });
});
