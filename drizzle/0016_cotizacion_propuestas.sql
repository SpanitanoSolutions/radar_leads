CREATE TABLE "cotizacion_propuestas" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"aprobado_el" timestamp with time zone,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cotizacion_propuestas" ADD CONSTRAINT "cotizacion_propuestas_solicitud_id_solicitudes_cotizacion_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_cotizacion"("id") ON DELETE cascade ON UPDATE no action;