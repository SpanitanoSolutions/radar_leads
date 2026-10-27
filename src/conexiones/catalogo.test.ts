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
    expect(vistaConexion(de("portal:Mapfre"), { estado: "conectado", datos: { usuario: "4471" } }).detalle).toBe(
      "Portal de productores · usuario 4471",
    );
  });

  it("las compañías sin portal trabajan por email y piden el contacto", () => {
    expect(vistaConexion(de("portal:Fianzas y Crédito"), null)).toMatchObject({ estado: "por_email", boton: "Agregar contacto" });
    expect(
      vistaConexion(de("portal:Fianzas y Crédito"), { estado: "por_email", datos: { email: "cotiza@fyc.com" } }),
    ).toMatchObject({ boton: "Administrar", primario: false });
  });

  it("la cuenta bancaria se configura y las opcionales no apuran", () => {
    expect(vistaConexion(de("banco"), null)).toMatchObject({ estado: "sin_conectar", boton: "Configurar", primario: false });
  });
});
