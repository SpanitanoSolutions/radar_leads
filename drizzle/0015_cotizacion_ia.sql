CREATE TYPE "public"."estado_contenido_ia" AS ENUM('borrador', 'aprobado', 'omitido');--> statement-breakpoint
CREATE TABLE "cotizacion_borradores_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"contenido" text NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer NOT NULL,
	"tokens_salida" integer NOT NULL,
	"costo_usd" numeric(12, 6) NOT NULL,
	"estado" "estado_contenido_ia" DEFAULT 'borrador' NOT NULL,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cotizacion_borradores_ia" ADD CONSTRAINT "cotizacion_borradores_ia_solicitud_id_solicitudes_cotizacion_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_cotizacion"("id") ON DELETE cascade ON UPDATE no action;