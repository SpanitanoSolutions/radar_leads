ALTER TABLE "leads" ADD COLUMN "contactado_el" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reunion_el" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cerrado_el" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cierre_ramos" text[];--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cierre_prima" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cierre_comision" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "motivo_descarte" text;--> statement-breakpoint
-- Leads que ya avanzaron: la fecha del último cambio es la mejor aproximación.
UPDATE "leads" SET "contactado_el" = "actualizado_el" WHERE "estado" IN ('llamado', 'reunion', 'cerrado');--> statement-breakpoint
UPDATE "leads" SET "reunion_el" = "actualizado_el" WHERE "estado" = 'reunion';--> statement-breakpoint
UPDATE "leads" SET "cerrado_el" = "actualizado_el" WHERE "estado" = 'cerrado';
