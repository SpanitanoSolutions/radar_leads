CREATE TABLE "conector_companias" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"canales" text[] DEFAULT '{}' NOT NULL,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conector_companias_alcance_uq" UNIQUE NULLS NOT DISTINCT("compania","org_id","producer_id")
);
--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD COLUMN "canal_usado" text;--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD COLUMN "intentos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD COLUMN "numero_compania" text;--> statement-breakpoint
ALTER TABLE "cotizacion_envios" ADD COLUMN "ultimo_error" text;