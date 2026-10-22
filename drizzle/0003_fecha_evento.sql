ALTER TABLE "leads" ADD COLUMN "fecha_evento" date;--> statement-breakpoint
-- Leads ya capturados: la fecha del evento figura en la descripción ("…, el 22/06/2026, …").
UPDATE "leads" SET "fecha_evento" = to_date(substring("descripcion" from ' el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
WHERE "fecha_evento" IS NULL AND "clave" IS NOT NULL AND "descripcion" ~ ' el \d{2}/\d{2}/\d{4}';--> statement-breakpoint
-- Leads de ejemplo: el evento ocurrió el día en que se detectó.
UPDATE "leads" SET "fecha_evento" = ("detectado_el" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
WHERE "fecha_evento" IS NULL AND "es_ejemplo";
