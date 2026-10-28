CREATE TABLE "siniestro_configuracion" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"ramo" text NOT NULL,
	"tipo" text NOT NULL,
	"requisitos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orden_dossier" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plazo_aviso_dias" integer,
	"dias_sin_novedades" integer,
	"voz_agente" text,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniestro_gastos" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"fecha" date NOT NULL,
	"comprobante_archivo_id" integer,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniestro_informes" (
	"id" serial PRIMARY KEY NOT NULL,
	"siniestro_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archivo_id" integer,
	"aprobado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "siniestro_gastos" ADD CONSTRAINT "siniestro_gastos_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_gastos" ADD CONSTRAINT "siniestro_gastos_comprobante_archivo_id_archivos_id_fk" FOREIGN KEY ("comprobante_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_informes" ADD CONSTRAINT "siniestro_informes_siniestro_id_siniestros_id_fk" FOREIGN KEY ("siniestro_id") REFERENCES "public"."siniestros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siniestro_informes" ADD CONSTRAINT "siniestro_informes_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "siniestro_configuracion_busqueda_idx" ON "siniestro_configuracion" USING btree ("compania","ramo","tipo");--> statement-breakpoint
CREATE INDEX "siniestro_gastos_siniestro_idx" ON "siniestro_gastos" USING btree ("siniestro_id","fecha");--> statement-breakpoint
CREATE INDEX "siniestro_informes_siniestro_idx" ON "siniestro_informes" USING btree ("siniestro_id","creado_el");--> statement-breakpoint
ALTER TABLE "siniestro_archivos" ADD CONSTRAINT "siniestro_archivos_trabajo_id_ia_trabajos_id_fk" FOREIGN KEY ("trabajo_id") REFERENCES "public"."ia_trabajos"("id") ON DELETE set null ON UPDATE no action;