import { describe, expect, it } from "vitest";
import { montoDeDescripcion, reclasificar, type LeadGuardado } from "./reclasificar";

// Leads tal como los guardó la captura antes de las reglas de transporte y de
// la columna texto_clasificacion (datos de producción, octubre de 2026).
const GOBBLACK: LeadGuardado = {
  clave: "bo-pba:sociedad:gobblack-sa",
  empresa: "Gobblack SA",
  rubro: "Transporte y logística",
  motivo: "Sociedad nueva: transporte y logística",
  descripcion:
    "Publicó su constitución en el Boletín Oficial de la Provincia el 22/10/2026, con sede en Mar del Plata. " +
    "Una empresa recién creada necesita contratar sus seguros antes de empezar a operar. " +
    "Objeto: Transporte de pasajeros: explotación de servicios de transporte de pasajeros automotor, con vehículos " +
    "propios, arrendados o de terceros, en cualquier tipo de ámbito. Transporte de pasajeros con discapacidad y con " +
    "movilidad reducida: de adultos mayores y de pacientes, en vehículos comunes o especialmente adaptados. Traslados…",
  zona: "mdp",
  textoClasificacion: null,
  sectorId: "flotas",
  ramos: ["Flota", "Carga", "ART"],
  scoreBase: 87,
};

const SENDEROS: LeadGuardado = {
  clave: "comprar:68-0001-LPR26:30-71222454-8",
  empresa: "Senderos de la Costa S.A.",
  rubro: "Serv. profesional y comercial",
  motivo: "Ganó licitación nacional: Refacción de contrapisos muros y tabiques en sector administrativo - ine",
  descripcion:
    "Adjudicataria del proceso 68-0001-LPR26 (licitacion privada) de Administración Nacional de Laboratorios e " +
    "Institutos de Salud “Dr. Carlos Malbrán, el 22/06/2026, por $ 92.137.810. Para firmar el contrato suele exigirse seguro de caución.",
  zona: "mdp",
  textoClasificacion: null,
  sectorId: "construccion",
  ramos: ["Caución", "RC", "ART", "Todo riesgo construcción"],
  scoreBase: 92,
};

describe("reclasificar leads guardados", () => {
  it("Gobblack pasa a transporte de pasajeros y pierde el ramo Carga", () => {
    expect(reclasificar(GOBBLACK)).toEqual({
      rubro: "Transporte de pasajeros",
      motivo: "Sociedad nueva: transporte de pasajeros",
      ramos: ["Flota", "RC transporte de personas", "AP", "ART"],
    });
  });

  it("una obra deja de mostrar el rubro genérico del proveedor", () => {
    expect(reclasificar(SENDEROS)).toEqual({ rubro: "Construcción" });
  });

  it("no toca lo que ya está bien, ni los ejemplos", () => {
    expect(reclasificar({ ...SENDEROS, rubro: "Construcción" })).toBeNull();
    expect(
      reclasificar({
        ...SENDEROS,
        clave: "comprar:78-0009-LPR25:30-70833310-3",
        empresa: "Larocca Neumaticos S.A.",
        rubro: "Repuestos",
        motivo: "Ganó licitación nacional: Adquisición de neumáticos para la flota de vehículos de Organismo.",
        descripcion: "… el 18/05/2026, por $ 42.953.074. …",
        zona: "provincia",
        sectorId: "comercio",
        ramos: ["Caución"],
        scoreBase: 75,
      }),
    ).toBeNull();
    expect(reclasificar({ ...GOBBLACK, clave: null })).toBeNull();
  });

  it("si existe, usa el texto de clasificación completo", () => {
    expect(
      reclasificar({
        ...SENDEROS,
        rubro: "Construcción",
        textoClasificacion: "Servicio de transporte de personal. TRANSPORTE Y DEPOSITO",
      }),
    ).toEqual({
      sectorId: "flotas",
      rubro: "Transporte de pasajeros",
      ramos: ["Caución", "Flota", "RC transporte de personas", "AP", "ART"],
      // scoreBase no cambia: obra y transporte suman lo mismo en una licitación.
    });
  });

  it("lee el monto de la descripción para el score", () => {
    expect(montoDeDescripcion("… el 22/06/2026, por $ 92.137.810. …")).toEqual({ montoPesos: 92137810 });
    expect(montoDeDescripcion("… el 29/05/2026, en moneda extranjera. …")).toEqual({ enDivisa: true });
    expect(montoDeDescripcion(null)).toEqual({});
  });
});
