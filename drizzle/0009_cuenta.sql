ALTER TABLE "ajustes" ADD COLUMN "productor_nombre" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "productor_matricula" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "productor_organizacion" text DEFAULT 'HR Productores';--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "productor_telefono" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "productor_email" text;