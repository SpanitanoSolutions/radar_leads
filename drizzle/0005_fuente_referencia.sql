ALTER TABLE "leads" ADD COLUMN "fuente_referencia" text;--> statement-breakpoint
-- COMPR.AR no tiene enlace público por número de proceso: se apunta al buscador.
UPDATE "leads" SET
  "fuente_url" = 'https://comprar.gob.ar/BuscarAvanzado.aspx',
  "fuente_referencia" = 'Proceso N° ' || split_part("clave", ':', 2)
    || CASE WHEN "fecha_evento" IS NULL THEN '' ELSE ', adjudicado el ' || to_char("fecha_evento", 'DD/MM/YYYY') END
    || '. En COMPR.AR, buscá ese número en "Buscar procesos". Datos abiertos de datos.gob.ar (CC BY 4.0).'
WHERE "clave" LIKE 'comprar:%' AND "fuente_referencia" IS NULL;--> statement-breakpoint
-- Avisos del Boletín capturados antes de guardar la página: fecha y sección.
UPDATE "leads" SET
  "fuente_referencia" = 'Boletín Oficial'
    || CASE WHEN "fecha_evento" IS NULL THEN '' ELSE ' del ' || to_char("fecha_evento", 'DD/MM/YYYY') END
    || ' · Sección Oficial · '
    || CASE WHEN "clave" LIKE 'bo-pba:sociedad:%' THEN 'Sociedades' ELSE 'Transferencias' END
    || '. Buscá la razón social en el PDF (Ctrl+F).'
WHERE "clave" LIKE 'bo-pba:%' AND "fuente_referencia" IS NULL;
