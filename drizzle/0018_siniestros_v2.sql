CREATE TABLE "ia_trabajos" (
	"id" serial PRIMARY KEY NOT NULL,
	"agente" text NOT NULL,
	"operacion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" integer NOT NULL,
	"org_id" text,
	"producer_id" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"progreso" integer DEFAULT 0 NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_seguro" text,
	"ejecutar_despues_de" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_el" timestamp with time zone,
	"terminado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ia_uso" (
	"id" serial PRIMARY KEY NOT NULL,
	"agente" text NOT NULL,
	"operacion" text NOT NULL,
	"proveedor" text,
	"modelo" text,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_usd" numeric(12, 6),
	"duracion_ms" integer,
	"resultado" text NOT NULL,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniestro_archivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"archivo_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamano" integer NOT NULL,
	"clasificacion" text,
	"estado_analisis" text DEFAULT 'pendiente_configuracion' NOT NULL,
	"pagina_count" integer,
	"campos" jsonb,
	"trabajo_id" integer,
	"subido_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniestro_conversaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"numero" integer,
	"rol" text NOT NULL,
	"texto" text NOT NULL,
	"citas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniestro_requisitos" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"recibido" boolean DEFAULT false NOT NULL,
	"cantidad" integer,
	"archivo_id" integer,
	"recibido_el" timestamp with time zone,
	"origen" text DEFAULT 'plantilla' NOT NULL,
	"modificacion_manual" boolean DEFAULT false NOT NULL,
	"bloqueante" boolean DEFAULT true NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "siniestros" DROP CONSTRAINT "siniestros_poliza_id_polizas_id_fk";
--> statement-breakpoint
ALTER TABLE "siniestros" ALTER COLUMN "poliza_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "folio" text;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "asegurado_id" integer;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "compania" text;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "ramo" text;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "archivado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "afectado" text;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "actualizado_el" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "siniestros" AS s
SET "asegurado_id" = p."asegurado_id",
	"compania" = p."compania",
	"ramo" = p."ramo",
	"folio" = 'SIN-' || lpad(s."id"::text, 6, '0'),
	"actualizado_el" = s."creado_el"
FROM "polizas" AS p
WHERE p."id" = s."poliza_id";--> statement-breakpoint
INSERT INTO "siniestro_requisitos" ("siniestro_id", "nombre", "recibido", "cantidad", "archivo_id", "recibido_el", "origen")
SELECT "siniestro_id", "nombre", "recibido", "cantidad", "archivo_id", "recibido_el", 'migracion'
FROM "siniestro_documentos";--> statement-breakpoint
INSERT INTO "siniestro_archivos" ("siniestro_id", "archivo_id", "nombre", "tipo_mime", "tamano", "estado_analisis")
SELECT DISTINCT ON (sd."siniestro_id", a."id") sd."siniestro_id", a."id", a."nombre", a."tipo", a."tamano", 'manual'
FROM "siniestro_documentos" AS sd
JOIN "archivos" AS a ON a."id" = sd."archivo_id"
WHERE sd."archivo_id" IS NOT NULL
ORDER BY sd."siniestro_id", a."id", sd."id";--> statement-breakpoint
ALTER TABLE "siniestro_archivos" ADD CONSTRAINT "siniestro_archivos_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_archivos" ADD CONSTRAINT "siniestro_archivos_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_conversaciones" ADD CONSTRAINT "siniestro_conversaciones_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_requisitos" ADD CONSTRAINT "siniestro_requisitos_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_requisitos" ADD CONSTRAINT "siniestro_requisitos_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_trabajos_pendientes_idx" ON "ia_trabajos" USING btree ("estado","ejecutar_despues_de");--> statement-breakpoint
CREATE INDEX "ia_trabajos_entidad_idx" ON "ia_trabajos" USING btree ("agente","entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "ia_uso_agente_fecha_idx" ON "ia_uso" USING btree ("agente","creado_el");--> statement-breakpoint
CREATE INDEX "ia_uso_org_fecha_idx" ON "ia_uso" USING btree ("org_id","creado_el");--> statement-breakpoint
CREATE INDEX "siniestro_archivos_siniestro_idx" ON "siniestro_archivos" USING btree ("siniestro_id");--> statement-breakpoint
CREATE INDEX "siniestro_conversaciones_siniestro_idx" ON "siniestro_conversaciones" USING btree ("siniestro_id","creado_el");--> statement-breakpoint
CREATE INDEX "siniestro_requisitos_siniestro_idx" ON "siniestro_requisitos" USING btree ("siniestro_id");--> statement-breakpoint
ALTER TABLE "siniestros" ADD CONSTRAINT "siniestros_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestros" ADD CONSTRAINT "siniestros_poliza_id_polizas_id_fk" FOREIGN KEY ("poliza_id") REFERENCES "public"."polizas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "siniestros_folio_idx" ON "siniestros" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "siniestros_estado_fecha_idx" ON "siniestros" USING btree ("cerrado","fecha");
