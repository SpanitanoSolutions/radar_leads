import { describe, expect, it } from "vitest";
import { CONEXIONES, conexionesPendientes, siglaDe, vistaConexion } from "./catalogo";

const de = (clave: string) => CONEXIONES.find((c) => c.clave === clave)!;

describe("catálogo de conexiones", () => {
  it("arma las siglas como en el diseño", () => {
    expect(["Mapfre", "Sancor", "Federación Patronal", "La Segunda", "Fianzas y Crédito"].map(siglaDe)).toEqual([
      "MA",
      "SA",
      "FP",
      "LS",
      "FC",
    ]);
  });

  it("WhatsApp es la única que falta para que trabajen los agentes", () => {
    expect(conexionesPendientes([]).map((c) => c.clave)).toEqual(["whatsapp"]);
    expect(conexionesPendientes(["whatsapp"])).toEqual([]);
  });
});

describe("vistaConexion", () => {
  it("WhatsApp sin conectar es pendiente y pide conectar", () => {
    expect(vistaConexion(de("whatsapp"), null)).toMatchObject({ estado: "pendiente", boton: "Conectar", primario: true });
  });

  it("conectada muestra sus datos y se administra", () => {
    expect(vistaConexion(de("email"), { estado: "conectado", datos: { direccion: "yo@ejemplo.com", proveedor: "Gmail" } })).toMatchObject({
      estado: "conectado",
      detalle: "yo@ejemplo.com · Gmail",
      boton: "Administrar",
    });
  });

  it("las compañías de seguros no están en el catálogo: tienen su propia pantalla", () => {
    expect(CONEXIONES.filter((c) => c.grupo === "companias")).toEqual([]);
  });

  it("la cuenta bancaria se configura y las opcionales no apuran", () => {
    expect(vistaConexion(de("banco"), null)).toMatchObject({ estado: "sin_conectar", boton: "Configurar", primario: false });
  });
});
