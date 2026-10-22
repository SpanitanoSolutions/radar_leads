/**
 * Sectores, ajustes iniciales y leads de ejemplo.
 * Lo usan scripts/seed.ts (a mano) y scripts/preparar-db.ts (en cada deploy).
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { NuevoLead } from "../src/db/schema";
import { diaEnArgentina } from "../src/lib/fechas";

const { sectores, ajustes, leads } = schema;

const SECTORES = [
  {
    id: "flotas",
    nombre: "Flotas y transporte",
    ejemplos: "Logística, reparto, remises, transporte escolar",
    ramosTipicos: "Flota, carga, ART, AP",
    principal: true,
    prioridad: "alta" as const,
    orden: 1,
  },
  {
    id: "construccion",
    nombre: "Construcción",
    ejemplos: "Constructoras, contratistas de obra",
    ramosTipicos: "Caución, RC, ART, todo riesgo construcción",
    prioridad: "alta" as const,
    orden: 2,
  },
  {
    id: "industria",
    nombre: "Industria",
    ejemplos: "Metalúrgicas, pesqueras, talleres",
    ramosTipicos: "Integral, ART, caución",
    orden: 3,
  },
  {
    id: "gastronomia",
    nombre: "Gastronomía",
    ejemplos: "Restaurantes, bares, rotiserías",
    ramosTipicos: "Integral de comercio, ART",
    orden: 4,
  },
  {
    id: "comercio",
    nombre: "Comercio",
    ejemplos: "Locales minoristas y mayoristas",
    ramosTipicos: "Integral de comercio, RC",
    orden: 5,
  },
  {
    id: "salud",
    nombre: "Salud",
    ejemplos: "Consultorios, clínicas, ópticas",
    ramosTipicos: "RC profesional, integral",
    prioridad: "baja" as const,
    orden: 6,
  },
];

function haceDias(dias: number): Date {
  return new Date(Date.now() - dias * 86_400_000);
}

const EJEMPLOS: NuevoLead[] = [
  {
    empresa: "Construcciones Punta Mogotes SA",
    rubro: "Construcción",
    localidad: "Mar del Plata",
    zona: "mdp",
    sectorId: "construccion",
    motivo: "Ganó licitación de obra pública provincial",
    descripcion:
      "Resultó adjudicataria de una obra pública provincial. Para firmar el contrato necesita presentar seguro de caución, y para ejecutar la obra, RC y ART.",
    fuente: "PBAC – adjudicaciones",
    alcanceLicitacion: "provincial",
    ramos: ["Caución", "RC", "ART"],
    scoreBase: 90,
    detectadoEl: haceDias(1),
  },
  {
    empresa: "Transportes Pampa Sur SA",
    rubro: "Transporte de pasajeros",
    localidad: "Tandil",
    zona: "provincia",
    sectorId: "flotas",
    motivo: "Ganó licitación nacional de servicio de transporte",
    descripcion:
      "Adjudicataria de un servicio de transporte en una licitación nacional. Va a necesitar caución por el contrato y cobertura para la flota que preste el servicio.",
    fuente: "COMPR.AR – adjudicaciones",
    alcanceLicitacion: "nacional",
    ramos: ["Flota", "Caución", "ART"],
    scoreBase: 88,
    detectadoEl: haceDias(0),
  },
  {
    empresa: "Logística Atlántica SRL",
    rubro: "Transporte de cargas",
    localidad: "Mar del Plata",
    zona: "mdp",
    sectorId: "flotas",
    motivo: "Sociedad nueva con objeto transporte de cargas",
    descripcion:
      "Publicó su constitución en el Boletín Oficial. Una empresa de transporte recién creada necesita asegurar sus vehículos y contratar ART antes de empezar a operar.",
    fuente: "Boletín Oficial",
    ramos: ["Flota", "Carga", "ART"],
    scoreBase: 87,
    detectadoEl: haceDias(2),
    deudaBcra: "Sin registros",
  },
  {
    empresa: "Remises Güemes",
    rubro: "Agencia de remises",
    localidad: "Mar del Plata",
    zona: "mdp",
    sectorId: "flotas",
    motivo: "Nueva habilitación municipal de agencia",
    fuente: "Habilitaciones MGP",
    ramos: ["Flota", "AP"],
    scoreBase: 83,
    estado: "reunion",
    nota: "Tienen 6 autos, renuevan en diciembre con otra compañía.",
    detectadoEl: haceDias(4),
  },
  {
    empresa: "Distribuidora El Faro",
    rubro: "Distribución mayorista",
    localidad: "Balcarce",
    zona: "costa",
    sectorId: "flotas",
    motivo: "Busca 4 choferes repartidores",
    fuente: "Búsquedas laborales",
    ramos: ["Flota", "ART"],
    scoreBase: 76,
    estado: "llamado",
    detectadoEl: haceDias(0),
  },
  {
    empresa: "Metalúrgica del Puerto",
    rubro: "Metalurgia",
    localidad: "Mar del Plata",
    zona: "mdp",
    sectorId: "industria",
    motivo: "Ganó licitación de provisión municipal",
    fuente: "Licitaciones MGP",
    alcanceLicitacion: "municipal",
    ramos: ["Caución", "ART"],
    scoreBase: 79,
    estado: "reunion",
    detectadoEl: haceDias(3),
  },
  {
    empresa: "Obras Viales Bonaerenses SRL",
    rubro: "Construcción vial",
    localidad: "La Plata",
    zona: "provincia",
    sectorId: "construccion",
    motivo: "Ganó licitación nacional de obra vial en la provincia",
    fuente: "CONTRAT.AR",
    alcanceLicitacion: "nacional",
    ramos: ["Caución", "Todo riesgo construcción", "ART"],
    scoreBase: 72,
    detectadoEl: haceDias(2),
  },
  {
    empresa: "Parrilla La Costanera",
    rubro: "Restaurante",
    localidad: "Mar del Plata",
    zona: "mdp",
    sectorId: "gastronomia",
    motivo: "Transferencia de fondo de comercio",
    descripcion:
      "Cambió de dueño. El nuevo titular tiene que rehacer los seguros del local y la ART del personal.",
    fuente: "Boletín Oficial",
    ramos: ["Integral de comercio", "ART"],
    scoreBase: 74,
    detectadoEl: haceDias(3),
  },
  {
    empresa: "Ferretería Industrial Batán",
    rubro: "Comercio minorista",
    localidad: "Batán",
    zona: "mdp",
    sectorId: "comercio",
    motivo: "Nueva habilitación comercial",
    fuente: "Habilitaciones MGP",
    ramos: ["Integral de comercio"],
    scoreBase: 63,
    estado: "cerrado",
    detectadoEl: haceDias(5),
  },
  {
    empresa: "Consultorio Odontológico Sur",
    rubro: "Salud",
    localidad: "Miramar",
    zona: "costa",
    sectorId: "salud",
    motivo: "Sociedad nueva de servicios odontológicos",
    fuente: "Boletín Oficial",
    ramos: ["RC profesional", "Integral"],
    scoreBase: 73,
    detectadoEl: haceDias(6),
  },
];

const AJUSTES_INICIALES = {
  zonas: { mdp: true, costa: true, provincia: true },
  licitaciones: { municipal: true, provincial: true, nacional: true },
};

export async function sembrar({ reset = false }: { reset?: boolean } = {}) {
  const filas = SECTORES.map((s) => ({ activo: true, principal: false, prioridad: "media" as const, ...s }));

  if (reset) {
    await db
      .insert(sectores)
      .values(filas)
      .onConflictDoUpdate({
        target: sectores.id,
        set: {
          activo: sql`excluded.activo`,
          prioridad: sql`excluded.prioridad`,
          principal: sql`excluded.principal`,
        },
      });
    await db
      .insert(ajustes)
      .values({ id: 1, ...AJUSTES_INICIALES })
      .onConflictDoUpdate({ target: ajustes.id, set: AJUSTES_INICIALES });
  } else {
    await db.insert(sectores).values(filas).onConflictDoNothing({ target: sectores.id });
    await db
      .insert(ajustes)
      .values({ id: 1, ...AJUSTES_INICIALES })
      .onConflictDoNothing({ target: ajustes.id });
  }

  await db.delete(leads).where(eq(leads.esEjemplo, true));
  await db.insert(leads).values(
    EJEMPLOS.map((l) => ({
      ...l,
      esEjemplo: true,
      // En los ejemplos el evento ocurrió el mismo día en que se detectó.
      fechaEvento: diaEnArgentina(l.detectadoEl as Date),
    })),
  );

  console.log(
    `Listo: ${SECTORES.length} sectores y ${EJEMPLOS.length} leads de ejemplo` +
      (reset ? " (configuración reiniciada)." : "."),
  );
}
