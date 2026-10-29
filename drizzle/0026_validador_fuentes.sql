CREATE TABLE "conector_mapeos" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"ramo" text DEFAULT '*' NOT NULL,
	"operacion" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mapeo" jsonb NOT NULL,
	"origen" text NOT NULL,
	"confirmado" boolean DEFAULT false NOT NULL,
	"confirmado_el" timestamp with time zone,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conector_mapeos_version_uq" UNIQUE NULLS NOT DISTINCT("compania","ramo","operacion","version","org_id","producer_id")
);
--> statement-breakpoint
CREATE TABLE "credenciales_portal" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"etiqueta" text NOT NULL,
	"usuario" text NOT NULL,
	"secreto_cifrado" text NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"ultimo_uso_el" timestamp with time zone,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD COLUMN "nombre" text;--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD COLUMN "mapeo_id" integer;--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD COLUMN "mapeo_propuesto" jsonb;--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD COLUMN "extraccion" jsonb;--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD COLUMN "problemas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD COLUMN "fila" integer;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD COLUMN "original" jsonb;--> statement-breakpoint
CREATE INDEX "conector_mapeos_operacion_idx" ON "conector_mapeos" USING btree ("operacion","compania");--> statement-breakpoint
CREATE INDEX "credenciales_portal_compania_idx" ON "credenciales_portal" USING btree ("compania","org_id","producer_id");--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD CONSTRAINT "validador_fuentes_mapeo_id_conector_mapeos_id_fk" FOREIGN KEY ("mapeo_id") REFERENCES "public"."conector_mapeos"("id") ON DELETE set null ON UPDATE no action;