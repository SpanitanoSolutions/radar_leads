CREATE TYPE "public"."canal_comprobante" AS ENUM('whatsapp', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."canal_mensaje" AS ENUM('whatsapp', 'email', 'llamada');--> statement-breakpoint
CREATE TYPE "public"."estado_comprobante" AS ENUM('por_revisar', 'confirmado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."estado_conexion" AS ENUM('conectado', 'sin_conectar', 'en_proceso', 'por_email');--> statement-breakpoint
CREATE TYPE "public"."estado_cuota" AS ENUM('pendiente', 'pagada', 'vencida');--> statement-breakpoint
CREATE TYPE "public"."estado_mensaje" AS ENUM('borrador', 'aprobado', 'enviado', 'omitido', 'hecho');--> statement-breakpoint
CREATE TYPE "public"."estado_seguimiento" AS ENUM('activo', 'pausado', 'terminado');--> statement-breakpoint
CREATE TYPE "public"."estado_solicitud" AS ENUM('atencion', 'esperando', 'lista', 'enviada', 'ganada', 'perdida');--> statement-breakpoint
CREATE TYPE "public"."etapa_siniestro" AS ENUM('aviso', 'documentacion', 'compania', 'inspeccion', 'liquidacion', 'pago');--> statement-breakpoint
CREATE TYPE "public"."origen_solicitud" AS ENUM('whatsapp', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tipo_asegurado" AS ENUM('persona', 'empresa');--> statement-breakpoint
CREATE TABLE "actividad_agentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"agente" text NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"texto" text NOT NULL,
	"referencia" text,
	"es_ejemplo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acuerdos_comision" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"ramo" text NOT NULL,
	"porcentaje" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "archivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"tamano" integer NOT NULL,
	"contenido" "bytea" NOT NULL,
	"subido_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asegurados" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_asegurado" NOT NULL,
	"nombre" text NOT NULL,
	"documento" text,
	"documento_digitos" text,
	"localidad" text,
	"telefono" text,
	"email" text,
	"domicilio" text,
	"contacto_nombre" text,
	"contacto_telefono" text,
	"contacto_email" text,
	"cliente_desde" integer,
	"notas" text,
	"es_ejemplo" boolean DEFAULT false NOT NULL,
	"importacion_id" integer,
	"baja_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companias" (
	"nombre" text PRIMARY KEY NOT NULL,
	"cuentas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dias_gracia" integer DEFAULT 30 NOT NULL,
	"plazo_denuncia_dias" integer DEFAULT 3 NOT NULL,
	"email_comisiones" text,
	"email_siniestros" text,
	"email_cotizaciones" text,
	"medios_pago" text
);
--> statement-breakpoint
CREATE TABLE "comprobantes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuota_id" integer NOT NULL,
	"canal" "canal_comprobante" NOT NULL,
	"medio" text,
	"fecha" timestamp with time zone,
	"monto" numeric(14, 2),
	"destino" text,
	"numero_operacion" text,
	"archivo_id" integer,
	"chequeos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" "estado_comprobante" DEFAULT 'por_revisar' NOT NULL,
	"recibido_el" timestamp with time zone DEFAULT now() NOT NULL,
	"revisado_el" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conexiones" (
	"clave" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"compania" text,
	"estado" "estado_conexion" DEFAULT 'sin_conectar' NOT NULL,
	"requerida" boolean DEFAULT false NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion_agentes" (
	"agente" text PRIMARY KEY NOT NULL,
	"configurado" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuotas" (
	"id" serial PRIMARY KEY NOT NULL,
	"poliza_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"vencimiento" date NOT NULL,
	"estado" "estado_cuota" DEFAULT 'pendiente' NOT NULL,
	"pagada_el" timestamp with time zone,
	"medio_pago" text
);
--> statement-breakpoint
CREATE TABLE "documentos_asegurado" (
	"id" serial PRIMARY KEY NOT NULL,
	"asegurado_id" integer NOT NULL,
	"archivo_id" integer NOT NULL,
	"subido_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"archivo" text NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"modo" text DEFAULT 'combinar' NOT NULL,
	"filas" integer DEFAULT 0 NOT NULL,
	"errores" integer DEFAULT 0 NOT NULL,
	"advertencias" integer DEFAULT 0 NOT NULL,
	"resumen" jsonb,
	"es_ejemplo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidacion_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"liquidacion_id" integer NOT NULL,
	"poliza_numero" text NOT NULL,
	"poliza_id" integer,
	"cuota_numero" integer,
	"base" numeric(14, 2),
	"porcentaje" numeric(5, 2),
	"comision" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidaciones_comision" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"periodo" text NOT NULL,
	"recibida_el" date,
	"origen" text DEFAULT 'archivo' NOT NULL,
	"monto_liquidado" numeric(14, 2) NOT NULL,
	"depositado" numeric(14, 2),
	"depositado_el" date,
	"retenciones" jsonb,
	"es_ejemplo" boolean DEFAULT false NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensajes" (
	"id" serial PRIMARY KEY NOT NULL,
	"asegurado_id" integer,
	"canal" "canal_mensaje" NOT NULL,
	"destinatario" text,
	"asunto" text,
	"texto" text NOT NULL,
	"estado" "estado_mensaje" DEFAULT 'borrador' NOT NULL,
	"agente" text NOT NULL,
	"motivo" text,
	"etiqueta" text,
	"referencia" text,
	"mostrar_desde" date,
	"es_ejemplo" boolean DEFAULT false NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_el" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notas_asegurado" (
	"id" serial PRIMARY KEY NOT NULL,
	"asegurado_id" integer NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"texto" text NOT NULL,
	"tipo" text DEFAULT 'nota' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oportunidades_seguimiento" (
	"id" serial PRIMARY KEY NOT NULL,
	"asegurado_id" integer NOT NULL,
	"clave" text NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polizas" (
	"id" serial PRIMARY KEY NOT NULL,
	"asegurado_id" integer NOT NULL,
	"ramo" text NOT NULL,
	"compania" text,
	"numero" text,
	"bien" text,
	"cobertura" text,
	"vigencia_desde" date,
	"vigencia_hasta" date,
	"prima" numeric(14, 2),
	"cantidad_cuotas" integer DEFAULT 12 NOT NULL,
	"forma_pago" text,
	"suma_actualizada_anio" integer,
	"importacion_id" integer,
	"baja_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seguimientos_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuota_id" integer NOT NULL,
	"paso" integer DEFAULT 0 NOT NULL,
	"estado" "estado_seguimiento" DEFAULT 'activo' NOT NULL,
	"motivo_pausa" text,
	"promesa_pago_el" date,
	"ultima_novedad" text,
	"ultima_novedad_el" timestamp with time zone,
	"ultimo_contacto" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seguimientos_cobranza_cuota_id_unique" UNIQUE("cuota_id")
);
--> statement-breakpoint
CREATE TABLE "siniestro_documentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"recibido" boolean DEFAULT false NOT NULL,
	"cantidad" integer,
	"archivo_id" integer,
	"recibido_el" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "siniestro_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"quien" text NOT NULL,
	"texto" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniestros" (
	"id" serial PRIMARY KEY NOT NULL,
	"poliza_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"fecha" timestamp with time zone NOT NULL,
	"lugar" text,
	"relato" text,
	"numero_compania" text,
	"etapa" "etapa_siniestro" DEFAULT 'aviso' NOT NULL,
	"aviso_de" text,
	"denuncia" jsonb,
	"denuncia_enviada_el" timestamp with time zone,
	"ultima_novedad_compania_el" timestamp with time zone,
	"reclamo_enviado_el" timestamp with time zone,
	"recordatorio_enviado_el" timestamp with time zone,
	"inspeccion_el" timestamp with time zone,
	"monto_aprobado" numeric(14, 2),
	"monto_pagado" numeric(14, 2),
	"pagado_el" timestamp with time zone,
	"cerrado" boolean DEFAULT false NOT NULL,
	"cerrado_el" timestamp with time zone,
	"resolucion" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitudes_cotizacion" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"asegurado_id" integer,
	"lead_id" integer,
	"cliente" text NOT NULL,
	"tipo" text NOT NULL,
	"ramo" text NOT NULL,
	"bien" text,
	"motivo" text,
	"origen" "origen_solicitud" NOT NULL,
	"estado" "estado_solicitud" DEFAULT 'esperando' NOT NULL,
	"nota" text,
	"companias" text[] NOT NULL,
	"cotizaciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"es_ejemplo" boolean DEFAULT false NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudes_cotizacion_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "asegurados" ADD CONSTRAINT "asegurados_importacion_id_importaciones_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."importaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_cuota_id_cuotas_id_fk" FOREIGN KEY ("cuota_id") REFERENCES "public"."cuotas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_poliza_id_polizas_id_fk" FOREIGN KEY ("poliza_id") REFERENCES "public"."polizas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_asegurado" ADD CONSTRAINT "documentos_asegurado_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_asegurado" ADD CONSTRAINT "documentos_asegurado_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_liquidacion_id_liquidaciones_comision_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."liquidaciones_comision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_poliza_id_polizas_id_fk" FOREIGN KEY ("poliza_id") REFERENCES "public"."polizas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_asegurado" ADD CONSTRAINT "notas_asegurado_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades_seguimiento" ADD CONSTRAINT "oportunidades_seguimiento_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polizas" ADD CONSTRAINT "polizas_importacion_id_importaciones_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."importaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos_cobranza" ADD CONSTRAINT "seguimientos_cobranza_cuota_id_cuotas_id_fk" FOREIGN KEY ("cuota_id") REFERENCES "public"."cuotas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_documentos" ADD CONSTRAINT "siniestro_documentos_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_documentos" ADD CONSTRAINT "siniestro_documentos_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_eventos" ADD CONSTRAINT "siniestro_eventos_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestros" ADD CONSTRAINT "siniestros_poliza_id_polizas_id_fk" FOREIGN KEY ("poliza_id") REFERENCES "public"."polizas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD CONSTRAINT "solicitudes_cotizacion_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividad_agente_idx" ON "actividad_agentes" USING btree ("agente","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "acuerdos_compania_ramo_idx" ON "acuerdos_comision" USING btree ("compania","ramo");--> statement-breakpoint
CREATE INDEX "asegurados_documento_idx" ON "asegurados" USING btree ("documento_digitos");--> statement-breakpoint
CREATE UNIQUE INDEX "cuotas_poliza_numero_idx" ON "cuotas" USING btree ("poliza_id","numero");--> statement-breakpoint
CREATE INDEX "cuotas_vence_idx" ON "cuotas" USING btree ("vencimiento");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidaciones_compania_periodo_idx" ON "liquidaciones_comision" USING btree ("compania","periodo");--> statement-breakpoint
CREATE INDEX "mensajes_estado_idx" ON "mensajes" USING btree ("estado","agente");--> statement-breakpoint
CREATE INDEX "mensajes_referencia_idx" ON "mensajes" USING btree ("referencia");--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidades_seguimiento_idx" ON "oportunidades_seguimiento" USING btree ("asegurado_id","clave");--> statement-breakpoint
CREATE INDEX "polizas_asegurado_idx" ON "polizas" USING btree ("asegurado_id");--> statement-breakpoint
CREATE INDEX "polizas_vence_idx" ON "polizas" USING btree ("vigencia_hasta");--> statement-breakpoint
-- La cartera vieja (una fila por cliente y vencimiento, con varios ramos) pasa
-- al modelo nuevo: un asegurado por cliente (por CUIT o, si no tiene, por
-- nombre) y una póliza por ramo. La tabla "cartera" queda sin usar y no se borra.
INSERT INTO "importaciones" ("archivo", "fecha", "modo", "filas", "resumen")
SELECT 'Cartera cargada antes de esta versión', max("cargado_el"), 'combinar', count(*),
  jsonb_build_object('aseguradosNuevos', 0, 'aseguradosActualizados', 0, 'polizasNuevas', 0, 'polizasActualizadas', 0)
FROM "cartera"
HAVING count(*) > 0;--> statement-breakpoint
INSERT INTO "asegurados" ("tipo", "nombre", "documento", "documento_digitos", "importacion_id", "creado_el")
SELECT
  CASE WHEN c.digitos ~ '^3[0034]' AND length(c.digitos) = 11 THEN 'empresa' ELSE 'persona' END::"tipo_asegurado",
  c.cliente, c.cuit, c.digitos, (SELECT max("id") FROM "importaciones"), c.cargado_el
FROM (
  SELECT DISTINCT ON (clave) clave, trim("cliente") AS cliente, nullif(trim("cuit"), '') AS cuit, digitos, "cargado_el" AS cargado_el
  FROM (
    SELECT *, nullif(regexp_replace(coalesce("cuit", ''), '\D', '', 'g'), '') AS digitos,
      coalesce(nullif(regexp_replace(coalesce("cuit", ''), '\D', '', 'g'), ''), lower(trim("cliente"))) AS clave
    FROM "cartera"
  ) filas
  ORDER BY clave, "id"
) c;--> statement-breakpoint
INSERT INTO "polizas" ("asegurado_id", "ramo", "compania", "vigencia_desde", "vigencia_hasta", "importacion_id", "creado_el")
SELECT a."id", trim(r.ramo), nullif(trim(c."compania"), ''),
  (c."vencimiento" - interval '1 year')::date, c."vencimiento", a."importacion_id", c."cargado_el"
FROM "cartera" c
CROSS JOIN LATERAL unnest(c."ramos") AS r(ramo)
JOIN "asegurados" a ON (
  a."documento_digitos" IS NOT NULL
  AND a."documento_digitos" = nullif(regexp_replace(coalesce(c."cuit", ''), '\D', '', 'g'), '')
) OR (
  a."documento_digitos" IS NULL
  AND nullif(regexp_replace(coalesce(c."cuit", ''), '\D', '', 'g'), '') IS NULL
  AND lower(a."nombre") = lower(trim(c."cliente"))
)
WHERE trim(r.ramo) <> '';--> statement-breakpoint
UPDATE "importaciones" i SET "resumen" = jsonb_build_object(
  'aseguradosNuevos', (SELECT count(*) FROM "asegurados" WHERE "importacion_id" = i."id"),
  'aseguradosActualizados', 0,
  'polizasNuevas', (SELECT count(*) FROM "polizas" WHERE "importacion_id" = i."id"),
  'polizasActualizadas', 0)
WHERE i."archivo" = 'Cartera cargada antes de esta versión';
