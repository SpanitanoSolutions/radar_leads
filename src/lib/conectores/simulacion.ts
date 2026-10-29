import { sumarDias } from "@/lib/fechas";
import { documentosPara } from "@/lib/siniestros";
import type {
  Cancelacion,
  Cobertura,
  CuotaNormalizada,
  EstadoCompaniaCuota,
  EstadoPoliza,
  MedioPago,
  Moneda,
  Requisito,
  RespuestaCotizacion,
  SolicitudCotizacionConector,
} from "./tipos";

// Datos de las compañías simuladas: realistas para Argentina y siempre los
// mismos para la misma compañía y el mismo día, así los tests y el E2E son
// reproducibles.

/** Pseudoaleatorio con semilla (mulberry32): la misma semilla da la misma secuencia. */
export function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a de 32 bits. */
export function semillaDe(texto: string): number {
  let hash = 0x811c9dc5;
  for (const caracter of texto) {
    hash ^= caracter.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

const redondear = (monto: number) => Math.round(monto * 100) / 100;

/** "Federación Patronal" → "FP", "Sancor" → "SAN", "La Segunda" → "SEG". */
export function prefijoDe(compania: string): string {
  const palabras = compania.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .split(/[^A-Z]+/).filter((palabra) => palabra && !["LA", "EL", "DE", "SEGUROS", "ART"].includes(palabra));
  if (!palabras.length) return "CIA";
  return palabras.length === 1 ? palabras[0].slice(0, 3) : palabras.map((palabra) => palabra[0]).join("").slice(0, 3);
}

export function sumarMeses(iso: string, meses: number): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1 + meses, dia)).toISOString().slice(0, 10);
}

export type PolizaSimulada = {
  numero: string;
  ramo: string;
  item: string | null;
  endoso: string | null;
  cuotaTotal: number;
  /** Monto de cada cuota. */
  monto: number;
  moneda: Moneda;
  /** Vence una cuota por mes desde acá; la vigencia dura tantos meses como cuotas. */
  vigenciaDesde: string;
  medio: MedioPago;
  /** Cuántas de las últimas cuotas vencidas siguen sin pagar. */
  cuotasImpagas: number;
  /** La compañía la anula a los 30 días de la primera cuota impaga. */
  anulaPorFaltaDePago: boolean;
};

/** Seis pólizas por compañía (la flota con tres ítems), con una deuda y una anulación. */
export function carteraDeEjemplo(compania: string, hoy: string): PolizaSimulada[] {
  const prefijo = prefijoDe(compania);
  const azar = generador(semillaDe(compania));
  const numero = (ramo: string) => `${prefijo}-${ramo}-${1_000_000 + Math.floor(azar() * 9_000_000)}`;
  const monto = (minimo: number, maximo: number) => redondear(minimo + azar() * (maximo - minimo));
  const desde = (mesesAtras: number) => sumarMeses(`${hoy.slice(0, 7)}-10`, -mesesAtras);
  const base = { item: null, endoso: null, cuotasImpagas: 0, anulaPorFaltaDePago: false, moneda: "ARS" as const };
  const flota = numero("FL");
  const cuotaFlota = monto(70_000, 160_000);
  return [
    { ...base, numero: numero("AU"), ramo: "Auto", cuotaTotal: 12, monto: monto(38_000, 95_000), vigenciaDesde: desde(4), medio: "debito_tarjeta" },
    { ...base, numero: numero("AU"), ramo: "Auto", cuotaTotal: 6, monto: monto(45_000, 120_000), vigenciaDesde: desde(3), medio: "pago_facil", cuotasImpagas: 1 },
    { ...base, numero: numero("HO"), ramo: "Hogar", cuotaTotal: 12, monto: monto(12_000, 30_000), vigenciaDesde: desde(6), medio: "debito_cbu", cuotasImpagas: 2, anulaPorFaltaDePago: true },
    ...[1, 2, 3].map((item) => ({
      ...base,
      numero: flota,
      ramo: "Flota",
      item: `Ítem ${item}`,
      endoso: item === 3 ? "1" : null,
      cuotaTotal: 12,
      monto: cuotaFlota,
      vigenciaDesde: desde(2),
      medio: "transferencia" as const,
    })),
    { ...base, numero: numero("IC"), ramo: "Integral de comercio", cuotaTotal: 12, monto: monto(180, 420), moneda: "USD", vigenciaDesde: desde(5), medio: "transferencia" },
    { ...base, numero: numero("VI"), ramo: "Vida", cuotaTotal: 12, monto: monto(6_000, 15_000), vigenciaDesde: desde(8), medio: "mercadopago" },
  ];
}

export function vigenciaHasta(poliza: PolizaSimulada): string {
  return sumarMeses(poliza.vigenciaDesde, poliza.cuotaTotal);
}

/** Cuotas de una póliza (o de un ítem) al día `hoy`, con la fecha de anulación si la hubo. */
export function cuotasDe(compania: string, poliza: PolizaSimulada, hoy: string): { cuotas: CuotaNormalizada[]; anuladaEl: string | null } {
  const vencimientos = Array.from({ length: poliza.cuotaTotal }, (_, indice) => sumarMeses(poliza.vigenciaDesde, indice));
  const vencidas = vencimientos.filter((vencimiento) => vencimiento < hoy).length;
  const primeraImpaga = vencidas - poliza.cuotasImpagas;
  const anulacion = poliza.anulaPorFaltaDePago && poliza.cuotasImpagas > 0 && primeraImpaga >= 0 ? sumarDias(vencimientos[primeraImpaga], 30) : null;
  const anuladaEl = anulacion && anulacion <= hoy ? anulacion : null;
  const azar = generador(semillaDe(`${poliza.numero}|${poliza.item ?? ""}`));
  const digitos = poliza.numero.replace(/\D/g, "");
  const cuotas = vencimientos.map((vencimiento, indice): CuotaNormalizada => {
    let estado: EstadoCompaniaCuota = "pendiente";
    let fechaPago: string | null = null;
    if (anuladaEl && vencimiento > anuladaEl) estado = "anulada";
    else if (indice >= vencidas) estado = "pendiente";
    else if (indice >= primeraImpaga) estado = "vencida";
    else {
      estado = "pagada";
      const debito = poliza.medio === "debito_tarjeta" || poliza.medio === "debito_cbu";
      const pago = sumarDias(vencimiento, debito ? 0 : Math.floor(azar() * 9) - 5);
      fechaPago = pago < hoy ? pago : vencimiento;
    }
    return {
      compania,
      poliza: poliza.numero,
      item: poliza.item,
      endoso: poliza.endoso,
      cuotaN: indice + 1,
      cuotaTotal: poliza.cuotaTotal,
      cupon: `${digitos}${poliza.item ? poliza.item.replace(/\D/g, "") : "0"}${String(indice + 1).padStart(2, "0")}`,
      monto: poliza.monto,
      moneda: poliza.moneda,
      vencimiento,
      fechaPago,
      medio: estado === "pagada" ? poliza.medio : null,
      estadoCompania: estado,
    };
  });
  return { cuotas, anuladaEl };
}

export function cancelacionesDe(compania: string, cartera: PolizaSimulada[], hoy: string): Cancelacion[] {
  return cartera.flatMap((poliza) => {
    const { anuladaEl } = cuotasDe(compania, poliza, hoy);
    return anuladaEl ? [{ compania, poliza: poliza.numero, item: poliza.item, fecha: anuladaEl, motivo: "falta_de_pago" as const }] : [];
  });
}

const COBERTURAS_AUTO: Cobertura[] = [
  { codigo: "A", nombre: "Responsabilidad civil", franquicia: null },
  { codigo: "B1", nombre: "RC, robo e incendio total", franquicia: null },
  { codigo: "C", nombre: "Terceros completo", franquicia: null },
  { codigo: "C1", nombre: "Terceros completo con granizo", franquicia: null },
  { codigo: "D", nombre: "Todo riesgo con franquicia", franquicia: "$ 350.000" },
];

export const COBERTURAS_POR_RAMO: Record<string, Cobertura[]> = {
  Auto: COBERTURAS_AUTO,
  Flota: COBERTURAS_AUTO,
  Moto: COBERTURAS_AUTO.slice(0, 2),
  Hogar: [
    { codigo: "INC", nombre: "Incendio edificio", franquicia: null },
    { codigo: "CON", nombre: "Incendio contenido", franquicia: null },
    { codigo: "ROB", nombre: "Robo de contenido", franquicia: null },
    { codigo: "CRI", nombre: "Cristales", franquicia: "$ 40.000" },
    { codigo: "RCH", nombre: "Responsabilidad civil hechos privados", franquicia: null },
  ],
  "Integral de comercio": [
    { codigo: "INC", nombre: "Incendio edificio y contenido", franquicia: null },
    { codigo: "ROB", nombre: "Robo de mercadería y valores", franquicia: "10% del siniestro" },
    { codigo: "RCL", nombre: "Responsabilidad civil comprensiva", franquicia: null },
  ],
  Vida: [
    { codigo: "FAL", nombre: "Fallecimiento", franquicia: null },
    { codigo: "ITP", nombre: "Invalidez total y permanente", franquicia: null },
  ],
  AP: [
    { codigo: "MUE", nombre: "Muerte accidental", franquicia: null },
    { codigo: "INV", nombre: "Invalidez permanente", franquicia: null },
    { codigo: "AMF", nombre: "Asistencia médico-farmacéutica", franquicia: null },
  ],
};

export function coberturasDe(ramo: string): Cobertura[] {
  return COBERTURAS_POR_RAMO[ramo] ?? [{ codigo: "BAS", nombre: "Cobertura básica", franquicia: null }];
}

export function estadoPolizaDe(compania: string, items: PolizaSimulada[], fecha: string, hoy: string): EstadoPoliza {
  const [poliza] = items;
  const hasta = vigenciaHasta(poliza);
  const detalles = items.map((item) => cuotasDe(compania, item, hoy));
  const anuladaEl = detalles.find((detalle) => detalle.anuladaEl)?.anuladaEl ?? null;
  const estado = anuladaEl && fecha >= anuladaEl ? "anulada" : fecha < poliza.vigenciaDesde || fecha >= hasta ? "no_vigente" : "vigente";
  const coberturas = coberturasDe(poliza.ramo);
  return {
    numero: poliza.numero,
    ramo: poliza.ramo,
    estado,
    vigenciaDesde: poliza.vigenciaDesde,
    vigenciaHasta: hasta,
    deudaVencida: detalles.some(({ cuotas }) => cuotas.some((cuota) => cuota.estadoCompania === "vencida" && cuota.vencimiento <= fecha)),
    coberturas: [coberturas[semillaDe(poliza.numero) % coberturas.length].nombre],
  };
}

export function requisitosDe(tipoSiniestro: string): Requisito[] {
  return documentosPara(tipoSiniestro).map((nombre, indice) => ({
    codigo: `${tipoSiniestro}-${indice + 1}`,
    nombre: nombre.replace(/\s*\(si la tiene\)$/, ""),
    obligatorio: !nombre.endsWith("(si la tiene)"),
  }));
}

/** Prima anual estimada: un porcentaje de la suma asegurada o un rango típico del ramo. */
export function cotizacionSimulada(
  compania: string,
  solicitud: SolicitudCotizacionConector,
  coberturasPedidas: string[],
  numero: string,
  hoy: string,
): RespuestaCotizacion {
  const disponibles = coberturasDe(solicitud.ramo);
  const coberturas = coberturasPedidas.length ? disponibles.filter((cobertura) => coberturasPedidas.includes(cobertura.codigo)) : disponibles.slice(-1);
  if (!coberturas.length) return { estado: "rechazada", numero, motivo: `${compania} no ofrece esas coberturas para ${solicitud.ramo}.` };
  const azar = generador(semillaDe(`${compania}|${solicitud.referencia}`));
  const anual = solicitud.sumaAsegurada
    ? solicitud.sumaAsegurada * (0.025 + azar() * 0.02)
    : solicitud.moneda === "USD" ? 1_500 + azar() * 2_500 : 420_000 + azar() * 600_000;
  const primaNeta = redondear(anual * (1 + 0.12 * (coberturas.length - 1)));
  const desde = solicitud.vigenciaDesde ?? hoy;
  return {
    estado: "cotizada",
    numero,
    primaNeta,
    // IVA, sellados y recargos financieros.
    premio: redondear(primaNeta * 1.31),
    moneda: solicitud.moneda,
    coberturas,
    vigencia: { desde, hasta: sumarMeses(desde, 12) },
    validaHasta: sumarDias(hoy, 15),
  };
}

/** PDF mínimo válido de una página, para las constancias que "descarga" el simulador. */
export function pdfSimple(texto: string): Buffer {
  const linea = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/[\\()]/g, "\\$&");
  const contenido = `BT /F1 12 Tf 72 760 Td (${linea}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const posiciones = objetos.map((objeto, indice) => {
    const posicion = pdf.length;
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
    return posicion;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((posicion) => `${String(posicion).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
