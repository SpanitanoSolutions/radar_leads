CREATE TABLE "capturas" (
	"fuente" text PRIMARY KEY NOT NULL,
	"version" text,
	"ejecutado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"nuevos" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "clave" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_clave_unique" UNIQUE("clave");