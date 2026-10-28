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
  { id: "accidentes_personales", nombre: "Accidentes personales" },
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
  accidentes_personales: ["Relato del hecho", "Constancia de cobertura", "Comprobantes de gastos reclamados", "Datos de contacto del afectado"],
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
  contexto: { ahora: Date; compania: string; plazoDenunciaDias?: number; diasSinNovedades?: number; contacto: string },
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
      texto: `${quien} avisó ${cuandoAviso(s.fecha, contexto.ahora)}${canal ? ` por ${canal}` : ""}. La denuncia está como borrador. Revisala y aprobá su envío cuando esté lista.`,
      acciones: ["enviarDenuncia", "editarDenuncia"],
    };
  }

  if ((s.etapa === "aviso" || s.etapa === "documentacion") && faltan.length) {
    if (s.recordatorioEnviadoEl) {
      return {
        tono: "espera",
        titulo: "Recordatorio enviado",
        texto: `Ya se envió a ${quien} el pedido de lo que falta (${unir(faltan).toLowerCase()}). Registrá aquí la respuesta o prepará un nuevo contacto.`,
        acciones: [],
      };
    }
    const plazo = sumarDias(diaEnArgentina(s.fecha), contexto.plazoDenunciaDias ?? PLAZO_DENUNCIA_DIAS);
    const restan = diasEntre(hoy, plazo);
    const cuando = restan < 0 ? "ya venció" : restan === 0 ? "vence hoy" : restan === 1 ? "vence mañana" : `vence el ${diaYMes(plazo)}`;
    return {
      tono: restan < 0 ? "alerta" : "accion",
      titulo: faltan.length === 1 ? "Falta un documento para presentar" : `Faltan ${faltan.length} documentos para presentar`,
      texto: `${quien} mandó todo menos ${unir(faltan).toLowerCase()}. El plazo operativo configurado para ${cia} es de ${contexto.plazoDenunciaDias ?? PLAZO_DENUNCIA_DIAS} días desde el hecho y ${cuando}.`,
      acciones: ["recordar", "llamar"],
    };
  }

  if (s.etapa === "compania" || s.etapa === "documentacion" || s.etapa === "aviso") {
    if (s.reclamoEnviadoEl && diasEntre(diaEnArgentina(s.reclamoEnviadoEl), hoy) < 5) {
      return {
        tono: "espera",
        titulo: `Reclamo enviado a ${cia}`,
        texto: "El reclamo quedó enviado. El seguimiento continúa según los plazos configurados para esta compañía.",
        acciones: [],
      };
    }
    const desde = s.ultimaNovedadCompaniaEl ?? s.denunciaEnviadaEl;
    const sinNovedades = desde ? diasEntre(diaEnArgentina(desde), hoy) : 0;
    if (sinNovedades > (contexto.diasSinNovedades ?? DIAS_SIN_NOVEDADES)) {
      return {
        tono: "alerta",
        titulo: `${sinNovedades} días sin novedades de la compañía`,
        texto: `La documentación está completa${s.denunciaEnviadaEl ? ` desde el ${diaYMes(diaEnArgentina(s.denunciaEnviadaEl))}` : ""} y ${cia} todavía no dio novedades. Podés revisar el borrador de reclamo antes de enviarlo.`,
        acciones: ["enviarReclamo", "verReclamo"],
      };
    }
    return {
      tono: "espera",
      titulo: `Denuncia presentada en ${cia}`,
      texto: "Registrá aquí las novedades de la compañía. El agente marcará el seguimiento cuando se cumpla el plazo operativo configurado.",
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
      texto: `La inspección está registrada para ${contexto.contacto}. Revisá con el asegurado si necesita instrucciones antes de la visita.`,
      acciones: [],
    };
  }

  if (s.etapa === "liquidacion" && s.montoAprobado) {
    return {
      tono: "ok",
      titulo: `${cia} aprobó la indemnización: ${pesos(s.montoAprobado)}`,
      texto: `La compañía aprobó el importe. Registrá el pago cuando se acredite y avisá a ${contexto.contacto}.`,
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
    texto: "Registrá aquí las novedades de la compañía para mantener actualizado el expediente.",
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
