import type { EtapaSiniestro } from "@/db/schema";
import { diaEnArgentina, diaDeLaSemana, diaYMes, diasEntre, sumarDias } from "./fechas";
import { pesos } from "./formato";

// Siniestros: etapas del trámite, qué documentación hace falta según el tipo,
// los plazos (denuncia a los 3 días, reclamo a los 14 sin novedades) y qué
// le toca hacer al productor ahora.

export const ETAPAS: { id: EtapaSiniestro; nombre: string }[] = [
  { id: "aviso", nombre: "Aviso" },
  { id: "documentacion", nombre: "Documentación" },
  { id: "compania", nombre: "En la compañía" },
  { id: "inspeccion", nombre: "Inspección" },
  { id: "liquidacion", nombre: "Liquidación" },
  { id: "pago", nombre: "Pago" },
];

export function nombreEtapa(etapa: EtapaSiniestro): string {
  return ETAPAS.find((e) => e.id === etapa)?.nombre ?? etapa;
}

export function indiceEtapa(etapa: EtapaSiniestro): number {
  return ETAPAS.findIndex((e) => e.id === etapa);
}

export const TIPOS_SINIESTRO = [
  { id: "choque_tercero", nombre: "Choque con un tercero" },
  { id: "agua", nombre: "Daños por agua" },
  { id: "robo", nombre: "Robo" },
  { id: "cristales", nombre: "Rotura de cristales" },
  { id: "granizo", nombre: "Granizo" },
  { id: "carga", nombre: "Faltante o daño de carga" },
  { id: "otro", nombre: "Otro" },
] as const;

/** Lo que pide la compañía según el tipo de siniestro. */
export const DOCUMENTOS_POR_TIPO: Record<string, string[]> = {
  choque_tercero: [
    "Fotos del vehículo",
    "Registro de conducir y cédula verde",
    "Datos y póliza del tercero",
    "Croquis del choque",
    "Denuncia firmada por el asegurado",
  ],
  agua: ["Relato del hecho", "Fotos de los daños", "Copia de DNI", "Presupuesto del arreglo", "Factura o foto de compra de lo dañado (si la tiene)"],
  robo: ["Denuncia policial", "Facturas o fotos de lo robado", "Copia de DNI", "Denuncia firmada por el asegurado"],
  cristales: ["Denuncia firmada", "Fotos del cristal roto", "Presupuesto de cristalería"],
  granizo: ["Denuncia firmada", "Fotos del vehículo"],
  carga: ["Denuncia y remitos", "Denuncia policial", "Factura de la mercadería"],
  otro: ["Relato del hecho", "Fotos", "Denuncia firmada por el asegurado"],
};

export function documentosPara(tipo: string): string[] {
  return DOCUMENTOS_POR_TIPO[tipo] ?? DOCUMENTOS_POR_TIPO.otro;
}

export const PLAZO_DENUNCIA_DIAS = 3;
export const DIAS_SIN_NOVEDADES = 14;

export type SiniestroParaReglas = {
  etapa: EtapaSiniestro;
  fecha: Date;
  creadoEl: Date;
  avisoDe: string | null;
  denuncia: { campo: string; valor: string }[] | null;
  denunciaEnviadaEl: Date | null;
  ultimaNovedadCompaniaEl: Date | null;
  reclamoEnviadoEl: Date | null;
  recordatorioEnviadoEl: Date | null;
  inspeccionEl: Date | null;
  montoAprobado: number | null;
  montoPagado: number | null;
  pagadoEl: Date | null;
  cerrado: boolean;
  cerradoEl: Date | null;
  resolucion: string | null;
};

export type AccionSiniestro = "enviarDenuncia" | "editarDenuncia" | "recordar" | "llamar" | "enviarReclamo" | "verReclamo" | "cerrar";

export type Ahora = {
  tono: "accion" | "alerta" | "espera" | "ok";
  titulo: string;
  texto: string;
  acciones: AccionSiniestro[];
};

/** "Carolina por WhatsApp" → { quien: "Carolina", canal: "WhatsApp" }. */
function partesAviso(avisoDe: string | null) {
  const m = /^(.*?) por (.*)$/.exec(avisoDe ?? "");
  return m ? { quien: m[1], canal: m[2] } : { quien: avisoDe ?? "El asegurado", canal: null };
}

/** "ayer a la noche", "hoy a la mañana", "el 12/10". */
export function cuandoAviso(fecha: Date, ahora: Date): string {
  const dia = diaEnArgentina(fecha);
  const dias = diasEntre(dia, diaEnArgentina(ahora));
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false }).format(fecha));
  const momento = hora < 12 ? "a la mañana" : hora < 19 ? "a la tarde" : "a la noche";
  if (dias === 0) return `hoy ${momento}`;
  if (dias === 1) return `ayer ${momento}`;
  return `el ${diaYMes(dia)}`;
}

function unir(lista: string[]): string {
  return lista.length <= 1 ? (lista[0] ?? "") : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`;
}

/** Qué le toca hacer al productor con este siniestro, con su tono y acciones. */
export function ahoraDe(
  s: SiniestroParaReglas,
  faltan: string[],
  contexto: { ahora: Date; compania: string; plazoDenunciaDias?: number; contacto: string },
): Ahora {
  const hoy = diaEnArgentina(contexto.ahora);
  const cia = contexto.compania;
  const { quien, canal } = partesAviso(s.avisoDe);

  if (s.cerrado) {
    const cerrado = s.cerradoEl ?? s.pagadoEl ?? contexto.ahora;
    const duracion = diasEntre(diaEnArgentina(s.fecha), diaEnArgentina(cerrado));
    const titulo = s.montoPagado
      ? `Cerrado · pagado ${pesos(s.montoPagado)} el ${diaYMes(diaEnArgentina(s.pagadoEl ?? cerrado))}`
      : `Cerrado · ${s.resolucion ?? "resuelto"} el ${diaYMes(diaEnArgentina(cerrado))}`;
    return { tono: "ok", titulo, texto: `Trámite resuelto en ${duracion === 1 ? "1 día" : `${duracion} días`}.`, acciones: [] };
  }

  if (s.etapa === "aviso" && s.denuncia?.length && !s.denunciaEnviadaEl) {
    return {
      tono: "accion",
      titulo: `La denuncia está lista para mandar a ${cia}`,
      texto: `${quien} avisó ${cuandoAviso(s.fecha, contexto.ahora)}${canal ? ` por ${canal}` : ""}. El agente le pidió fotos y los datos que pide ${cia}, y armó la denuncia. Revisala y aprobala para enviarla.`,
      acciones: ["enviarDenuncia", "editarDenuncia"],
    };
  }

  if ((s.etapa === "aviso" || s.etapa === "documentacion") && faltan.length) {
    if (s.recordatorioEnviadoEl) {
      return {
        tono: "espera",
        titulo: "Recordatorio enviado",
        texto: `El agente le mandó a ${quien} lo que falta (${unir(faltan).toLowerCase()}). Si no llega, te avisa.`,
        acciones: [],
      };
    }
    const plazo = sumarDias(diaEnArgentina(s.fecha), contexto.plazoDenunciaDias ?? PLAZO_DENUNCIA_DIAS);
    const restan = diasEntre(hoy, plazo);
    const cuando = restan < 0 ? "ya venció" : restan === 0 ? "vence hoy" : restan === 1 ? "vence mañana" : `vence el ${diaYMes(plazo)}`;
    return {
      tono: restan < 0 ? "alerta" : "accion",
      titulo: faltan.length === 1 ? "Falta un documento para presentar" : `Faltan ${faltan.length} documentos para presentar`,
      texto: `${quien} mandó todo menos ${unir(faltan).toLowerCase()}. ${cia} la pide dentro de los ${contexto.plazoDenunciaDias ?? PLAZO_DENUNCIA_DIAS} días del hecho y el plazo ${cuando}.`,
      acciones: ["recordar", "llamar"],
    };
  }

  if (s.etapa === "compania" || s.etapa === "documentacion" || s.etapa === "aviso") {
    if (s.reclamoEnviadoEl && diasEntre(diaEnArgentina(s.reclamoEnviadoEl), hoy) < 5) {
      return {
        tono: "espera",
        titulo: `Reclamo enviado a ${cia}`,
        texto: "Si no hay respuesta en 3 días hábiles, el agente te lo vuelve a marcar.",
        acciones: [],
      };
    }
    const desde = s.ultimaNovedadCompaniaEl ?? s.denunciaEnviadaEl;
    const sinNovedades = desde ? diasEntre(diaEnArgentina(desde), hoy) : 0;
    if (sinNovedades > DIAS_SIN_NOVEDADES) {
      return {
        tono: "alerta",
        titulo: `${sinNovedades} días sin novedades de la compañía`,
        texto: `La documentación está completa${s.denunciaEnviadaEl ? ` desde el ${diaYMes(diaEnArgentina(s.denunciaEnviadaEl))}` : ""} y ${cia} todavía no dio novedades. El agente preparó un reclamo para el área de siniestros.`,
        acciones: ["enviarReclamo", "verReclamo"],
      };
    }
    return {
      tono: "espera",
      titulo: `Denuncia presentada en ${cia}`,
      texto: "El agente consulta el estado en el portal y te avisa si hay novedades o si pasan 14 días sin respuesta.",
      acciones: [],
    };
  }

  if (s.etapa === "inspeccion" && s.inspeccionEl) {
    const dia = diaEnArgentina(s.inspeccionEl);
    const hora = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(s.inspeccionEl);
    return {
      tono: "espera",
      titulo: `Inspección agendada para el ${diaDeLaSemana(dia)} a las ${hora}`,
      texto: `El agente le confirmó el horario a ${contexto.contacto} y le va a recordar el día anterior que no arregle nada antes de la inspección.`,
      acciones: [],
    };
  }

  if (s.etapa === "liquidacion" && s.montoAprobado) {
    return {
      tono: "ok",
      titulo: `${cia} aprobó la indemnización: ${pesos(s.montoAprobado)}`,
      texto: `La compañía informa el pago en los próximos días. El agente ya le avisó a ${contexto.contacto} y va a controlar que el dinero llegue.`,
      acciones: [],
    };
  }

  if (s.etapa === "pago" && s.montoPagado) {
    return {
      tono: "ok",
      titulo: `Pagado ${pesos(s.montoPagado)}${s.pagadoEl ? ` el ${diaYMes(diaEnArgentina(s.pagadoEl))}` : ""}`,
      texto: "Ya se puede cerrar el siniestro.",
      acciones: ["cerrar"],
    };
  }

  return {
    tono: "espera",
    titulo: `${nombreEtapa(s.etapa)} en ${cia}`,
    texto: "El agente consulta el estado en el portal y te avisa si hay novedades.",
    acciones: [],
  };
}

export function requiereAtencion(a: Ahora): boolean {
  return a.tono === "accion" || a.tono === "alerta";
}

/** "Nuevo": llegó en las últimas 24 h y todavía no se mandó la denuncia. */
export function esNuevo(s: Pick<SiniestroParaReglas, "creadoEl" | "denunciaEnviadaEl">, ahora: Date): boolean {
  const transcurrido = ahora.getTime() - s.creadoEl.getTime();
  return !s.denunciaEnviadaEl && transcurrido >= 0 && transcurrido < 24 * 3_600_000;
}

/** Reclamo por demora para el área de siniestros de la compañía. La firma se completa al enviar. */
export function textoReclamo(s: { numeroCompania: string | null; descripcion: string; fecha: Date; denunciaEnviadaEl: Date | null }, cliente: string): string {
  return [
    "Hola, ¿cómo están?",
    "",
    `Les escribo por el siniestro ${s.numeroCompania ?? "(todavía sin número)"} de ${cliente} (${s.descripcion.toLowerCase()}, del ${diaYMes(diaEnArgentina(s.fecha))}).`,
    `La documentación está completa${s.denunciaEnviadaEl ? ` desde el ${diaYMes(diaEnArgentina(s.denunciaEnviadaEl))}` : ""} y todavía no tenemos novedades. ¿Nos podrán informar el estado y, si corresponde, asignar perito?`,
    "",
    "Gracias,",
    "{productor}",
  ].join("\n");
}

export function kpisSiniestros(
  lista: { cerrado: boolean; etapa: EtapaSiniestro; aseguradoId: number; atencion: boolean; fecha: Date; cerradoEl: Date | null }[],
  ahora: Date,
) {
  const abiertos = lista.filter((s) => !s.cerrado);
  const hace6Meses = ahora.getTime() - 183 * 86_400_000;
  const cerrados = lista.filter((s) => s.cerrado && s.cerradoEl && s.cerradoEl.getTime() >= hace6Meses);
  const duraciones = cerrados.map((s) => diasEntre(diaEnArgentina(s.fecha), diaEnArgentina(s.cerradoEl!)));
  return {
    abiertos: abiertos.length,
    asegurados: new Set(abiertos.map((s) => s.aseguradoId)).size,
    atencion: abiertos.filter((s) => s.atencion).length,
    juntandoDocumentacion: abiertos.filter((s) => indiceEtapa(s.etapa) <= 1).length,
    promedioCierre: duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null,
  };
}
