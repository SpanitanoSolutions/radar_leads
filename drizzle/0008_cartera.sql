CREATE TABLE "cartera" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente" text NOT NULL,
	"cuit" text,
	"ramos" text[] NOT NULL,
	"compania" text,
	"vencimiento" date,
	"cargado_el" timestamp with time zone DEFAULT now() NOT NULL
);
