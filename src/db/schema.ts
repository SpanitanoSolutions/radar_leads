import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
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

export type Productor = { nombre: string; matricula: string };

/** Un dato de la póliza que trae la cartera de la compañía y no tiene columna propia ("Anualidad": "14"). */
export type DatoCompania = { etiqueta: string; valor: string };

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

/**
 * Una sola fila (id = 1) con las preferencias de zona y alcance de licitaciones,
 * y los datos de los productores ("Mi cuenta"): el primero se muestra en la
 * barra superior y firma los mensajes.
 */
export const ajustes = pgTable("ajustes", {
  id: integer("id").primaryKey().default(1),
  zonas: jsonb("zonas").$type<Record<Zona, boolean>>().notNull(),
  licitaciones: jsonb("licitaciones")
    .$type<Record<AlcanceLicitacion, boolean>>()
    .notNull(),
  productorNombre: text("productor_nombre"),
  productorMatricula: text("productor_matricula"),
  productores: jsonb("productores").$type<Productor[]>().notNull().default([]),
  productorOrganizacion: text("productor_organizacion").default("HR Productores"),
  productorLogo: text("productor_logo"),
  productorTelefono: text("productor_telefono"),
  productorEmail: text("productor_email"),
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
  /** Primera vez que el productor contactó (o intentó contactar) a la empresa. */
  contactadoEl: timestamp("contactado_el", { withTimezone: true }),
  reunionEl: timestamp("reunion_el", { withTimezone: true }),
  cerradoEl: timestamp("cerrado_el", { withTimezone: true }),
  /** Al cerrar: qué se vendió y cuánto (aproximado, en pesos). */
  cierreRamos: text("cierre_ramos").array(),
  cierrePrima: integer("cierre_prima"),
  cierreComision: integer("cierre_comision"),
  /** Al descartar: por qué (ver MOTIVOS_DESCARTE en src/lib/cierre.ts). */
  motivoDescarte: text("motivo_descarte"),
  telefono: text("telefono"),
  /** Página donde la empresa publica ese teléfono. */
  telefonoFuente: text("telefono_fuente"),
  /** Cuándo se buscó el teléfono (aunque no se haya encontrado): no se vuelve a buscar. */
  telefonoBuscadoEl: timestamp("telefono_buscado_el", { withTimezone: true }),
  /**
   * Google Maps: solo el place ID se puede guardar (términos de Places API);
   * teléfono, web y dirección se piden al mostrar la ficha.
   */
  placeId: text("place_id"),
  /** "verificado", "posible" o "sin-resultado" (se buscó y no hubo coincidencia). */
  contactoEstado: text("contacto_estado"),
  contactoBuscadoEl: timestamp("contacto_buscado_el", { withTimezone: true }),
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

/**
 * Cartera vieja (una fila por póliza, tal como se subía en /cartera). Sin uso
 * desde la migración 0010: sus datos pasaron a asegurados y pólizas. Se deja
 * para poder verificar la migración; no se borra en esta rama.
 */
export const cartera = pgTable("cartera", {
  id: serial("id").primaryKey(),
  cliente: text("cliente").notNull(),
  cuit: text("cuit"),
  ramos: text("ramos").array().notNull(),
  compania: text("compania"),
  vencimiento: date("vencimiento", { mode: "string" }),
  cargadoEl: timestamp("cargado_el", { withTimezone: true }).notNull().defaultNow(),
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

// ---------- Cartera: asegurados, pólizas y cuotas ----------
// Todo esto tiene datos de personas: se usa solo dentro de la app, detrás del
// login, y no se manda a servicios externos ni se escribe en los logs.

/** Bytes de un archivo subido (comprobantes, documentos). Se guardan en la base. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Montos en pesos, con centavos. */
const pesos = (nombre: string) => numeric(nombre, { precision: 14, scale: 2, mode: "number" });

export const tipoAseguradoEnum = pgEnum("tipo_asegurado", ["persona", "empresa"]);
export const estadoCuotaEnum = pgEnum("estado_cuota", ["pendiente", "pagada", "vencida"]);
export const canalComprobanteEnum = pgEnum("canal_comprobante", ["whatsapp", "email", "manual"]);
export const estadoComprobanteEnum = pgEnum("estado_comprobante", ["por_revisar", "confirmado", "rechazado"]);
export const estadoSeguimientoEnum = pgEnum("estado_seguimiento", ["activo", "pausado", "terminado"]);
export const canalMensajeEnum = pgEnum("canal_mensaje", ["whatsapp", "email", "llamada"]);
export const estadoMensajeEnum = pgEnum("estado_mensaje", ["borrador", "aprobado", "enviado", "omitido", "hecho"]);
export const etapaSiniestroEnum = pgEnum("etapa_siniestro", [
  "aviso",
  "documentacion",
  "compania",
  "inspeccion",
  "liquidacion",
  "pago",
]);
export const estadoSolicitudEnum = pgEnum("estado_solicitud", [
  "atencion",
  "esperando",
  "lista",
  "enviada",
  "ganada",
  "perdida",
]);
export const origenSolicitudEnum = pgEnum("origen_solicitud", ["whatsapp", "email", "manual"]);
export const estadoConexionEnum = pgEnum("estado_conexion", ["conectado", "sin_conectar", "en_proceso", "por_email"]);

export type TipoAsegurado = (typeof tipoAseguradoEnum.enumValues)[number];
export type EstadoCuota = (typeof estadoCuotaEnum.enumValues)[number];
export type CanalComprobante = (typeof canalComprobanteEnum.enumValues)[number];
export type EstadoComprobante = (typeof estadoComprobanteEnum.enumValues)[number];
export type EstadoSeguimiento = (typeof estadoSeguimientoEnum.enumValues)[number];
export type CanalMensaje = (typeof canalMensajeEnum.enumValues)[number];
export type EstadoMensaje = (typeof estadoMensajeEnum.enumValues)[number];
export type EtapaSiniestro = (typeof etapaSiniestroEnum.enumValues)[number];
export type EstadoSolicitud = (typeof estadoSolicitudEnum.enumValues)[number];
export type OrigenSolicitud = (typeof origenSolicitudEnum.enumValues)[number];
export type EstadoConexion = (typeof estadoConexionEnum.enumValues)[number];

/** Cada vez que se importó una planilla de cartera (alimenta "Última importación"). */
export const importaciones = pgTable("importaciones", {
  id: serial("id").primaryKey(),
  archivo: text("archivo").notNull(),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  /** "combinar" o "reemplazar". */
  modo: text("modo").notNull().default("combinar"),
  filas: integer("filas").notNull().default(0),
  errores: integer("errores").notNull().default(0),
  advertencias: integer("advertencias").notNull().default(0),
  /** Asegurados y pólizas nuevos y actualizados, y los primeros avisos. */
  resumen: jsonb("resumen").$type<ResumenImportacion>(),
  esEjemplo: boolean("es_ejemplo").notNull().default(false),
});

export type ResumenImportacion = {
  aseguradosNuevos: number;
  aseguradosActualizados: number;
  polizasNuevas: number;
  polizasActualizadas: number;
  dadosDeBaja?: number;
  avisos?: string[];
};

export const asegurados = pgTable(
  "asegurados",
  {
    id: serial("id").primaryKey(),
    tipo: tipoAseguradoEnum("tipo").notNull(),
    /** "Apellido, Nombre" para personas; razón social para empresas. */
    nombre: text("nombre").notNull(),
    /** DNI, CUIL o CUIT tal como se muestra ("30-71588214-6"). */
    documento: text("documento"),
    /** Solo los dígitos del documento: para combinar importaciones y reconocer leads. */
    documentoDigitos: text("documento_digitos"),
    localidad: text("localidad"),
    telefono: text("telefono"),
    email: text("email"),
    domicilio: text("domicilio"),
    codigoPostal: text("codigo_postal"),
    /** Para cotizar (las compañías tarifan por edad) y para saludar en el cumpleaños. */
    fechaNacimiento: date("fecha_nacimiento", { mode: "string" }),
    /** Empresas: a quién escribirle por pagos y vencimientos. */
    contactoNombre: text("contacto_nombre"),
    contactoTelefono: text("contacto_telefono"),
    contactoEmail: text("contacto_email"),
    /** Año desde el que es cliente. */
    clienteDesde: integer("cliente_desde"),
    notas: text("notas"),
    esEjemplo: boolean("es_ejemplo").notNull().default(false),
    importacionId: integer("importacion_id").references(() => importaciones.id, { onDelete: "set null" }),
    /** Al reemplazar la cartera, los que no vienen en la planilla se dan de baja (no se borran). */
    bajaEl: timestamp("baja_el", { withTimezone: true }),
    creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("asegurados_documento_idx").on(t.documentoDigitos)],
);

export const polizas = pgTable(
  "polizas",
  {
    id: serial("id").primaryKey(),
    aseguradoId: integer("asegurado_id")
      .notNull()
      .references(() => asegurados.id, { onDelete: "cascade" }),
    ramo: text("ramo").notNull(),
    compania: text("compania"),
    numero: text("numero"),
    /** Qué se asegura: "Peugeot 208 · AF 221 QR", "22 empleados", "Casa, Miramar". */
    bien: text("bien"),
    cobertura: text("cobertura"),
    /** Plan o producto de la compañía: "POLIZA MAS", "864". */
    producto: text("producto"),
    vigenciaDesde: date("vigencia_desde", { mode: "string" }),
    vigenciaHasta: date("vigencia_hasta", { mode: "string" }),
    /** Prima anual en pesos (sin impuestos: sobre ella se calcula la comisión). */
    prima: pesos("prima"),
    /** Premio anual en pesos: la prima con impuestos y recargos, lo que paga el cliente. */
    premio: pesos("premio"),
    /** Suma asegurada en pesos, como la informa la compañía. */
    sumaAsegurada: pesos("suma_asegurada"),
    /** Lo demás que informa la compañía en la cartera, tal como viene: anualidad, siniestros, productor. */
    datosCompania: jsonb("datos_compania").$type<DatoCompania[]>(),
    cantidadCuotas: integer("cantidad_cuotas").notNull().default(12),
    formaPago: text("forma_pago"),
    /** Año de la última actualización de la suma asegurada (para avisar si quedó corta). */
    sumaActualizadaAnio: integer("suma_actualizada_anio"),
    importacionId: integer("importacion_id").references(() => importaciones.id, { onDelete: "set null" }),
    bajaEl: timestamp("baja_el", { withTimezone: true }),
    creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("polizas_asegurado_idx").on(t.aseguradoId), index("polizas_vence_idx").on(t.vigenciaHasta)],
);

export const cuotas = pgTable(
  "cuotas",
  {
    id: serial("id").primaryKey(),
    polizaId: integer("poliza_id")
      .notNull()
      .references(() => polizas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    monto: pesos("monto").notNull(),
    vencimiento: date("vencimiento", { mode: "string" }).notNull(),
    estado: estadoCuotaEnum("estado").notNull().default("pendiente"),
    pagadaEl: timestamp("pagada_el", { withTimezone: true }),
    /** "Débito automático", "Transferencia", "Comprobante por email"… */
    medioPago: text("medio_pago"),
  },
  (t) => [uniqueIndex("cuotas_poliza_numero_idx").on(t.polizaId, t.numero), index("cuotas_vence_idx").on(t.vencimiento)],
);

/** Archivos subidos (comprobantes, documentos de la ficha, documentación de siniestros). */
export const archivos = pgTable("archivos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  tamano: integer("tamano").notNull(),
  contenido: bytea("contenido").notNull(),
  subidoEl: timestamp("subido_el", { withTimezone: true }).notNull().defaultNow(),
});

export type Chequeo = {
  id: "monto" | "destino" | "fecha" | "operacion";
  resultado: "ok" | "mal" | "duda";
  texto: string;
};

/** Comprobante de pago que mandó un asegurado, con lo que encontró el validador. */
export const comprobantes = pgTable("comprobantes", {
  id: serial("id").primaryKey(),
  /** Primera cuota del cobro (las cuotas del mismo asegurado, compañía y vencimiento se cobran juntas). */
  cuotaId: integer("cuota_id")
    .notNull()
    .references(() => cuotas.id, { onDelete: "cascade" }),
  canal: canalComprobanteEnum("canal").notNull(),
  /** "Transferencia · Banco Nación", "Rapipago"… */
  medio: text("medio"),
  fecha: timestamp("fecha", { withTimezone: true }),
  monto: pesos("monto"),
  /** A quién se pagó: titular de la cuenta o código de pago. */
  destino: text("destino"),
  numeroOperacion: text("numero_operacion"),
  archivoId: integer("archivo_id").references(() => archivos.id, { onDelete: "set null" }),
  chequeos: jsonb("chequeos").$type<Chequeo[]>().notNull().default([]),
  estado: estadoComprobanteEnum("estado").notNull().default("por_revisar"),
  recibidoEl: timestamp("recibido_el", { withTimezone: true }).notNull().defaultNow(),
  revisadoEl: timestamp("revisado_el", { withTimezone: true }),
});

/** Dónde está cada cobro en la secuencia de cobranza. */
export const seguimientosCobranza = pgTable("seguimientos_cobranza", {
  id: serial("id").primaryKey(),
  cuotaId: integer("cuota_id")
    .notNull()
    .unique()
    .references(() => cuotas.id, { onDelete: "cascade" }),
  /** Último paso de la secuencia que se cumplió (0: todavía ninguno). */
  paso: integer("paso").notNull().default(0),
  estado: estadoSeguimientoEnum("estado").notNull().default("activo"),
  motivoPausa: text("motivo_pausa"),
  promesaPagoEl: date("promesa_pago_el", { mode: "string" }),
  /** Lo último que pasó, para la tabla de seguimiento ("Leído, sin respuesta"). */
  ultimaNovedad: text("ultima_novedad"),
  ultimaNovedadEl: timestamp("ultima_novedad_el", { withTimezone: true }),
  /** Por dónde fue el último contacto ("WhatsApp", "Detectado por el Validador"). */
  ultimoContacto: text("ultimo_contacto"),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mensajes que preparan los agentes. Nada sale sin aprobación salvo los pasos
 * marcados como automáticos en configuracion_agentes. Las llamadas son tareas
 * para el productor y se registran acá con canal "llamada".
 */
export const mensajes = pgTable(
  "mensajes",
  {
    id: serial("id").primaryKey(),
    aseguradoId: integer("asegurado_id").references(() => asegurados.id, { onDelete: "set null" }),
    canal: canalMensajeEnum("canal").notNull(),
    /** Número, email o nombre del destinatario, como se muestra. */
    destinatario: text("destinatario"),
    asunto: text("asunto"),
    texto: text("texto").notNull(),
    estado: estadoMensajeEnum("estado").notNull().default("borrador"),
    /** cobranza, validador, siniestros, conciliador, cotizacion o cartera. */
    agente: text("agente").notNull(),
    /** "Por qué ahora": lo que lleva al agente a proponer este mensaje. */
    motivo: text("motivo"),
    /** Etiqueta corta del paso ("Paso 2 · Vence en 2 días"). */
    etiqueta: text("etiqueta"),
    /** A qué se refiere: "cuota:12", "siniestro:3", "conciliacion:2026-09:Sancor". */
    referencia: text("referencia"),
    /** Pospuesto: no aparece para aprobar hasta este día. */
    mostrarDesde: date("mostrar_desde", { mode: "string" }),
    esEjemplo: boolean("es_ejemplo").notNull().default(false),
    creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
    enviadoEl: timestamp("enviado_el", { withTimezone: true }),
  },
  (t) => [index("mensajes_estado_idx").on(t.estado, t.agente), index("mensajes_referencia_idx").on(t.referencia)],
);

/** Notas y actividad de la ficha del asegurado. */
export const notasAsegurado = pgTable("notas_asegurado", {
  id: serial("id").primaryKey(),
  aseguradoId: integer("asegurado_id")
    .notNull()
    .references(() => asegurados.id, { onDelete: "cascade" }),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  texto: text("texto").notNull(),
  /** "nota" la escribió el productor; "sistema" la dejó la app (importación, siniestro…). */
  tipo: text("tipo").notNull().default("nota"),
});

export const documentosAsegurado = pgTable("documentos_asegurado", {
  id: serial("id").primaryKey(),
  aseguradoId: integer("asegurado_id")
    .notNull()
    .references(() => asegurados.id, { onDelete: "cascade" }),
  archivoId: integer("archivo_id")
    .notNull()
    .references(() => archivos.id, { onDelete: "cascade" }),
  subidoEl: timestamp("subido_el", { withTimezone: true }).notNull().defaultNow(),
});

/** Oportunidades de mejora que el productor agregó a seguimiento ("Agregar a seguimiento"). */
export const oportunidadesSeguimiento = pgTable(
  "oportunidades_seguimiento",
  {
    id: serial("id").primaryKey(),
    aseguradoId: integer("asegurado_id")
      .notNull()
      .references(() => asegurados.id, { onDelete: "cascade" }),
    /** Clave de la regla y la póliza ("suma:12", "hogar"): ver src/lib/oportunidades.ts. */
    clave: text("clave").notNull(),
    creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("oportunidades_seguimiento_idx").on(t.aseguradoId, t.clave)],
);

// ---------- Siniestros ----------

export type CampoDenuncia = { campo: string; valor: string };

export const siniestros = pgTable("siniestros", {
  id: serial("id").primaryKey(),
  polizaId: integer("poliza_id")
    .notNull()
    .references(() => polizas.id, { onDelete: "cascade" }),
  /** Clase para las reglas de documentación: choque_tercero, agua, robo, cristales, granizo, carga, otro. */
  tipo: text("tipo").notNull(),
  /** Cómo se muestra: "Daños por agua (filtración del techo)". */
  descripcion: text("descripcion").notNull(),
  fecha: timestamp("fecha", { withTimezone: true }).notNull(),
  lugar: text("lugar"),
  relato: text("relato"),
  numeroCompania: text("numero_compania"),
  etapa: etapaSiniestroEnum("etapa").notNull().default("aviso"),
  /** Quién y por dónde avisó ("Carolina por WhatsApp"). */
  avisoDe: text("aviso_de"),
  /** Borrador de la denuncia que armó el agente (vacío si no hace falta). */
  denuncia: jsonb("denuncia").$type<CampoDenuncia[]>(),
  denunciaEnviadaEl: timestamp("denuncia_enviada_el", { withTimezone: true }),
  /** Última vez que la compañía dio una novedad: si pasan 14 días, se propone reclamar. */
  ultimaNovedadCompaniaEl: timestamp("ultima_novedad_compania_el", { withTimezone: true }),
  reclamoEnviadoEl: timestamp("reclamo_enviado_el", { withTimezone: true }),
  recordatorioEnviadoEl: timestamp("recordatorio_enviado_el", { withTimezone: true }),
  inspeccionEl: timestamp("inspeccion_el", { withTimezone: true }),
  montoAprobado: pesos("monto_aprobado"),
  montoPagado: pesos("monto_pagado"),
  pagadoEl: timestamp("pagado_el", { withTimezone: true }),
  cerrado: boolean("cerrado").notNull().default(false),
  cerradoEl: timestamp("cerrado_el", { withTimezone: true }),
  /** Cómo terminó, para la lista de cerrados ("parabrisas reemplazado"). */
  resolucion: text("resolucion"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
});

export const siniestroDocumentos = pgTable("siniestro_documentos", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id")
    .notNull()
    .references(() => siniestros.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  recibido: boolean("recibido").notNull().default(false),
  /** Para fotos: cuántas llegaron. */
  cantidad: integer("cantidad"),
  archivoId: integer("archivo_id").references(() => archivos.id, { onDelete: "set null" }),
  recibidoEl: timestamp("recibido_el", { withTimezone: true }),
});

export const siniestroEventos = pgTable("siniestro_eventos", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id")
    .notNull()
    .references(() => siniestros.id, { onDelete: "cascade" }),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  /** "Vos", "Agente", "Sancor", "Carolina por WhatsApp". */
  quien: text("quien").notNull(),
  texto: text("texto").notNull(),
});

// ---------- Cotización ----------

export type CotizacionRecibida = {
  compania: string;
  /** Precio anual; null si la compañía todavía no respondió o no cotiza. */
  precio: number | null;
  recibidaEl?: string;
  observacion?: string;
  /** Canal por el que se incorporó el resultado. */
  origen?: "portal" | "manual";
  estado?: "pendiente" | "enviada" | "recibida" | "error";
  referencia?: string;
  error?: string;
};

export const solicitudesCotizacion = pgTable("solicitudes_cotizacion", {
  id: serial("id").primaryKey(),
  /** Número visible (1042). */
  numero: integer("numero").notNull().unique(),
  aseguradoId: integer("asegurado_id").references(() => asegurados.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  /** Nombre para mostrar aunque se borre el asegurado o el lead. */
  cliente: text("cliente").notNull(),
  /** renovacion, mejora o nueva. */
  tipo: text("tipo").notNull(),
  ramo: text("ramo").notNull(),
  bien: text("bien"),
  /** Por qué se cotiza: "Vence en 12 días", "Subir a terceros completo". */
  motivo: text("motivo"),
  origen: origenSolicitudEnum("origen").notNull(),
  estado: estadoSolicitudEnum("estado").notNull().default("esperando"),
  /** Detalle del estado: "Falta Sancor", "Falta una patente". */
  nota: text("nota"),
  companias: text("companias").array().notNull(),
  cotizaciones: jsonb("cotizaciones").$type<CotizacionRecibida[]>().notNull().default([]),
  esEjemplo: boolean("es_ejemplo").notNull().default(false),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

/** Bitácora de lo que hizo cada agente. */
export const actividadAgentes = pgTable(
  "actividad_agentes",
  {
    id: serial("id").primaryKey(),
    agente: text("agente").notNull(),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
    texto: text("texto").notNull(),
    referencia: text("referencia"),
    esEjemplo: boolean("es_ejemplo").notNull().default(false),
  },
  (t) => [index("actividad_agente_idx").on(t.agente, t.fecha)],
);

// ---------- Conciliación de comisiones ----------

export type Retenciones = { iibb?: number; ganancias?: number; otras?: number };

export const liquidacionesComision = pgTable(
  "liquidaciones_comision",
  {
    id: serial("id").primaryKey(),
    compania: text("compania").notNull(),
    /** "2026-09". */
    periodo: text("periodo").notNull(),
    recibidaEl: date("recibida_el", { mode: "string" }),
    /** portal, email o archivo. */
    origen: text("origen").notNull().default("archivo"),
    montoLiquidado: pesos("monto_liquidado").notNull(),
    depositado: pesos("depositado"),
    depositadoEl: date("depositado_el", { mode: "string" }),
    retenciones: jsonb("retenciones").$type<Retenciones>(),
    esEjemplo: boolean("es_ejemplo").notNull().default(false),
    creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("liquidaciones_compania_periodo_idx").on(t.compania, t.periodo)],
);

export const liquidacionItems = pgTable("liquidacion_items", {
  id: serial("id").primaryKey(),
  liquidacionId: integer("liquidacion_id")
    .notNull()
    .references(() => liquidacionesComision.id, { onDelete: "cascade" }),
  polizaNumero: text("poliza_numero").notNull(),
  polizaId: integer("poliza_id").references(() => polizas.id, { onDelete: "set null" }),
  cuotaNumero: integer("cuota_numero"),
  /** Prima cobrada sobre la que se calcula la comisión. */
  base: pesos("base"),
  /** Porcentaje liquidado (12 = 12 %). */
  porcentaje: numeric("porcentaje", { precision: 5, scale: 2, mode: "number" }),
  comision: pesos("comision").notNull(),
});

export const acuerdosComision = pgTable(
  "acuerdos_comision",
  {
    id: serial("id").primaryKey(),
    compania: text("compania").notNull(),
    ramo: text("ramo").notNull(),
    porcentaje: numeric("porcentaje", { precision: 5, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("acuerdos_compania_ramo_idx").on(t.compania, t.ramo)],
);

// ---------- Compañías, conexiones y configuración de los agentes ----------

export type CuentaCompania = { titular: string; banco?: string; alias?: string; cbu?: string };

/** Datos de cada compañía que usan las reglas (cuentas para validar pagos, plazo de gracia, emails). */
export const companias = pgTable("companias", {
  nombre: text("nombre").primaryKey(),
  /** Cuentas y titulares a los que se le puede pagar. */
  cuentas: jsonb("cuentas").$type<CuentaCompania[]>().notNull().default([]),
  /** Días desde el vencimiento de la cuota hasta que puede suspender la cobertura. */
  diasGracia: integer("dias_gracia").notNull().default(30),
  /** Días que da para hacer la denuncia de un siniestro. */
  plazoDenunciaDias: integer("plazo_denuncia_dias").notNull().default(3),
  emailComisiones: text("email_comisiones"),
  emailSiniestros: text("email_siniestros"),
  emailCotizaciones: text("email_cotizaciones"),
  /** Cómo se le paga, para los mensajes ("transferencia o Rapipago"). */
  mediosPago: text("medios_pago"),
});

/**
 * Herramientas conectadas: whatsapp, email, mercadopago, banco, google_calendar
 * y portal de cada compañía ("portal:Mapfre"). Solo datos no secretos: las
 * claves reales van en variables de entorno.
 */
export const conexiones = pgTable("conexiones", {
  clave: text("clave").primaryKey(),
  tipo: text("tipo").notNull(),
  compania: text("compania"),
  estado: estadoConexionEnum("estado").notNull().default("sin_conectar"),
  /** Si falta, los agentes no pueden trabajar bien: cuenta en el aviso de Configuración. */
  requerida: boolean("requerida").notNull().default(false),
  datos: jsonb("datos").$type<Record<string, string | boolean | number | null>>().notNull().default({}),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

export type PasoCobranza = { paso: number; plantilla: string; automatico: boolean };
export type ConfigCobranza = {
  pasos: PasoCobranza[];
  reglas: { cortarAlConfirmar: boolean; horario: boolean; contactoAdministracion: boolean; avisarRespuestas: boolean };
};

/** Configuración de cada agente: si está listo para trabajar y sus reglas. */
export const configuracionAgentes = pgTable("configuracion_agentes", {
  agente: text("agente").primaryKey(),
  configurado: boolean("configurado").notNull().default(false),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

export type Sector = typeof sectores.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NuevoLead = typeof leads.$inferInsert;
export type Ajustes = typeof ajustes.$inferSelect;
export type Captura = typeof capturas.$inferSelect;
export type Asegurado = typeof asegurados.$inferSelect;
export type Poliza = typeof polizas.$inferSelect;
export type Cuota = typeof cuotas.$inferSelect;
export type Comprobante = typeof comprobantes.$inferSelect;
export type SeguimientoCobranza = typeof seguimientosCobranza.$inferSelect;
export type Mensaje = typeof mensajes.$inferSelect;
export type Siniestro = typeof siniestros.$inferSelect;
export type SiniestroDocumento = typeof siniestroDocumentos.$inferSelect;
export type SiniestroEvento = typeof siniestroEventos.$inferSelect;
export type SolicitudCotizacion = typeof solicitudesCotizacion.$inferSelect;
export type LiquidacionComision = typeof liquidacionesComision.$inferSelect;
export type LiquidacionItem = typeof liquidacionItems.$inferSelect;
export type AcuerdoComision = typeof acuerdosComision.$inferSelect;
export type Compania = typeof companias.$inferSelect;
export type Conexion = typeof conexiones.$inferSelect;
export type ConfiguracionAgente = typeof configuracionAgentes.$inferSelect;
export type Importacion = typeof importaciones.$inferSelect;
