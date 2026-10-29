ALTER TABLE "comprobantes" ALTER COLUMN "cuota_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "moneda" text DEFAULT 'ARS' NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "referencia" text;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "pagador" text;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "documento_pagador" text;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "extraccion" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "candidatos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "motivo_propuesta" text;--> statement-breakpoint
ALTER TABLE "validador_corridas" ADD COLUMN "etapa" text DEFAULT 'validacion' NOT NULL;--> statement-breakpoint
ALTER TABLE "validador_corridas" ADD COLUMN "progreso" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "validador_corridas" ADD COLUMN "resumen" text;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD COLUMN "explicacion" text;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD COLUMN "accion_propuesta" text;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD COLUMN "cuota_sugerida_id" integer;--> statement-breakpoint
ALTER TABLE "validador_pagos_detectados" ADD CONSTRAINT "validador_pagos_detectados_cuota_sugerida_id_cuotas_id_fk" FOREIGN KEY ("cuota_sugerida_id") REFERENCES "public"."cuotas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Cobranza pasa a usar la gracia del Validador (decidido el 29/10/2026). Para que
-- hoy no cambie nada, cada compañía arranca con su plazo de companias.dias_gracia
-- (30 por defecto) como fila de plataforma para todos los ramos. Las compañías de
-- la cartera que no están en companias toman los 30 que Cobranza les daba.
INSERT INTO "validador_gracia" ("compania", "ramo", "dias_primera", "dias_siguientes")
SELECT "nombre", '*', "dias_gracia", "dias_gracia" FROM "companias"
UNION
SELECT DISTINCT trim(p."compania"), '*', 30, 30
FROM "polizas" p
WHERE p."compania" IS NOT NULL AND trim(p."compania") <> ''
  AND NOT EXISTS (SELECT 1 FROM "companias" c WHERE lower(c."nombre") = lower(trim(p."compania")))
ON CONFLICT DO NOTHING;
