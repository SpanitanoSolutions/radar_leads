ALTER TABLE "siniestro_archivos" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_archivos" ADD COLUMN "producer_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_conversaciones" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_conversaciones" ADD COLUMN "producer_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_gastos" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_gastos" ADD COLUMN "producer_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_informes" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_informes" ADD COLUMN "producer_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_requisitos" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "siniestro_requisitos" ADD COLUMN "producer_id" text;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "siniestros" ADD COLUMN "producer_id" text;