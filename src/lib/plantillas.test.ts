import { describe, expect, it } from "vitest";
import { completarPlantilla, conFirma, nombreDePila } from "./plantillas";

describe("completarPlantilla", () => {
  it("reemplaza las variables, con o sin tildes", () => {
    expect(
      completarPlantilla("Hola {nombre}, tu seguro con {compañía} vence el {vence}.", {
        nombre: "Lucía",
        compañía: "Mapfre",
        vence: "29/10",
      }),
    ).toBe("Hola Lucía, tu seguro con Mapfre vence el 29/10.");
  });

  it("deja como están las variables que no conoce o vienen vacías", () => {
    expect(completarPlantilla("Pagá por {medios de pago}. {otra}", { "medios de pago": "" })).toBe(
      "Pagá por {medios de pago}. {otra}",
    );
  });
});

describe("conFirma", () => {
  it("firma con el nombre del productor o con un recordatorio", () => {
    expect(conFirma("Saludos, {productor}", "Julián Pérez")).toBe("Saludos, Julián Pérez");
    expect(conFirma("Saludos, {productor}", null)).toBe("Saludos, [Nombre del productor]");
  });
});

describe("nombreDePila", () => {
  it("toma el nombre de las personas y deja la razón social", () => {
    expect(nombreDePila("Gómez, Lucía", false)).toBe("Lucía");
    expect(nombreDePila("Pereyra, Martín José", false)).toBe("Martín");
    expect(nombreDePila("Hotel Brisas del Sur SA", true)).toBe("Hotel Brisas del Sur SA");
  });
});
