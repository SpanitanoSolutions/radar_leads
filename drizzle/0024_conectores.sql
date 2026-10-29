CREATE TABLE "conector_llamadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"canal" text NOT NULL,
	"agente" text NOT NULL,
	"operacion" text NOT NULL,
	"resultado" text NOT NULL,
	"codigo_error" text,
	"duracion_ms" integer NOT NULL,
	"costo_ia_usd" numeric(12, 6),
	"entidad" text,
	"entidad_id" integer,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conector_salud" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"canal" text NOT NULL,
	"ultimo_exito_el" timestamp with time zone,
	"ultimo_error_el" timestamp with time zone,
	"codigo_ultimo_error" text,
	"credencial_vencida" boolean DEFAULT false NOT NULL,
	"portal_cambiado" boolean DEFAULT false NOT NULL,
	"latencia_ms" integer,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conector_llamadas_compania_fecha_idx" ON "conector_llamadas" USING btree ("compania","creado_el");--> statement-breakpoint
CREATE INDEX "conector_llamadas_entidad_idx" ON "conector_llamadas" USING btree ("agente","entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "conector_salud_canal_idx" ON "conector_salud" USING btree ("compania","canal","org_id","producer_id");