CREATE TABLE "validador_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"frecuencia" text,
	"hora_ejecucion" text,
	"hora_enriquecimiento" text,
	"zona_horaria" text,
	"tolerancia_monto" numeric(14, 2),
	"gracia_habilitada" boolean,
	"notificaciones" jsonb,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validador_config_alcance_uq" UNIQUE NULLS NOT DISTINCT("org_id","producer_id")
);
--> statement-breakpoint
CREATE TABLE "validador_corridas" (
	"id" serial PRIMARY KEY NOT NULL,
	"origen" text NOT NULL,
	"estado" text DEFAULT 'en_curso' NOT NULL,
	"iniciada_el" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_el" timestamp with time zone,
	"companias_procesadas" integer DEFAULT 0 NOT NULL,
	"cuotas_actualizadas" integer DEFAULT 0 NOT NULL,
	"errores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"costo_ia_usd" numeric(12, 6),
	"org_id" text,
	"producer_id" text
);
--> statement-breakpoint
CREATE TABLE "validador_fuentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"corrida_id" integer,
	"compania" text NOT NULL,
	"tipo" text NOT NULL,
	"periodo_desde" date,
	"periodo_hasta" date,
	"formato" text NOT NULL,
	"archivo_id" integer,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"filas_extraidas" integer DEFAULT 0 NOT NULL,
	"error_seguro" text,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validador_gracia" (
	"id" serial PRIMARY KEY NOT NULL,
	"compania" text NOT NULL,
	"ramo" text NOT NULL,
	"dias_primera" integer NOT NULL,
	"dias_siguientes" integer NOT NULL,
	"habilitado" boolean DEFAULT true NOT NULL,
	"org_id" text,
	"producer_id" text,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validador_gracia_alcance_uq" UNIQUE NULLS NOT DISTINCT("compania","ramo","org_id","producer_id")
);
--> statement-breakpoint
CREATE TABLE "validador_pagos_detectados" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuente_id" integer NOT NULL,
	"corrida_id" integer,
	"datos" jsonb NOT NULL,
	"cuota_id" integer,
	"puntaje" integer DEFAULT 0 NOT NULL,
	"estado" text NOT NULL,
	"candidatos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cambio" text,
	"motivo" text,
	"revisado_el" timestamp with time zone,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cuotas_poliza_numero_idx";--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "item" text;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "endoso" text;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "cupon" text;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "moneda" text DEFAULT 'ARS' NOT NULL;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "estado_validacion" text;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "fecha_pago" date;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "origen_confirmacion" text;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "ultima_revision" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "cancelada_el" date;--> statement-breakpoint
ALTER TABLE "cuotas" ADD COLUMN "motivo_cancelacion" text;--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD CONSTRAINT "validador_fuentes_corrida_id_validador_corridas_id_fk" FOREIGN KEY ("corrida_id") REFERENCES "public"."validador_corridas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validador_fuentes" ADD CONSTRAINT "validador_fuentes_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD CONSTRAINT "validador_pagos_detectados_fuente_id_validador_fuentes_id_fk" FOREIGN KEY ("fuente_id") REFERENCES "public"."validador_fuentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD CONSTRAINT "validador_pagos_detectados_corrida_id_validador_corridas_id_fk" FOREIGN KEY ("corrida_id") REFERENCES "public"."validador_corridas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD CONSTRAINT "validador_pagos_detectados_cuota_id_cuotas_id_fk" FOREIGN KEY ("cuota_id") REFERENCES "public"."cuotas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validador_corridas_fecha_idx" ON "validador_corridas" USING btree ("org_id","iniciada_el");--> statement-breakpoint
CREATE INDEX "validador_fuentes_estado_idx" ON "validador_fuentes" USING btree ("estado","creado_el");--> statement-breakpoint
CREATE INDEX "validador_pagos_fuente_idx" ON "validador_pagos_detectados" USING btree ("fuente_id");--> statement-breakpoint
CREATE INDEX "validador_pagos_estado_idx" ON "validador_pagos_detectados" USING btree ("estado","creado_el");--> statement-breakpoint
CREATE INDEX "validador_pagos_cuota_idx" ON "validador_pagos_detectados" USING btree ("cuota_id");--> statement-breakpoint
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_poliza_cuota_uq" UNIQUE NULLS NOT DISTINCT("poliza_id","numero","item","endoso");