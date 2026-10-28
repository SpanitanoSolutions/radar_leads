ALTER TABLE "asegurados" ADD COLUMN "codigo_postal" text;--> statement-breakpoint
ALTER TABLE "asegurados" ADD COLUMN "fecha_nacimiento" date;--> statement-breakpoint
ALTER TABLE "polizas" ADD COLUMN "producto" text;--> statement-breakpoint
ALTER TABLE "polizas" ADD COLUMN "premio" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "polizas" ADD COLUMN "suma_asegurada" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "polizas" ADD COLUMN "datos_compania" jsonb;