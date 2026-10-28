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
export const canalCotizacionEnum = pgEnum("canal_cotizacion", ["correo", "portal", "ambos"]);
export const estadoEnvioCotizacionEnum = pgEnum("estado_envio_cotizacion", [
  "pendiente", "borrador", "enviado", "en_seguimiento", "requiere_atencion", "cotizado", "rechazado", "error",
]);
export const estadoBorradorCotizacionEnum = pgEnum("estado_borrador_cotizacion", ["pendiente", "aprobado", "omitido"]);
export const estadoContenidoIAEnum = pgEnum("estado_contenido_ia", ["borrador", "aprobado", "omitido"]);
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
  folio: text("folio"),
  polizaId: integer("poliza_id")
    .references(() => polizas.id, { onDelete: "set null" }),
  aseguradoId: integer("asegurado_id").references(() => asegurados.id, { onDelete: "set null" }),
  compania: text("compania"),
  ramo: text("ramo"),
  archivado: boolean("archivado").notNull().default(false),
  afectado: text("afectado"),
  orgId: text("org_id"),
  producerId: text("producer_id"),
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
  esEjemplo: boolean("es_ejemplo").notNull().default(false),
  cerradoEl: timestamp("cerrado_el", { withTimezone: true }),
  /** Cómo terminó, para la lista de cerrados ("parabrisas reemplazado"). */
  resolucion: text("resolucion"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("siniestros_folio_idx").on(t.folio), index("siniestros_estado_fecha_idx").on(t.cerrado, t.fecha)]);

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

/** Checklist de requisitos; se distingue de los archivos que subió el usuario. */
export const siniestroRequisitos = pgTable("siniestro_requisitos", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id")
    .notNull()
    .references(() => siniestros.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  recibido: boolean("recibido").notNull().default(false),
  cantidad: integer("cantidad"),
  archivoId: integer("archivo_id").references(() => archivos.id, { onDelete: "set null" }),
  recibidoEl: timestamp("recibido_el", { withTimezone: true }),
  origen: text("origen").notNull().default("plantilla"),
  modificacionManual: boolean("modificacion_manual").notNull().default(false),
  bloqueante: boolean("bloqueante").notNull().default(true),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("siniestro_requisitos_siniestro_idx").on(t.siniestroId)]);

/** Archivos físicos adjuntos al expediente; no contiene prompts ni salida del modelo. */
export const siniestroArchivos = pgTable("siniestro_archivos", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id")
    .notNull()
    .references(() => siniestros.id, { onDelete: "cascade" }),
  archivoId: integer("archivo_id")
    .notNull()
    .references(() => archivos.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  tipoMime: text("tipo_mime").notNull(),
  tamano: integer("tamano").notNull(),
  clasificacion: text("clasificacion"),
  estadoAnalisis: text("estado_analisis").notNull().default("pendiente_configuracion"),
  paginaCount: integer("pagina_count"),
  campos: jsonb("campos").$type<Record<string, unknown>[]>(),
  trabajoId: integer("trabajo_id").references(() => iaTrabajos.id, { onDelete: "set null" }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  subidoEl: timestamp("subido_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("siniestro_archivos_siniestro_idx").on(t.siniestroId)]);

/** Conversaciones del agente vinculadas al expediente. Las respuestas siempre requieren revisión humana. */
export const siniestroConversaciones = pgTable("siniestro_conversaciones", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id")
    .notNull()
    .references(() => siniestros.id, { onDelete: "cascade" }),
  numero: integer("numero"),
  rol: text("rol").notNull(),
  texto: text("texto").notNull(),
  citas: jsonb("citas").$type<{ archivo: string; pagina: number | null }[]>().notNull().default([]),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("siniestro_conversaciones_siniestro_idx").on(t.siniestroId, t.creadoEl)]);

/** Trabajos genéricos de los agentes IA, aún sin scheduler/modelo vinculado. */
export const iaTrabajos = pgTable("ia_trabajos", {
  id: serial("id").primaryKey(),
  agente: text("agente").notNull(),
  operacion: text("operacion").notNull(),
  entidad: text("entidad").notNull(),
  entidadId: integer("entidad_id").notNull(),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  estado: text("estado").notNull().default("pendiente"),
  intentos: integer("intentos").notNull().default(0),
  progreso: integer("progreso").notNull().default(0),
  datos: jsonb("datos").$type<Record<string, unknown>>().notNull().default({}),
  errorSeguro: text("error_seguro"),
  ejecutarDespuesDe: timestamp("ejecutar_despues_de", { withTimezone: true }).notNull().defaultNow(),
  iniciadoEl: timestamp("iniciado_el", { withTimezone: true }),
  terminadoEl: timestamp("terminado_el", { withTimezone: true }),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ia_trabajos_pendientes_idx").on(t.estado, t.ejecutarDespuesDe), index("ia_trabajos_entidad_idx").on(t.agente, t.entidad, t.entidadId)]);

/** Métricas de uso sin prompts ni contenido de expedientes. */
export const iaUso = pgTable("ia_uso", {
  id: serial("id").primaryKey(),
  agente: text("agente").notNull(),
  operacion: text("operacion").notNull(),
  proveedor: text("proveedor"),
  modelo: text("modelo"),
  tokensEntrada: integer("tokens_entrada"),
  tokensSalida: integer("tokens_salida"),
  costoUsd: numeric("costo_usd", { precision: 12, scale: 6, mode: "number" }),
  duracionMs: integer("duracion_ms"),
  resultado: text("resultado").notNull(),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ia_uso_agente_fecha_idx").on(t.agente, t.creadoEl), index("ia_uso_org_fecha_idx").on(t.orgId, t.creadoEl)]);

/** Selección futura de proveedor/modelo y topes para cada operación del agente. */
export const iaConfiguracion = pgTable("ia_configuracion", {
  id: serial("id").primaryKey(),
  agente: text("agente").notNull(),
  operacion: text("operacion").notNull(),
  proveedor: text("proveedor"),
  modelo: text("modelo"),
  activa: boolean("activa").notNull().default(false),
  limiteCostoUsd: numeric("limite_costo_usd", { precision: 12, scale: 6, mode: "number" }),
  limiteTokensMes: integer("limite_tokens_mes"),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ia_configuracion_agente_idx").on(t.agente, t.operacion, t.orgId, t.producerId)]);

/** Reglas operativas heredables por compañía, ramo y tipo de siniestro. */
export const siniestroConfiguracion = pgTable("siniestro_configuracion", {
  id: serial("id").primaryKey(),
  compania: text("compania").notNull(),
  ramo: text("ramo").notNull(),
  tipo: text("tipo").notNull(),
  requisitos: jsonb("requisitos").$type<{ nombre: string; bloqueante: boolean }[]>().notNull().default([]),
  ordenDossier: jsonb("orden_dossier").$type<string[]>().notNull().default([]),
  plazoAvisoDias: integer("plazo_aviso_dias"),
  diasSinNovedades: integer("dias_sin_novedades"),
  vozAgente: text("voz_agente"),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("siniestro_configuracion_compania_ramo_tipo_idx").on(t.compania, t.ramo, t.tipo), index("siniestro_configuracion_busqueda_idx").on(t.compania, t.ramo, t.tipo)]);

export const siniestroGastos = pgTable("siniestro_gastos", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id").notNull().references(() => siniestros.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: pesos("monto").notNull(),
  moneda: text("moneda").notNull().default("ARS"),
  fecha: date("fecha", { mode: "string" }).notNull(),
  comprobanteArchivoId: integer("comprobante_archivo_id").references(() => archivos.id, { onDelete: "set null" }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("siniestro_gastos_siniestro_idx").on(t.siniestroId, t.fecha)]);

/** Borradores de informes y certificados del expediente (excluye informes médicos). */
export const siniestroInformes = pgTable("siniestro_informes", {
  id: serial("id").primaryKey(),
  siniestroId: integer("siniestro_id").notNull().references(() => siniestros.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  estado: text("estado").notNull().default("borrador"),
  contenido: jsonb("contenido").$type<Record<string, unknown>>().notNull().default({}),
  archivoId: integer("archivo_id").references(() => archivos.id, { onDelete: "set null" }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  aprobadoEl: timestamp("aprobado_el", { withTimezone: true }),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("siniestro_informes_siniestro_idx").on(t.siniestroId, t.creadoEl)]);

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
  /** Datos del riesgo validados por ramo; no se incluyen en logs. */
  datosRiesgo: jsonb("datos_riesgo").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  ejecutivo: text("ejecutivo"),
  completadoEl: timestamp("completado_el", { withTimezone: true }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  esEjemplo: boolean("es_ejemplo").notNull().default(false),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

export type ContactoAseguradora = { nombre: string; email: string; rol?: string };
export type CoberturaPaquete = { nombre: string; valor?: string; incluida?: boolean };

/** Catálogo editable de compañías habilitadas para las solicitudes. */
export const cotizacionAseguradoras = pgTable("cotizacion_aseguradoras", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  ramos: text("ramos").array().notNull().default([]),
  canal: canalCotizacionEnum("canal").notNull().default("correo"),
  contactos: jsonb("contactos").$type<ContactoAseguradora[]>().notNull().default([]),
  codigoProductor: text("codigo_productor"),
  activa: boolean("activa").notNull().default(true),
  asunto: text("asunto"),
  instrucciones: text("instrucciones"),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

export const cotizacionPaquetes = pgTable("cotizacion_paquetes", {
  id: serial("id").primaryKey(),
  aseguradoraId: integer("aseguradora_id").notNull().references(() => cotizacionAseguradoras.id, { onDelete: "cascade" }),
  ramo: text("ramo").notNull(),
  nombre: text("nombre").notNull(),
  condiciones: text("condiciones"),
  deducible: text("deducible"),
  sumaAsegurada: numeric("suma_asegurada", { precision: 14, scale: 2, mode: "number" }),
  coberturas: jsonb("coberturas").$type<CoberturaPaquete[]>().notNull().default([]),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cotizacion_paquete_compania_ramo_nombre_idx").on(t.aseguradoraId, t.ramo, t.nombre)]);

export const cotizacionTiposSeguro = pgTable("cotizacion_tipos_seguro", {
  id: serial("id").primaryKey(),
  ramo: text("ramo").notNull().unique(),
  descripcion: text("descripcion").notNull().default(""),
  subTipos: text("sub_tipos").array().notNull().default([]),
  activo: boolean("activo").notNull().default(true),
  orgId: text("org_id"),
  producerId: text("producer_id"),
});

export const cotizacionConfig = pgTable("cotizacion_config", {
  id: serial("id").primaryKey(),
  persona: text("persona").notNull().default("Verónica"),
  nombreAgente: text("nombre_agente").notNull().default("Verónica"),
  personalidad: text("personalidad").notNull().default("Profesional, cortés y meticulosa."),
  intervaloHoras: integer("intervalo_horas").notNull().default(48),
  estrategiaSeguimiento: text("estrategia_seguimiento").notNull().default("Cada 3 días hábiles; si la aseguradora ya dio un folio, esperar la cotización."),
  maxSeguimientos: integer("max_seguimientos").notNull().default(3),
  paisFeriados: text("pais_feriados").notNull().default("AR"),
  idioma: text("idioma").notNull().default("es-AR"),
  plantillaAsunto: text("plantilla_asunto").notNull().default("SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]"),
  plantillaCuerpo: text("plantilla_cuerpo").notNull().default("Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}. Organización: {organizacion}. Moneda: {moneda}. Forma de pago: {forma_de_pago}."),
  instruccionesCuerpo: text("instrucciones_cuerpo").notNull().default(""),
  cuentaSaliente: text("cuenta_saliente"),
  cotizarAutomaticamente: boolean("cotizar_automaticamente").notNull().default(false),
  agenteActivo: boolean("agente_activo").notNull().default(false),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cotizacion_config_ambito_idx").on(t.orgId, t.producerId)]);

export const cotizacionEnvios = pgTable("cotizacion_envios", {
  id: serial("id").primaryKey(),
  solicitudId: integer("solicitud_id").notNull().references(() => solicitudesCotizacion.id, { onDelete: "cascade" }),
  aseguradoraId: integer("aseguradora_id").references(() => cotizacionAseguradoras.id, { onDelete: "set null" }),
  compania: text("compania").notNull(),
  paqueteId: integer("paquete_id").references(() => cotizacionPaquetes.id, { onDelete: "set null" }),
  canal: canalCotizacionEnum("canal").notNull().default("correo"),
  estado: estadoEnvioCotizacionEnum("estado").notNull().default("pendiente"),
  folio: text("folio"),
  proximoSeguimiento: timestamp("proximo_seguimiento", { withTimezone: true }),
  cantidadSeguimientos: integer("cantidad_seguimientos").notNull().default(0),
  preguntasPendientes: text("preguntas_pendientes"),
  ultimaActividad: timestamp("ultima_actividad", { withTimezone: true }).notNull().defaultNow(),
  asuntoBorrador: text("asunto_borrador"),
  cuerpoBorrador: text("cuerpo_borrador"),
  estadoBorrador: estadoBorradorCotizacionEnum("estado_borrador").notNull().default("pendiente"),
  aprobadoEl: timestamp("aprobado_el", { withTimezone: true }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cotizacion_envio_solicitud_compania_idx").on(t.solicitudId, t.compania)]);

export const cotizacionResultados = pgTable("cotizacion_resultados", {
  id: serial("id").primaryKey(),
  envioId: integer("envio_id").notNull().references(() => cotizacionEnvios.id, { onDelete: "cascade" }),
  primaNeta: numeric("prima_neta", { precision: 14, scale: 2, mode: "number" }),
  primaTotal: numeric("prima_total", { precision: 14, scale: 2, mode: "number" }).notNull(),
  gastos: numeric("gastos", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  impuestos: numeric("impuestos", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  moneda: text("moneda").notNull().default("ARS"),
  coberturas: jsonb("coberturas").$type<CoberturaPaquete[]>().notNull().default([]),
  condiciones: text("condiciones"),
  franquicia: text("franquicia"),
  sumaAsegurada: numeric("suma_asegurada", { precision: 14, scale: 2, mode: "number" }),
  vigencia: text("vigencia"),
  riesgoCotizado: jsonb("riesgo_cotizado").$type<Record<string, string>>().notNull().default({}),
  confirmado: boolean("confirmado").notNull().default(false),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  recibidoEl: timestamp("recibido_el", { withTimezone: true }).notNull().defaultNow(),
});

export const cotizacionArchivos = pgTable("cotizacion_archivos", {
  id: serial("id").primaryKey(),
  solicitudId: integer("solicitud_id").notNull().references(() => solicitudesCotizacion.id, { onDelete: "cascade" }),
  envioId: integer("envio_id").references(() => cotizacionEnvios.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  tamano: integer("tamano").notNull(),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
});

export const cotizacionPropuestas = pgTable("cotizacion_propuestas", {
  id: serial("id").primaryKey(),
  solicitudId: integer("solicitud_id").notNull().references(() => solicitudesCotizacion.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  bytes: bytea("bytes").notNull(),
  estado: text("estado").notNull().default("borrador"),
  aprobadoEl: timestamp("aprobado_el", { withTimezone: true }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
});

export const cotizacionEventos = pgTable("cotizacion_eventos", {
  id: serial("id").primaryKey(),
  solicitudId: integer("solicitud_id").notNull().references(() => solicitudesCotizacion.id, { onDelete: "cascade" }),
  envioId: integer("envio_id").references(() => cotizacionEnvios.id, { onDelete: "cascade" }),
  actor: text("actor").notNull().default("productor"),
  tipo: text("tipo").notNull(),
  detalle: text("detalle").notNull(),
  modelo: text("modelo"),
  tokensEntrada: integer("tokens_entrada"),
  tokensSalida: integer("tokens_salida"),
  costoUsd: numeric("costo_usd", { precision: 12, scale: 6, mode: "number" }),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("cotizacion_evento_solicitud_fecha_idx").on(t.solicitudId, t.fecha)]);

export const orgFeatures = pgTable("org_features", {
  id: serial("id").primaryKey(),
  orgId: text("org_id"),
  feature: text("feature").notNull(),
  activa: boolean("activa").notNull().default(false),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("org_features_org_feature_idx").on(t.orgId, t.feature)]);

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

/** Texto propuesto por IA: se conserva para revisión, nunca se envía automáticamente. */
export const cotizacionBorradoresIA = pgTable("cotizacion_borradores_ia", {
  id: serial("id").primaryKey(),
  solicitudId: integer("solicitud_id").notNull().references(() => solicitudesCotizacion.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  contenido: text("contenido").notNull(),
  modelo: text("modelo").notNull(),
  tokensEntrada: integer("tokens_entrada").notNull(),
  tokensSalida: integer("tokens_salida").notNull(),
  costoUsd: numeric("costo_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
  estado: estadoContenidoIAEnum("estado").notNull().default("borrador"),
  orgId: text("org_id"),
  producerId: text("producer_id"),
  creadoEl: timestamp("creado_el", { withTimezone: true }).notNull().defaultNow(),
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
export type CotizacionEnvio = typeof cotizacionEnvios.$inferSelect;
export type LiquidacionComision = typeof liquidacionesComision.$inferSelect;
export type LiquidacionItem = typeof liquidacionItems.$inferSelect;
export type AcuerdoComision = typeof acuerdosComision.$inferSelect;
export type Compania = typeof companias.$inferSelect;
export type Conexion = typeof conexiones.$inferSelect;
export type ConfiguracionAgente = typeof configuracionAgentes.$inferSelect;
export type Importacion = typeof importaciones.$inferSelect;
