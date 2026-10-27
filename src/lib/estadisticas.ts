export type AseguradoEstadistica = { id: number };

export type PolizaEstadistica = {
  id: number;
  aseguradoId: number;
  ramo: string;
  compania: string | null;
  prima: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
};

export type CuotaEstadistica = {
  polizaId: number;
  monto: number;
  estado: "pendiente" | "pagada" | "vencida";
  vencimiento: string;
  pagadaEl: Date | null;
};

export type AcuerdoEstadistica = { compania: string; ramo: string; porcentaje: number };
export type LiquidacionEstadistica = {
  compania: string;
  periodo: string;
  montoLiquidado: number;
  depositado: number | null;
  depositadoEl: string | null;
};
export type SiniestroEstadistica = {
  etapa: string;
  fecha: Date;
  cerrado: boolean;
  cerradoEl: Date | null;
  montoAprobado: number | null;
  montoPagado: number | null;
};
export type SolicitudEstadistica = { estado: string; creadoEl: Date };

export type DatosEstadisticas = {
  hoy: string;
  asegurados: AseguradoEstadistica[];
  polizas: PolizaEstadistica[];
  cuotas: CuotaEstadistica[];
  acuerdos: AcuerdoEstadistica[];
  liquidaciones: LiquidacionEstadistica[];
  siniestros: SiniestroEstadistica[];
  solicitudes: SolicitudEstadistica[];
};

export type FilaDistribucion = { nombre: string; polizas: number; prima: number; participacion: number };
export type FilaMes = {
  id: string;
  mes: string;
  cuotas: number;
  primaCobrada: number;
  comisionEstimada: number;
  comisionLiquidada: number;
  comisionDepositada: number;
};

const ETAPAS_SINIESTRO: { id: string; nombre: string }[] = [
  { id: "aviso", nombre: "Aviso" },
  { id: "documentacion", nombre: "Documentación" },
  { id: "compania", nombre: "En la compañía" },
  { id: "inspeccion", nombre: "Inspección" },
  { id: "liquidacion", nombre: "Liquidación" },
  { id: "pago", nombre: "Pago" },
];

function claveMes(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(fecha);
}

function diasEntre(inicio: string, fin: string): number {
  const [anioInicio, mesInicio, diaInicio] = inicio.split("-").map(Number);
  const [anioFin, mesFin, diaFin] = fin.split("-").map(Number);
  return Math.round((Date.UTC(anioFin, mesFin - 1, diaFin) - Date.UTC(anioInicio, mesInicio - 1, diaInicio)) / 86_400_000);
}

function fechaAnio(fecha: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric" }).format(fecha));
}

function porcentaje(valor: number, total: number): number {
  return total ? Math.round((valor / total) * 1000) / 10 : 0;
}

export function calcularEstadisticas(datos: DatosEstadisticas, anio: number) {
  const hoy = datos.hoy;
  const polizasPorId = new Map(datos.polizas.map((poliza) => [poliza.id, poliza]));
  const acuerdos = new Map(datos.acuerdos.map((acuerdo) => [`${acuerdo.compania}\0${acuerdo.ramo}`, acuerdo.porcentaje]));
  const vigentes = datos.polizas.filter(
    (poliza) =>
      (poliza.vigenciaDesde === null || poliza.vigenciaDesde <= hoy) &&
      (poliza.vigenciaHasta === null || poliza.vigenciaHasta >= hoy),
  );
  const primaAnual = vigentes.reduce((suma, poliza) => suma + (poliza.prima ?? 0), 0);

  const distribucion = (clave: (poliza: PolizaEstadistica) => string) => {
    const grupos = new Map<string, { polizas: number; prima: number }>();
    for (const poliza of vigentes) {
      const nombre = clave(poliza);
      const fila = grupos.get(nombre) ?? { polizas: 0, prima: 0 };
      fila.polizas++;
      fila.prima += poliza.prima ?? 0;
      grupos.set(nombre, fila);
    }
    return [...grupos]
      .map(([nombre, fila]): FilaDistribucion => ({
        nombre,
        ...fila,
        participacion: porcentaje(fila.prima, primaAnual),
      }))
      .sort((a, b) => b.prima - a.prima || b.polizas - a.polizas || a.nombre.localeCompare(b.nombre, "es"));
  };

  const meses = Array.from({ length: 12 }, (_, indice): FilaMes => {
    const fecha = new Date(Date.UTC(anio, indice, 1));
    const id = `${anio}-${String(indice + 1).padStart(2, "0")}`;
    return {
      id,
      mes: new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(fecha),
      cuotas: 0,
      primaCobrada: 0,
      comisionEstimada: 0,
      comisionLiquidada: 0,
      comisionDepositada: 0,
    };
  });
  const mesPorId = new Map(meses.map((mes) => [mes.id, mes]));
  for (const cuota of datos.cuotas) {
    if (cuota.estado !== "pagada" || !cuota.pagadaEl || fechaAnio(cuota.pagadaEl) !== anio) continue;
    const mes = mesPorId.get(claveMes(cuota.pagadaEl));
    const poliza = polizasPorId.get(cuota.polizaId);
    if (!mes) continue;
    mes.cuotas++;
    mes.primaCobrada += cuota.monto;
    const compania = poliza?.compania;
    const tasa = compania ? acuerdos.get(`${compania}\0${poliza?.ramo}`) : undefined;
    if (tasa !== undefined) mes.comisionEstimada += (cuota.monto * tasa) / 100;
  }
  for (const liquidacion of datos.liquidaciones) {
    if (liquidacion.periodo.startsWith(`${anio}-`)) {
      const mes = mesPorId.get(liquidacion.periodo);
      if (mes) mes.comisionLiquidada += liquidacion.montoLiquidado;
    }
    if (liquidacion.depositado !== null && liquidacion.depositadoEl?.startsWith(`${anio}-`)) {
      const mes = mesPorId.get(liquidacion.depositadoEl.slice(0, 7));
      if (mes) mes.comisionDepositada += liquidacion.depositado;
    }
  }

  const cobranza = [
    { id: "pagada", nombre: "Pagadas", polizas: 0, monto: 0 },
    { id: "vencida", nombre: "Vencidas", polizas: 0, monto: 0 },
    { id: "pendiente", nombre: "Pendientes", polizas: 0, monto: 0 },
  ];
  const estadoCobranza = new Map(cobranza.map((fila) => [fila.id, fila]));
  for (const cuota of datos.cuotas) {
    const estado = cuota.estado === "pagada" ? "pagada" : cuota.vencimiento < hoy ? "vencida" : "pendiente";
    const fila = estadoCobranza.get(estado);
    if (fila) {
      fila.polizas++;
      fila.monto += cuota.monto;
    }
  }

  const renovaciones = new Map<string, { polizas: number; prima: number }>();
  for (const poliza of vigentes) {
    if (!poliza.vigenciaHasta) continue;
    const dias = diasEntre(hoy, poliza.vigenciaHasta);
    if (dias < 0 || dias > 90) continue;
    const mes = poliza.vigenciaHasta.slice(0, 7);
    const fila = renovaciones.get(mes) ?? { polizas: 0, prima: 0 };
    fila.polizas++;
    fila.prima += poliza.prima ?? 0;
    renovaciones.set(mes, fila);
  }
  const vencimientosProximos = [...renovaciones]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, fila]) => ({
      id,
      mes: new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${id}-01T00:00:00Z`)),
      ...fila,
    }));

  const siniestrosPorEtapa = ETAPAS_SINIESTRO.map((etapa) => ({
    ...etapa,
    cantidad: datos.siniestros.filter((siniestro) => !siniestro.cerrado && siniestro.etapa === etapa.id).length,
  }));
  const cerrados = datos.siniestros.filter((siniestro) => siniestro.cerrado && siniestro.cerradoEl);
  const duraciones = cerrados.map((siniestro) => diasEntre(siniestro.fecha.toISOString().slice(0, 10), siniestro.cerradoEl!.toISOString().slice(0, 10)));
  const solicitudesAnio = datos.solicitudes.filter((solicitud) => fechaAnio(solicitud.creadoEl) === anio);
  const estadosSolicitud = [
    { id: "atencion", nombre: "Requieren atención" },
    { id: "esperando", nombre: "Esperando compañías" },
    { id: "lista", nombre: "Comparativa lista" },
    { id: "enviada", nombre: "Enviadas al cliente" },
    { id: "ganada", nombre: "Ganadas" },
    { id: "perdida", nombre: "Perdidas" },
  ].map((estado) => ({ ...estado, cantidad: solicitudesAnio.filter((solicitud) => solicitud.estado === estado.id).length }));
  const cotizacionesGanadas = estadosSolicitud.find((estado) => estado.id === "ganada")?.cantidad ?? 0;
  const cotizacionesCerradas =
    (estadosSolicitud.find((estado) => estado.id === "ganada")?.cantidad ?? 0) +
    (estadosSolicitud.find((estado) => estado.id === "perdida")?.cantidad ?? 0);

  return {
    anio,
    asegurados: datos.asegurados.length,
    polizasVigentes: vigentes.length,
    primaAnual,
    primaPromedio: vigentes.length ? Math.round(primaAnual / vigentes.length) : 0,
    cuotasCobradas: meses.reduce((suma, mes) => suma + mes.primaCobrada, 0),
    cuotasPagadasAnio: meses.reduce((suma, mes) => suma + mes.cuotas, 0),
    comisionEstimadaAnio: meses.reduce((suma, mes) => suma + mes.comisionEstimada, 0),
    comisionLiquidadaAnio: meses.reduce((suma, mes) => suma + mes.comisionLiquidada, 0),
    comisionDepositadaAnio: meses.reduce((suma, mes) => suma + mes.comisionDepositada, 0),
    meses,
    porCompania: distribucion((poliza) => poliza.compania ?? "Sin compañía"),
    porRamo: distribucion((poliza) => poliza.ramo),
    cobranza,
    vencimientosProximos,
    siniestros: {
      abiertos: datos.siniestros.filter((siniestro) => !siniestro.cerrado).length,
      cerrados: cerrados.length,
      indemnizacionAprobada: datos.siniestros.reduce((suma, siniestro) => suma + (siniestro.montoAprobado ?? 0), 0),
      indemnizacionPagada: datos.siniestros.reduce((suma, siniestro) => suma + (siniestro.montoPagado ?? 0), 0),
      promedioCierreDias: duraciones.length ? Math.round(duraciones.reduce((suma, dias) => suma + dias, 0) / duraciones.length) : null,
      porEtapa: siniestrosPorEtapa,
    },
    cotizaciones: {
      total: solicitudesAnio.length,
      cerradas: cotizacionesCerradas,
      ganadas: cotizacionesGanadas,
      tasaGanada: cotizacionesCerradas ? cotizacionesGanadas / cotizacionesCerradas : 0,
      estados: estadosSolicitud,
    },
  };
}