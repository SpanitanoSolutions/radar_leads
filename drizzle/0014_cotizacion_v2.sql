CREATE TYPE "public"."canal_cotizacion" AS ENUM('correo', 'portal', 'ambos');--> statement-breakpoint
CREATE TYPE "public"."estado_borrador_cotizacion" AS ENUM('pendiente', 'aprobado', 'omitido');--> statement-breakpoint
CREATE TYPE "public"."estado_envio_cotizacion" AS ENUM('pendiente', 'borrador', 'enviado', 'en_seguimiento', 'requiere_atencion', 'cotizado', 'rechazado', 'error');--> statement-breakpoint
CREATE TABLE "cotizacion_archivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"envio_id" integer,
	"nombre" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"tamano" integer NOT NULL,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_aseguradoras" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"ramos" text[] DEFAULT '{}' NOT NULL,
	"canal" "canal_cotizacion" DEFAULT 'correo' NOT NULL,
	"contactos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"codigo_productor" text,
	"activa" boolean DEFAULT true NOT NULL,
	"asunto" text,
	"instrucciones" text,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cotizacion_aseguradoras_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "cotizacion_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona" text DEFAULT 'Verónica' NOT NULL,
	"nombre_agente" text DEFAULT 'Verónica' NOT NULL,
	"personalidad" text DEFAULT 'Profesional, cortés y meticulosa.' NOT NULL,
	"intervalo_horas" integer DEFAULT 48 NOT NULL,
	"estrategia_seguimiento" text DEFAULT 'Cada 3 días hábiles; si la aseguradora ya dio un folio, esperar la cotización.' NOT NULL,
	"max_seguimientos" integer DEFAULT 3 NOT NULL,
	"pais_feriados" text DEFAULT 'AR' NOT NULL,
	"idioma" text DEFAULT 'es-AR' NOT NULL,
	"plantilla_asunto" text DEFAULT 'SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]' NOT NULL,
	"plantilla_cuerpo" text DEFAULT 'Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}. Organización: {organizacion}. Moneda: {moneda}. Forma de pago: {forma_de_pago}.' NOT NULL,
	"instrucciones_cuerpo" text DEFAULT '' NOT NULL,
	"cuenta_saliente" text,
	"cotizar_automaticamente" boolean DEFAULT false NOT NULL,
	"agente_activo" boolean DEFAULT false NOT NULL,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_envios" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"aseguradora_id" integer,
	"compania" text NOT NULL,
	"paquete_id" integer,
	"canal" "canal_cotizacion" DEFAULT 'correo' NOT NULL,
	"estado" "estado_envio_cotizacion" DEFAULT 'pendiente' NOT NULL,
	"folio" text,
	"proximo_seguimiento" timestamp with time zone,
	"cantidad_seguimientos" integer DEFAULT 0 NOT NULL,
	"preguntas_pendientes" text,
	"ultima_actividad" timestamp with time zone DEFAULT now() NOT NULL,
	"asunto_borrador" text,
	"cuerpo_borrador" text,
	"estado_borrador" "estado_borrador_cotizacion" DEFAULT 'pendiente' NOT NULL,
	"aprobado_el" timestamp with time zone,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"envio_id" integer,
	"actor" text DEFAULT 'productor' NOT NULL,
	"tipo" text NOT NULL,
	"detalle" text NOT NULL,
	"modelo" text,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_usd" numeric(12, 6),
	"org_id" text,
	"producer_id" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_paquetes" (
	"id" serial PRIMARY KEY NOT NULL,
	"aseguradora_id" integer NOT NULL,
	"ramo" text NOT NULL,
	"nombre" text NOT NULL,
	"condiciones" text,
	"deducible" text,
	"suma_asegurada" numeric(14, 2),
	"coberturas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_resultados" (
	"id" serial PRIMARY KEY NOT NULL,
	"envio_id" integer NOT NULL,
	"prima_neta" numeric(14, 2),
	"prima_total" numeric(14, 2) NOT NULL,
	"gastos" numeric(14, 2) DEFAULT 0 NOT NULL,
	"impuestos" numeric(14, 2) DEFAULT 0 NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"coberturas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"condiciones" text,
	"franquicia" text,
	"suma_asegurada" numeric(14, 2),
	"vigencia" text,
	"confirmado" boolean DEFAULT false NOT NULL,
	"org_id" text,
	"producer_id" text,
	"recibido_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_tipos_seguro" (
	"id" serial PRIMARY KEY NOT NULL,
	"ramo" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"sub_tipos" text[] DEFAULT '{}' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"org_id" text,
	"producer_id" text,
	CONSTRAINT "cotizacion_tipos_seguro_ramo_unique" UNIQUE("ramo")
);
--> statement-breakpoint
CREATE TABLE "org_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text,
	"feature" text NOT NULL,
	"activa" boolean DEFAULT false NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "datos_riesgo" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "ejecutivo" text;--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "completado_el" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "solicitudes_cotizacion" ADD COLUMN "producer_id" text;--> statement-breakpoint
ALTER TABLE "cotizacion_archivos" ADD CONSTRAINT "cotizacion_archivos_solicitud_id_solicitudes_cotizacion_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_cotizacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_archivos" ADD CONSTRAINT "cotizacion_archivos_envio_id_cotizacion_envios_id_fk" FOREIGN KEY ("envio_id") REFERENCES "public"."cotizacion_envios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD CONSTRAINT "cotizacion_envios_solicitud_id_solicitudes_cotizacion_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_cotizacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD CONSTRAINT "cotizacion_envios_aseguradora_id_cotizacion_aseguradoras_id_fk" FOREIGN KEY ("aseguradora_id") REFERENCES "public"."cotizacion_aseguradoras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD CONSTRAINT "cotizacion_envios_paquete_id_cotizacion_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."cotizacion_paquetes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_eventos" ADD CONSTRAINT "cotizacion_eventos_solicitud_id_solicitudes_cotizacion_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_cotizacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_eventos" ADD CONSTRAINT "cotizacion_eventos_envio_id_cotizacion_envios_id_fk" FOREIGN KEY ("envio_id") REFERENCES "public"."cotizacion_envios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_paquetes" ADD CONSTRAINT "cotizacion_paquetes_aseguradora_id_cotizacion_aseguradoras_id_fk" FOREIGN KEY ("aseguradora_id") REFERENCES "public"."cotizacion_aseguradoras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_resultados" ADD CONSTRAINT "cotizacion_resultados_envio_id_cotizacion_envios_id_fk" FOREIGN KEY ("envio_id") REFERENCES "public"."cotizacion_envios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cotizacion_config_ambito_idx" ON "cotizacion_config" USING btree ("org_id","producer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cotizacion_envio_solicitud_compania_idx" ON "cotizacion_envios" USING btree ("solicitud_id","compania");--> statement-breakpoint
CREATE INDEX "cotizacion_evento_solicitud_fecha_idx" ON "cotizacion_eventos" USING btree ("solicitud_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "cotizacion_paquete_compania_ramo_nombre_idx" ON "cotizacion_paquetes" USING btree ("aseguradora_id","ramo","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "org_features_org_feature_idx" ON "org_features" USING btree ("org_id","feature");
--> statement-breakpoint
INSERT INTO "cotizacion_aseguradoras" ("nombre", "ramos", "canal", "activa") VALUES
  ('Sancor', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','Incendio','RC','Caución','ART','AP','Vida','Salud'], 'ambos', true),
  ('La Segunda', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','Incendio','RC','Caución','ART','AP','Vida','Salud'], 'correo', true),
  ('Federación Patronal', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','Incendio','RC','Caución','ART','AP','Vida','Salud'], 'ambos', true),
  ('Seguros Rivadavia', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','Incendio','RC','Caución','ART','AP','Vida','Salud'], 'correo', true),
  ('San Cristóbal', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','Incendio','RC','Caución','ART','AP','Vida','Salud'], 'correo', true),
  ('Mercantil Andina', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','Incendio','RC','Caución','ART','AP','Vida','Salud'], 'ambos', true)
ON CONFLICT ("nombre") DO NOTHING;
--> statement-breakpoint
INSERT INTO "cotizacion_tipos_seguro" ("ramo", "descripcion", "sub_tipos") VALUES
  ('Automotor', 'Vehículos particulares y comerciales.', ARRAY['RC','Terceros completo (B1)','Terceros completo premium','Todo riesgo con franquicia']),
  ('Flotas', 'Vehículos de uso comercial o institucional.', ARRAY['Livianos','Pesados','Mixta']),
  ('Hogar', 'Hogar y combinado familiar.', ARRAY['Incendio','Robo','Integral']),
  ('Integral de comercio', 'Cobertura integral para locales comerciales.', ARRAY['Comercio','Consorcio']),
  ('Incendio', 'Daños por incendio y adicionales.', ARRAY['Edificio','Contenido']),
  ('RC', 'Responsabilidad civil.', ARRAY['General','Profesional','Transporte']),
  ('Caución', 'Garantías y cauciones.', ARRAY['Alquiler','Obra','Aduanera']),
  ('ART', 'Riesgos del trabajo.', ARRAY['Empleador']),
  ('AP', 'Accidentes personales.', ARRAY['Individual','Colectivo']),
  ('Vida', 'Seguros de vida.', ARRAY['Individual','Colectivo']),
  ('Salud', 'Salud y gastos médicos.', ARRAY['Salud','Accidentes personales'])
ON CONFLICT ("ramo") DO NOTHING;
--> statement-breakpoint
INSERT INTO "cotizacion_config" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "cotizacion_aseguradoras" ("nombre", "ramos", "canal", "activa") VALUES
  ('Sancor', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','ART','AP','Vida'], 'ambos', true),
  ('La Segunda', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','ART','AP','Vida'], 'ambos', true),
  ('Federación Patronal', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','ART','AP','Vida'], 'ambos', true),
  ('Rivadavia', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','ART','AP','Vida'], 'ambos', true),
  ('San Cristóbal', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','ART','AP','Vida'], 'ambos', true),
  ('Mapfre', ARRAY['Automotor','Flotas','Hogar','Integral de comercio','ART','AP','Vida'], 'ambos', true)
ON CONFLICT ("nombre") DO NOTHING;
--> statement-breakpoint
INSERT INTO "org_features" ("org_id", "feature", "activa") VALUES (NULL, 'cotizacion_ia', false);
