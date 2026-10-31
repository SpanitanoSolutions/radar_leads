import { z } from "zod";
import type { CobranzaConfig } from "@/db/schema";
import { TRAMOS_POR_DEFECTO } from "./tramos";
import { CANALES_COBRANZA, type CanalCobranza, type ConfiguracionCobranza } from "./tipos";

// Configuración del Agente de Cobranza: los valores por defecto (los de la
// spec), cómo se lee una fila de cobranza_config (null = valor por defecto) y
// la validación de lo que llega de la pantalla o de la API.

export const ZONA_POR_DEFECTO = "America/Argentina/Buenos_Aires";

export const CONFIG_POR_DEFECTO: ConfiguracionCobranza = {
  reglasGenerales: "",
  tramos: TRAMOS_POR_DEFECTO,
  maxIntentos: 5,
  diasEntreIntentos: 3,
  diasGraciaPromesa: 3,
  diasPrimerContacto: 5,
  horaEjecucion: "10:00",
  zonaHoraria: ZONA_POR_DEFECTO,
  diasPermitidos: [1, 2, 3, 4, 5],
  ventanaDesde: "09:00",
  ventanaHasta: "18:00",
  firmanteNombre: "",
  firmanteEmail: "",
  firmanteTelefono: "",
  idioma: "es-AR",
  filtros: { companias: [], ramos: [], montoMinimo: null, excluirMarcados: true },
  notificaciones: { alEscalar: true, alPrometer: false, resumenDiario: false, canal: "email", destinatarios: [] },
  canales: {
    whatsapp: {
      habilitado: true,
      instrucciones:
        "Mensajes cortos y cordiales, de 2 a 4 líneas, en un solo mensaje. Nombrá la compañía, el monto y el vencimiento. Sin enlaces ni adjuntos.",
      remitente: null,
      verificado: false,
    },
    email: {
      habilitado: true,
      instrucciones:
        "Asunto claro con la compañía y la póliza. Saludo, el detalle del recibo (compañía, póliza, monto y vencimiento) y cómo pagar. Con empresas, tono formal.",
      remitente: null,
      verificado: false,
    },
    telefono: {
      habilitado: false,
      instrucciones: "Guion breve: presentate como asistente del productor, recordá el recibo y preguntá cuándo puede pagar.",
      remitente: null,
      verificado: false,
    },
  },
  modoPrueba: true,
  pedirAprobacion: true,
  prueba: { telefono: "", email: "", whatsapp: "", maxRecibos: 3, filtro: { tipo: "cualquiera" } },
};

export const NOMBRE_CANAL: Record<CanalCobranza, string> = { whatsapp: "WhatsApp", email: "Email", telefono: "Teléfono" };
export const NOMBRE_DIA = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

const deCampo = <T>(valor: T | null | undefined, porDefecto: T): T => (valor === null || valor === undefined ? porDefecto : valor);

/** La configuración de una fila de cobranza_config (o la de por defecto si no hay fila). */
export function resolverConfigCobranza(fila?: Partial<CobranzaConfig> | null): ConfiguracionCobranza {
  const d = CONFIG_POR_DEFECTO;
  if (!fila) return structuredClone(d);
  const canales = Object.fromEntries(
    CANALES_COBRANZA.map((c) => {
      const guardado = fila.canales?.[c] ?? {};
      return [
        c,
        {
          habilitado: deCampo(guardado.habilitado, d.canales[c].habilitado),
          instrucciones: deCampo(guardado.instrucciones, d.canales[c].instrucciones),
          remitente: guardado.remitente ?? null,
          verificado: deCampo(guardado.verificado, false),
        },
      ];
    }),
  ) as ConfiguracionCobranza["canales"];
  return structuredClone({
    reglasGenerales: deCampo(fila.reglasGenerales, d.reglasGenerales),
    tramos: fila.tramos?.length ? fila.tramos : d.tramos,
    maxIntentos: deCampo(fila.maxIntentos, d.maxIntentos),
    diasEntreIntentos: deCampo(fila.diasEntreIntentos, d.diasEntreIntentos),
    diasGraciaPromesa: deCampo(fila.diasGraciaPromesa, d.diasGraciaPromesa),
    diasPrimerContacto: deCampo(fila.diasPrimerContacto, d.diasPrimerContacto),
    horaEjecucion: fila.horaEjecucion && HORA.test(fila.horaEjecucion) ? fila.horaEjecucion : d.horaEjecucion,
    zonaHoraria: fila.zonaHoraria && zonaValida(fila.zonaHoraria) ? fila.zonaHoraria : d.zonaHoraria,
    diasPermitidos: deCampo(fila.diasPermitidos, d.diasPermitidos),
    ventanaDesde: fila.ventanaDesde && HORA.test(fila.ventanaDesde) ? fila.ventanaDesde : d.ventanaDesde,
    ventanaHasta: fila.ventanaHasta && HORA.test(fila.ventanaHasta) ? fila.ventanaHasta : d.ventanaHasta,
    firmanteNombre: deCampo(fila.firmanteNombre, d.firmanteNombre),
    firmanteEmail: deCampo(fila.firmanteEmail, d.firmanteEmail),
    firmanteTelefono: deCampo(fila.firmanteTelefono, d.firmanteTelefono),
    idioma: deCampo(fila.idioma, d.idioma),
    filtros: { ...d.filtros, ...fila.filtros },
    notificaciones: { ...d.notificaciones, ...fila.notificaciones },
    canales,
    modoPrueba: deCampo(fila.modoPrueba, d.modoPrueba),
    pedirAprobacion: deCampo(fila.pedirAprobacion, d.pedirAprobacion),
    prueba: {
      telefono: deCampo(fila.pruebaTelefono, d.prueba.telefono),
      email: deCampo(fila.pruebaEmail, d.prueba.email),
      whatsapp: deCampo(fila.pruebaWhatsapp, d.prueba.whatsapp),
      maxRecibos: deCampo(fila.pruebaMaxRecibos, d.prueba.maxRecibos),
      filtro: deCampo(fila.pruebaFiltro, d.prueba.filtro),
    },
  });
}

/** Las columnas de cobranza_config para guardar una configuración completa. */
export function filaDeConfig(c: ConfiguracionCobranza) {
  return {
    reglasGenerales: c.reglasGenerales,
    tramos: c.tramos,
    maxIntentos: c.maxIntentos,
    diasEntreIntentos: c.diasEntreIntentos,
    diasGraciaPromesa: c.diasGraciaPromesa,
    diasPrimerContacto: c.diasPrimerContacto,
    horaEjecucion: c.horaEjecucion,
    zonaHoraria: c.zonaHoraria,
    diasPermitidos: c.diasPermitidos,
    ventanaDesde: c.ventanaDesde,
    ventanaHasta: c.ventanaHasta,
    firmanteNombre: c.firmanteNombre,
    firmanteEmail: c.firmanteEmail,
    firmanteTelefono: c.firmanteTelefono,
    idioma: c.idioma,
    filtros: c.filtros,
    notificaciones: c.notificaciones,
    canales: c.canales,
    modoPrueba: c.modoPrueba,
    pedirAprobacion: c.pedirAprobacion,
    pruebaTelefono: c.prueba.telefono,
    pruebaEmail: c.prueba.email,
    pruebaWhatsapp: c.prueba.whatsapp,
    pruebaMaxRecibos: c.prueba.maxRecibos,
    pruebaFiltro: c.prueba.filtro,
  };
}

// ---------- Validación (pantalla y API) ----------

const texto = (max: number) => z.string().trim().max(max);
const hora = z.string().regex(HORA, "Hora con formato HH:MM");
const correo = z.union([z.literal(""), z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Correo inválido")]);
const telefono = z.union([z.literal(""), z.string().trim().max(40).regex(/^[+\d][\d\s().-]{5,}$/, "Teléfono inválido")]);

export const esquemaTramo = z
  .object({
    id: z.string().regex(/^[a-z0-9_]{1,40}$/, "Id del tramo: letras minúsculas, números y _"),
    nombre: texto(80).min(1, "Poné un nombre al tramo"),
    minDias: z.number().int().min(-365).max(365).nullable(),
    maxDias: z.number().int().min(-365).max(365).nullable(),
    instrucciones: texto(2000).nullable(),
  })
  .refine((t) => t.minDias === null || t.maxDias === null || t.minDias <= t.maxDias, "El rango de días está invertido");

const esquemaCanal = z.object({
  habilitado: z.boolean(),
  instrucciones: texto(2000),
  remitente: texto(200).nullable(),
  verificado: z.boolean(),
});

export const esquemaConfiguracion = z
  .object({
    reglasGenerales: texto(4000),
    tramos: z
      .array(esquemaTramo)
      .min(1, "Tiene que haber al menos un tramo")
      .max(12)
      .refine((ts) => new Set(ts.map((t) => t.id)).size === ts.length, "Hay dos tramos con el mismo id"),
    maxIntentos: z.number().int().min(1).max(20),
    diasEntreIntentos: z.number().int().min(1).max(30),
    diasGraciaPromesa: z.number().int().min(0).max(30),
    diasPrimerContacto: z.number().int().min(0).max(60),
    horaEjecucion: hora,
    zonaHoraria: z.string().refine(zonaValida, "Zona horaria desconocida"),
    diasPermitidos: z.array(z.number().int().min(1).max(7)).max(7).refine((ds) => new Set(ds).size === ds.length, "Días repetidos"),
    ventanaDesde: hora,
    ventanaHasta: hora,
    firmanteNombre: texto(120),
    firmanteEmail: correo,
    firmanteTelefono: telefono,
    idioma: z.enum(["es-AR"]),
    filtros: z.object({
      companias: z.array(texto(80)).max(100),
      ramos: z.array(texto(80)).max(100),
      montoMinimo: z.number().min(0).nullable(),
      excluirMarcados: z.boolean(),
    }),
    notificaciones: z.object({
      alEscalar: z.boolean(),
      alPrometer: z.boolean(),
      resumenDiario: z.boolean(),
      canal: z.enum(["email", "whatsapp"]),
      destinatarios: z.array(texto(200).min(1)).max(10),
    }),
    canales: z.object({ whatsapp: esquemaCanal, email: esquemaCanal, telefono: esquemaCanal }),
    modoPrueba: z.boolean(),
    pedirAprobacion: z.boolean(),
    prueba: z.object({
      telefono,
      email: correo,
      whatsapp: telefono,
      maxRecibos: z.number().int().min(1).max(50),
      filtro: z.discriminatedUnion("tipo", [
        z.object({ tipo: z.literal("cualquiera") }),
        z.object({ tipo: z.literal("tramo"), tramo: z.string().min(1) }),
        z.object({ tipo: z.literal("compania"), compania: z.string().min(1) }),
      ]),
    }),
  })
  .refine((c) => c.ventanaDesde < c.ventanaHasta, { message: "La ventana de contacto termina antes de empezar", path: ["ventanaHasta"] });

/** Los mensajes de zod en castellano, solo para estas validaciones (llegan a la pantalla y a la API). */
export const ERRORES_EN_CASTELLANO = z.locales.es().localeError;

export type ResultadoValidacion = { ok: true; config: ConfiguracionCobranza } | { ok: false; errores: string[] };

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Pisa `actual` con lo que trae `cambios`, campo por campo (los objetos se combinan; las listas se reemplazan). */
export function combinar<T>(actual: T, cambios: unknown): T {
  if (!esObjeto(actual) || !esObjeto(cambios)) return (cambios === undefined ? actual : cambios) as T;
  const salida: Record<string, unknown> = { ...actual };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined || !(clave in actual)) continue;
    salida[clave] = esObjeto(valor) && esObjeto(actual[clave as keyof typeof actual]) ? combinar(actual[clave as keyof typeof actual], valor) : valor;
  }
  return salida as T;
}

/**
 * Aplica cambios parciales (de la API o de una sección de la pantalla) sobre
 * la configuración actual y valida el resultado completo. Las claves que no
 * existen se ignoran.
 */
export function aplicarCambios(actual: ConfiguracionCobranza, cambios: unknown): ResultadoValidacion {
  if (!esObjeto(cambios)) return { ok: false, errores: ["Mandá un objeto con los campos a cambiar."] };
  const resultado = esquemaConfiguracion.safeParse(combinar(actual, cambios), { error: ERRORES_EN_CASTELLANO });
  if (!resultado.success) {
    return { ok: false, errores: resultado.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)) };
  }
  return { ok: true, config: resultado.data as ConfiguracionCobranza };
}
