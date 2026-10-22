import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const prioridadEnum = pgEnum("prioridad", ["alta", "media", "baja"]);
export const estadoEnum = pgEnum("estado_lead", [
  "nuevo",
  "llamado",
  "reunion",
  "cerrado",
  "descartado",
]);
export const zonaEnum = pgEnum("zona", ["mdp", "costa", "provincia"]);
export const alcanceEnum = pgEnum("alcance_licitacion", [
  "municipal",
  "provincial",
  "nacional",
]);

export type Prioridad = (typeof prioridadEnum.enumValues)[number];
export type EstadoLead = (typeof estadoEnum.enumValues)[number];
export type Zona = (typeof zonaEnum.enumValues)[number];
export type AlcanceLicitacion = (typeof alcanceEnum.enumValues)[number];

export const sectores = pgTable("sectores", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  ejemplos: text("ejemplos").notNull(),
  ramosTipicos: text("ramos_tipicos").notNull(),
  principal: boolean("principal").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
  prioridad: prioridadEnum("prioridad").notNull().default("media"),
  orden: integer("orden").notNull().default(0),
});

/** Una sola fila (id = 1) con las preferencias de zona y alcance de licitaciones. */
export const ajustes = pgTable("ajustes", {
  id: integer("id").primaryKey().default(1),
  zonas: jsonb("zonas").$type<Record<Zona, boolean>>().notNull(),
  licitaciones: jsonb("licitaciones")
    .$type<Record<AlcanceLicitacion, boolean>>()
    .notNull(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  empresa: text("empresa").notNull(),
  cuit: text("cuit"),
  rubro: text("rubro").notNull(),
  localidad: text("localidad").notNull(),
  zona: zonaEnum("zona").notNull(),
  sectorId: text("sector_id")
    .notNull()
    .references(() => sectores.id),
  /** Resumen corto del evento que lo convierte en lead. */
  motivo: text("motivo").notNull(),
  /** Explicación más larga para la ficha. */
  descripcion: text("descripcion"),
  fuente: text("fuente").notNull(),
  fuenteUrl: text("fuente_url"),
  /** Cómo encontrar la publicación a mano (boletín, sección y página; número de proceso). */
  fuenteReferencia: text("fuente_referencia"),
  /** Solo para leads que vienen de una licitación. */
  alcanceLicitacion: alcanceEnum("alcance_licitacion"),
  ramos: text("ramos").array().notNull(),
  /** Score que asigna la fuente antes de aplicar la prioridad del sector. */
  scoreBase: integer("score_base").notNull(),
  /**
   * Texto con que se clasificó el lead (objeto social, objeto de la licitación),
   * sin datos de personas. Permite reclasificar si cambian las reglas.
   */
  textoClasificacion: text("texto_clasificacion"),
  /** Cuándo ocurrió el evento (adjudicación, publicación del edicto), no cuándo lo detectamos. */
  fechaEvento: date("fecha_evento", { mode: "string" }),
  estado: estadoEnum("estado").notNull().default("nuevo"),
  nota: text("nota"),
  recordatorio: date("recordatorio", { mode: "string" }),
  telefono: text("telefono"),
  /** Página donde la empresa publica ese teléfono. */
  telefonoFuente: text("telefono_fuente"),
  /** Cuándo se buscó el teléfono (aunque no se haya encontrado): no se vuelve a buscar. */
  telefonoBuscadoEl: timestamp("telefono_buscado_el", { withTimezone: true }),
  domicilio: text("domicilio"),
  artActual: text("art_actual"),
  deudaBcra: text("deuda_bcra"),
  esEjemplo: boolean("es_ejemplo").notNull().default(false),
  /**
   * Identifica el evento en su fuente (p. ej. "comprar:<proceso>:<cuit>") para
   * no cargar dos veces el mismo lead. Nulo en los leads de ejemplo.
   */
  clave: text("clave").unique(),
  detectadoEl: timestamp("detectado_el", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Última ejecución de cada fuente de captura y la versión de datos que procesó. */
export const capturas = pgTable("capturas", {
  fuente: text("fuente").primaryKey(),
  /** Marca de la última versión procesada (ETag del CSV, número de boletín…). */
  version: text("version"),
  ejecutadoEl: timestamp("ejecutado_el", { withTimezone: true }).notNull().defaultNow(),
  nuevos: integer("nuevos").notNull().default(0),
  error: text("error"),
});

export type Sector = typeof sectores.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NuevoLead = typeof leads.$inferInsert;
export type Ajustes = typeof ajustes.$inferSelect;
export type Captura = typeof capturas.$inferSelect;
