CREATE TYPE "public"."alcance_licitacion" AS ENUM('municipal', 'provincial', 'nacional');--> statement-breakpoint
CREATE TYPE "public"."estado_lead" AS ENUM('nuevo', 'llamado', 'reunion', 'cerrado', 'descartado');--> statement-breakpoint
CREATE TYPE "public"."prioridad" AS ENUM('alta', 'media', 'baja');--> statement-breakpoint
CREATE TYPE "public"."zona" AS ENUM('mdp', 'costa', 'provincia');--> statement-breakpoint
CREATE TABLE "ajustes" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"zonas" jsonb NOT NULL,
	"licitaciones" jsonb NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa" text NOT NULL,
	"cuit" text,
	"rubro" text NOT NULL,
	"localidad" text NOT NULL,
	"zona" "zona" NOT NULL,
	"sector_id" text NOT NULL,
	"motivo" text NOT NULL,
	"descripcion" text,
	"fuente" text NOT NULL,
	"fuente_url" text,
	"alcance_licitacion" "alcance_licitacion",
	"ramos" text[] NOT NULL,
	"score_base" integer NOT NULL,
	"estado" "estado_lead" DEFAULT 'nuevo' NOT NULL,
	"nota" text,
	"recordatorio" date,
	"telefono" text,
	"domicilio" text,
	"art_actual" text,
	"deuda_bcra" text,
	"es_ejemplo" boolean DEFAULT false NOT NULL,
	"detectado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectores" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"ejemplos" text NOT NULL,
	"ramos_tipicos" text NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"prioridad" "prioridad" DEFAULT 'media' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sector_id_sectores_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectores"("id") ON DELETE no action ON UPDATE no action;