CREATE TABLE "ia_configuracion" (
	"id" serial PRIMARY KEY NOT NULL,
	"agente" text NOT NULL,
	"operacion" text NOT NULL,
	"proveedor" text,
	"modelo" text,
	"activa" boolean DEFAULT false NOT NULL,
	"limite_costo_usd" numeric(12, 6),
	"limite_tokens_mes" integer,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ia_configuracion_agente_idx" ON "ia_configuracion" USING btree ("agente","operacion","org_id","producer_id");