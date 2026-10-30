ALTER TABLE "ajustes" ADD COLUMN "provincia" text DEFAULT 'Buenos Aires' NOT NULL;--> statement-breakpoint
-- El interruptor de IA de Cotización pasa a ia_configuracion con el valor que tenía en org_features, así no se prende solo por la fila * / *.
INSERT INTO "ia_configuracion" ("agente", "operacion", "activa")
SELECT 'cotizacion', '*', coalesce((SELECT "activa" FROM "org_features" WHERE "org_id" IS NULL AND "feature" = 'cotizacion_ia' LIMIT 1), false)
WHERE NOT EXISTS (SELECT 1 FROM "ia_configuracion" WHERE "agente" = 'cotizacion' AND "operacion" = '*' AND "org_id" IS NULL AND "producer_id" IS NULL);
