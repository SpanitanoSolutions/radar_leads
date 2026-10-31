CREATE TABLE "api_claves" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"prefijo" text NOT NULL,
	"hash" text NOT NULL,
	"permisos" jsonb DEFAULT '["cobranza"]'::jsonb NOT NULL,
	"org_id" text,
	"producer_id" text,
	"creada_el" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_el" timestamp with time zone,
	"revocada_el" timestamp with time zone,
	CONSTRAINT "api_claves_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "cobranza_casos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuota_id" integer NOT NULL,
	"asegurado_id" integer NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"motivo" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"ultimo_contacto_el" timestamp with time zone,
	"promesa_el" date,
	"pagado_el" timestamp with time zone,
	"incluir_igual" boolean DEFAULT false NOT NULL,
	"es_ejemplo" boolean DEFAULT false NOT NULL,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobranza_casos_cuota_id_unique" UNIQUE("cuota_id")
);
--> statement-breakpoint
CREATE TABLE "cobranza_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"reglas_generales" text,
	"tramos" jsonb,
	"max_intentos" integer,
	"dias_entre_intentos" integer,
	"dias_gracia_promesa" integer,
	"dias_primer_contacto" integer,
	"hora_ejecucion" text,
	"zona_horaria" text,
	"dias_permitidos" jsonb,
	"ventana_desde" text,
	"ventana_hasta" text,
	"firmante_nombre" text,
	"firmante_email" text,
	"firmante_telefono" text,
	"idioma" text,
	"filtros" jsonb,
	"notificaciones" jsonb,
	"canales" jsonb,
	"modo_prueba" boolean,
	"pedir_aprobacion" boolean,
	"prueba_telefono" text,
	"prueba_email" text,
	"prueba_whatsapp" text,
	"prueba_max_recibos" integer,
	"prueba_filtro" jsonb,
	"org_id" text,
	"producer_id" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobranza_config_alcance_uq" UNIQUE NULLS NOT DISTINCT("org_id","producer_id")
);
--> statement-breakpoint
CREATE TABLE "cobranza_corridas" (
	"id" serial PRIMARY KEY NOT NULL,
	"origen" text NOT NULL,
	"estado" text DEFAULT 'en_curso' NOT NULL,
	"modo_prueba" boolean NOT NULL,
	"con_ia" boolean DEFAULT false NOT NULL,
	"iniciada_el" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_el" timestamp with time zone,
	"procesados" integer DEFAULT 0 NOT NULL,
	"contactados" integer DEFAULT 0 NOT NULL,
	"errores" integer DEFAULT 0 NOT NULL,
	"costo_ia_usd" numeric(12, 6),
	"resumen" text,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"org_id" text,
	"producer_id" text
);
--> statement-breakpoint
CREATE TABLE "cobranza_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"caso_id" integer NOT NULL,
	"corrida_id" integer,
	"tipo" text NOT NULL,
	"canal" text,
	"resumen" text NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"es_prueba" boolean DEFAULT false NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobranza_no_contactar" (
	"asegurado_id" integer PRIMARY KEY NOT NULL,
	"motivo" text NOT NULL,
	"nota" text,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobranza_casos" ADD CONSTRAINT "cobranza_casos_cuota_id_cuotas_id_fk" FOREIGN KEY ("cuota_id") REFERENCES "public"."cuotas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranza_casos" ADD CONSTRAINT "cobranza_casos_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranza_eventos" ADD CONSTRAINT "cobranza_eventos_caso_id_cobranza_casos_id_fk" FOREIGN KEY ("caso_id") REFERENCES "public"."cobranza_casos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranza_eventos" ADD CONSTRAINT "cobranza_eventos_corrida_id_cobranza_corridas_id_fk" FOREIGN KEY ("corrida_id") REFERENCES "public"."cobranza_corridas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranza_no_contactar" ADD CONSTRAINT "cobranza_no_contactar_asegurado_id_asegurados_id_fk" FOREIGN KEY ("asegurado_id") REFERENCES "public"."asegurados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobranza_casos_estado_idx" ON "cobranza_casos" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "cobranza_casos_asegurado_idx" ON "cobranza_casos" USING btree ("asegurado_id");--> statement-breakpoint
CREATE INDEX "cobranza_corridas_fecha_idx" ON "cobranza_corridas" USING btree ("org_id","iniciada_el");--> statement-breakpoint
CREATE INDEX "cobranza_eventos_caso_idx" ON "cobranza_eventos" USING btree ("caso_id","creado_el");--> statement-breakpoint
-- Cobranza v1 → v2: cada seguimiento pasa a ser un caso, con su estado traducido. seguimientos_cobranza no se toca.
-- terminado = el Validador confirmó el pago; pausado con promesa = promesa; pausado sin promesa (pago incompleto, comprobante con problemas) = escalado al productor.
-- El caso apunta a la cuota de menor id del cobro (mismo asegurado, compañía y vencimiento), como la sincronización de src/agentes/cobranza/casos.ts.
INSERT INTO "cobranza_casos" ("cuota_id", "asegurado_id", "estado", "motivo", "intentos", "ultimo_contacto_el", "promesa_el", "pagado_el", "es_ejemplo", "creado_el", "actualizado_el")
SELECT DISTINCT ON (g."cabeza") g."cabeza", p."asegurado_id",
  CASE
    WHEN s."estado" = 'terminado' THEN 'pagado'
    WHEN s."estado" = 'pausado' AND s."promesa_pago_el" IS NOT NULL THEN 'promesa'
    WHEN s."estado" = 'pausado' THEN 'escalado'
    WHEN s."paso" > 0 THEN 'sin_respuesta'
    ELSE 'pendiente'
  END,
  CASE WHEN s."estado" = 'pausado' THEN s."motivo_pausa" END,
  s."paso",
  CASE WHEN s."paso" > 0 THEN s."ultima_novedad_el" END,
  s."promesa_pago_el",
  CASE WHEN s."estado" = 'terminado' THEN coalesce(c."pagada_el", s."actualizado_el") END,
  a."es_ejemplo", s."actualizado_el", s."actualizado_el"
FROM "seguimientos_cobranza" s
JOIN "cuotas" c ON c."id" = s."cuota_id"
JOIN "polizas" p ON p."id" = c."poliza_id"
JOIN "asegurados" a ON a."id" = p."asegurado_id"
JOIN LATERAL (
  SELECT min(cx."id") AS "cabeza" FROM "cuotas" cx JOIN "polizas" px ON px."id" = cx."poliza_id"
  WHERE cx."vencimiento" = c."vencimiento" AND px."asegurado_id" = p."asegurado_id" AND coalesce(px."compania", '') = coalesce(p."compania", '')
) g ON true
ORDER BY g."cabeza", s."actualizado_el" DESC
ON CONFLICT ("cuota_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "cobranza_eventos" ("caso_id", "tipo", "resumen", "datos", "creado_el")
SELECT k."id", 'nota',
  'Venía de la Cobranza anterior: paso ' || s."paso" || ' de 5' || coalesce(' · ' || s."ultima_novedad", '') || '.',
  jsonb_build_object('pasoV1', s."paso", 'estadoV1', s."estado"::text),
  s."actualizado_el"
FROM "seguimientos_cobranza" s
JOIN "cuotas" c ON c."id" = s."cuota_id"
JOIN "polizas" p ON p."id" = c."poliza_id"
JOIN "cuotas" ck ON ck."vencimiento" = c."vencimiento"
JOIN "polizas" pk ON pk."id" = ck."poliza_id" AND pk."asegurado_id" = p."asegurado_id" AND coalesce(pk."compania", '') = coalesce(p."compania", '')
JOIN "cobranza_casos" k ON k."cuota_id" = ck."id";--> statement-breakpoint
-- Los mensajes de cobranza que ya salieron quedan en la línea de tiempo de su caso (la referencia es "cuota:<id>:…" de cualquier cuota del cobro).
INSERT INTO "cobranza_eventos" ("caso_id", "tipo", "canal", "resumen", "datos", "creado_el")
SELECT k."id",
  CASE m."canal" WHEN 'whatsapp' THEN 'whatsapp_enviado' ELSE 'email_enviado' END,
  m."canal"::text,
  coalesce(m."motivo", 'Mensaje de cobranza enviado.'),
  jsonb_build_object('texto', m."texto", 'para', m."destinatario", 'asunto', m."asunto", 'mensajeId', m."id"),
  coalesce(m."enviado_el", m."creado_el")
FROM "mensajes" m
JOIN "cuotas" cx ON m."referencia" LIKE 'cuota:' || cx."id" || ':%'
JOIN "polizas" px ON px."id" = cx."poliza_id"
JOIN "cuotas" ck ON ck."vencimiento" = cx."vencimiento"
JOIN "polizas" pk ON pk."id" = ck."poliza_id" AND pk."asegurado_id" = px."asegurado_id" AND coalesce(pk."compania", '') = coalesce(px."compania", '')
JOIN "cobranza_casos" k ON k."cuota_id" = ck."id"
WHERE m."agente" IN ('cobranza', 'validador') AND m."estado" = 'enviado' AND m."canal" IN ('whatsapp', 'email');
