ALTER TABLE "siniestros" ADD COLUMN "es_ejemplo" boolean DEFAULT false NOT NULL;
UPDATE "siniestros" AS s
SET "es_ejemplo" = a."es_ejemplo"
FROM "asegurados" AS a
WHERE a."id" = s."asegurado_id";
