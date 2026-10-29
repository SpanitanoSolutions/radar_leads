/**
 * Demo del Validador de pagos v2 (docs/specs/validador-v2.md, sección 9): 6
 * compañías con las pólizas que devuelven los conectores simulados
 * (carteraDeEjemplo), cuotas en ARS y USD en todos los estados, 2 listados y
 * 5 comprobantes sueltos. Lo llama sembrarCartera() dentro de su transacción.
 *
 * Las fechas de los conectores simulados dependen del mes en curso: si cambió
 * el mes desde que se sembró, la validación ya no coincide y hay que volver a
 * sembrar (npm run db:seed).
 */
import { and, desc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { CuentaCompania, EstadoCuota, EstadoValidacion, OrigenConfirmacion } from "../src/db/schema";
import { carteraDeEjemplo, coberturasDe, cuotasDe, pdfSimple, semillaDe, vigenciaHasta } from "../src/lib/conectores/simulacion";
import type { CuotaNormalizada, Moneda } from "../src/lib/conectores/tipos";
import { sumarDias } from "../src/lib/fechas";
import { companiaCanonica, leerArchivoTabla } from "../src/lib/importacion";
import { cobrosParaComprobante, companiaDeDestino, comprobanteParaMatch, type ComprobanteExtraido } from "../src/lib/validador/comprobantes";
import { calcularEstado, ETIQUETA_MEDIO, estadoCuotaDe } from "../src/lib/validador/estados";
import { faltanEnMapeo, leerListado, OPERACION_LISTADO, proponerMapeoPorSinonimos } from "../src/lib/validador/listados";
import { proponerCobros } from "../src/lib/validador/matching";
import { VENTANA } from "../src/lib/validador/pantalla";
import { procesarFuente } from "../src/lib/validador/procesar";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Las compañías del Validador: el cron les consulta la cobranza a los conectores simulados. */
export const COMPANIAS_VALIDADOR = ["Mapfre", "Sancor", "Federación Patronal", "La Segunda", "San Cristóbal", "Rivadavia"];

/** Días de gracia [1.ª cuota, siguientes]. 30 como siempre, salvo las dos compañías nuevas, para que haya vencidas. */
export function graciaDeEjemplo(compania: string): [number, number] {
  return ({ "San Cristóbal": [15, 15], Rivadavia: [30, 10] } as Record<string, [number, number]>)[compania] ?? [30, 30];
}

/** Comisión por ramo de las pólizas del Validador, para las liquidaciones de ejemplo. */
export const ACUERDOS_VALIDADOR: Record<string, Record<string, number>> = {
  Sancor: { Auto: 15, Flota: 12, Vida: 20 },
  "Federación Patronal": { Hogar: 20, "Integral de comercio": 20 },
  "La Segunda": { Hogar: 20, Flota: 12, Vida: 20 },
  "San Cristóbal": { Auto: 15, Hogar: 20, Flota: 12, "Integral de comercio": 20, Vida: 20 },
  Rivadavia: { Auto: 15, Hogar: 20, Flota: 12, "Integral de comercio": 20, Vida: 20 },
};

type Dueno = { nombre: string; documento: string; localidad: string; desde: number; tel: string | null; email: string | null; contacto?: string };

/**
 * Un asegurado por póliza (el matching de comprobantes junta en un cobro las
 * cuotas del mismo asegurado que vencen el mismo día): [Auto en 12 cuotas e
 * Integral de comercio en USD, Auto en 6 cuotas, Hogar, Vida, la empresa de la flota].
 */
const DUENOS: Record<string, Dueno[]> = {
  Mapfre: [
    { nombre: "Benítez, Sofía", documento: "27-33912450-1", localidad: "Mar del Plata", desde: 2021, tel: "223 541-2093", email: "sbenitez@ejemplo.com.ar" },
    { nombre: "Quiroga, Pablo", documento: "20-29188734-5", localidad: "Mar del Plata", desde: 2019, tel: "223 456-7781", email: "pquiroga@ejemplo.com.ar" },
    { nombre: "Navarro, Inés", documento: "27-28456102-8", localidad: "Batán", desde: 2023, tel: "223 467-0012", email: null },
    { nombre: "Cabrera, Tomás", documento: "20-35671209-4", localidad: "Mar del Plata", desde: 2022, tel: "223 512-9934", email: "tcabrera@ejemplo.com.ar" },
    { nombre: "Frigorífico Puerto Norte SA", documento: "30-71120988-4", localidad: "Mar del Plata", desde: 2016, tel: "223 480-1150", email: "compras@ejemplo.com.ar", contacto: "Silvia Peralta (compras)" },
  ],
  Sancor: [
    { nombre: "Medina, Julieta", documento: "27-36188420-9", localidad: "Mar del Plata", desde: 2020, tel: "223 600-4471", email: "jmedina@ejemplo.com.ar" },
    { nombre: "Castro, Andrés", documento: "20-31877456-2", localidad: "Miramar", desde: 2024, tel: "2291 41-5530", email: "acastro@ejemplo.com.ar" },
    { nombre: "Suárez, Lorena", documento: "27-25334871-0", localidad: "Mar del Plata", desde: 2018, tel: "223 474-3381", email: "lsuarez@ejemplo.com.ar" },
    { nombre: "Giménez, Raúl", documento: "20-22189054-7", localidad: "Balcarce", desde: 2017, tel: "2266 42-1180", email: null },
    { nombre: "Agroinsumos del Sudeste SRL", documento: "30-71498230-7", localidad: "Balcarce", desde: 2021, tel: "2266 43-9020", email: "administracion@ejemplo.com.ar", contacto: "Hugo Ferreyra (socio)" },
  ],
  "Federación Patronal": [
    { nombre: "Luna, Mariana", documento: "27-30455987-3", localidad: "Mar del Plata", desde: 2022, tel: "223 523-6610", email: "mluna@ejemplo.com.ar" },
    { nombre: "Ortiz, Gustavo", documento: "20-25887113-6", localidad: "Santa Clara del Mar", desde: 2020, tel: "223 460-8872", email: "gortiz@ejemplo.com.ar" },
    { nombre: "Acuña, Patricia", documento: "27-24670334-1", localidad: "Mar del Plata", desde: 2015, tel: "223 491-2204", email: "pacuna@ejemplo.com.ar" },
    { nombre: "Ledesma, Facundo", documento: "20-38114562-9", localidad: "Mar del Plata", desde: 2025, tel: "223 618-0457", email: "fledesma@ejemplo.com.ar" },
    { nombre: "Mudanzas Costa Atlántica SRL", documento: "30-71733021-8", localidad: "Mar del Plata", desde: 2020, tel: "223 475-3300", email: "mudanzas@ejemplo.com.ar", contacto: "Carlos Bustos (dueño)" },
  ],
  "La Segunda": [
    { nombre: "Herrera, Camila", documento: "27-39877112-5", localidad: "Mar del Plata", desde: 2023, tel: "223 587-1145", email: "cherrera@ejemplo.com.ar" },
    // Sin teléfono ni email: en la pantalla aparece "Completar contacto" en lugar de "Enviar a Cobranza".
    { nombre: "Vega, Nicolás", documento: "20-34112908-1", localidad: "Otamendi", desde: 2021, tel: null, email: null },
    { nombre: "Morales, Silvina", documento: "27-29004561-3", localidad: "Mar del Plata", desde: 2019, tel: "223 455-7820", email: "smorales@ejemplo.com.ar" },
    { nombre: "Ponce, Ezequiel", documento: "20-33780245-6", localidad: "Mar de Cobo", desde: 2022, tel: "223 498-1103", email: "eponce@ejemplo.com.ar" },
    { nombre: "Viveros El Ombú SA", documento: "30-70788455-2", localidad: "Sierra de los Padres", desde: 2018, tel: "223 463-0090", email: "ventas@ejemplo.com.ar", contacto: "Elena Ruiz (administración)" },
  ],
  "San Cristóbal": [
    { nombre: "Ríos, Florencia", documento: "27-37554123-0", localidad: "Mar del Plata", desde: 2024, tel: "223 544-8710", email: "frios@ejemplo.com.ar" },
    { nombre: "Domínguez, Javier", documento: "20-27993341-4", localidad: "Mar del Plata", desde: 2020, tel: "223 470-6621", email: "jdominguez@ejemplo.com.ar" },
    { nombre: "Figueroa, Analía", documento: "27-31228790-2", localidad: "Miramar", desde: 2021, tel: "2291 43-0718", email: "afigueroa@ejemplo.com.ar" },
    { nombre: "Arias, Bruno", documento: "20-36655012-8", localidad: "Mar del Plata", desde: 2023, tel: "223 539-4402", email: "barias@ejemplo.com.ar" },
    { nombre: "Lácteos Tandil SRL", documento: "30-71266540-9", localidad: "Tandil", desde: 2019, tel: "249 444-1290", email: "logistica@ejemplo.com.ar", contacto: "Marina Costa (logística)" },
  ],
  Rivadavia: [
    { nombre: "Paz, Agustina", documento: "27-40122876-6", localidad: "Mar del Plata", desde: 2025, tel: "223 621-3390", email: "apaz@ejemplo.com.ar" },
    { nombre: "Silva, Ramiro", documento: "20-32566781-3", localidad: "Necochea", desde: 2022, tel: "2262 52-7714", email: "rsilva@ejemplo.com.ar" },
    { nombre: "Correa, Valentina", documento: "27-33019874-2", localidad: "Mar del Plata", desde: 2020, tel: "223 512-0087", email: "vcorrea@ejemplo.com.ar" },
    // La Vida de Rivadavia no está en la cartera: lo que informa la compañía queda "no identificado".
    { nombre: "", documento: "", localidad: "", desde: 0, tel: null, email: null },
    { nombre: "Aberturas Batán SA", documento: "30-71044892-5", localidad: "Batán", desde: 2017, tel: "223 464-8811", email: "aberturas@ejemplo.com.ar", contacto: "Jorge Ibarra (gerente)" },
  ],
};

const BIENES: Record<string, string[]> = {
  Auto: ["VW Polo · AG 512 KD", "Toyota Etios · AE 873 PL", "Fiat Cronos · AF 104 RT", "Chevrolet Tracker · AG 330 MN", "Renault Sandero · AD 615 XS", "Peugeot 2008 · AF 942 BC", "Ford Ranger · AE 221 TT", "Citroën C3 · AC 718 JH", "Nissan Kicks · AG 004 LZ", "Honda HR-V · AF 567 QW", "VW Amarok · AE 390 YU", "Jeep Renegade · AF 812 OP"],
  Hogar: ["Casa, barrio Los Troncos", "Departamento, Playa Grande", "Casa, Batán", "Dúplex, barrio Constitución", "Casa, Sierra de los Padres", "Departamento, centro"],
  Flota: ["3 camiones refrigerados", "3 utilitarios de reparto", "3 camiones de mudanza", "3 camionetas de carga", "3 camiones de reparto", "3 utilitarios de obra"],
  "Integral de comercio": ["Kiosco y despensa", "Local de indumentaria", "Peluquería", "Local de regalería", "Almacén", "Librería"],
  Vida: ["Capital USD 20.000 en pesos", "Capital $ 25.000.000", "Capital $ 30.000.000", "Capital $ 15.000.000", "Capital $ 40.000.000", "Capital $ 20.000.000"],
};

/** Qué asegurado tiene cada póliza de carteraDeEjemplo (por orden de número): AU, AU, HO, FL, IC, VI. */
const DUENO_DE_POLIZA = [0, 1, 2, 4, 0, 3];

const dosDecimales = (n: number) => Math.round(n * 100) / 100;
const MONTO = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type CuotaSembrada = { id: number; compania: string; ramo: string; numeroPoliza: string; asegurado: string; documento: string; info: CuotaNormalizada; monto: number; abierta: boolean };

export async function sembrarValidador(
  tx: Tx,
  opciones: { hoy: string; importacionId: number; cuentas: Map<string, CuentaCompania[]> },
): Promise<{ polizas: string[] }> {
  const { hoy, importacionId } = opciones;
  const momento = (d: number, hora = "12:00") => new Date(`${sumarDias(hoy, d)}T${hora}:00-03:00`);
  const usados: Record<string, number> = {};
  const bien = (ramo: string) => {
    const lista = BIENES[ramo] ?? ["—"];
    usados[ramo] = (usados[ramo] ?? 0) + 1;
    return lista[(usados[ramo] - 1) % lista.length];
  };

  // ---------- Asegurados, pólizas y cuotas ----------
  const sembradas: CuotaSembrada[] = [];
  const numeros: string[] = [];
  for (const compania of COMPANIAS_VALIDADOR) {
    const cartera = carteraDeEjemplo(compania, hoy);
    const [primera, siguientes] = graciaDeEjemplo(compania);
    const gracia = { diasPrimera: primera, diasSiguientes: siguientes };
    const aseguradoId = new Map<number, number>();
    for (const [indice, numero] of [...new Set(cartera.map((p) => p.numero))].entries()) {
      const dueno = DUENOS[compania][DUENO_DE_POLIZA[indice]];
      if (!dueno.nombre) continue;
      let idDueno = aseguradoId.get(DUENO_DE_POLIZA[indice]);
      if (!idDueno) {
        const empresa = /\b(SA|SRL)$/.test(dueno.nombre);
        const [fila] = await tx.insert(schema.asegurados).values({
          tipo: empresa ? "empresa" : "persona",
          nombre: dueno.nombre,
          documento: dueno.documento,
          documentoDigitos: dueno.documento.replace(/\D/g, ""),
          localidad: dueno.localidad,
          telefono: dueno.tel,
          email: dueno.email,
          domicilio: dueno.localidad,
          contactoNombre: dueno.contacto ?? null,
          clienteDesde: dueno.desde,
          esEjemplo: true,
          importacionId,
          creadoEl: momento(-3, "09:30"),
        }).returning({ id: schema.asegurados.id });
        idDueno = fila.id;
        aseguradoId.set(DUENO_DE_POLIZA[indice], idDueno);
      }

      const items = cartera.filter((p) => p.numero === numero);
      const [p] = items;
      const coberturas = coberturasDe(p.ramo);
      const [poliza] = await tx.insert(schema.polizas).values({
        aseguradoId: idDueno,
        ramo: p.ramo,
        compania,
        numero,
        bien: bien(p.ramo),
        cobertura: coberturas[semillaDe(numero) % coberturas.length].nombre,
        vigenciaDesde: p.vigenciaDesde,
        vigenciaHasta: vigenciaHasta(p),
        // La prima está en pesos: la de una póliza en dólares queda sin cargar.
        prima: p.moneda === "ARS" ? dosDecimales(p.monto * p.cuotaTotal * items.length) : null,
        cantidadCuotas: p.cuotaTotal,
        formaPago: ETIQUETA_MEDIO[p.medio],
        importacionId,
      }).returning({ id: schema.polizas.id });
      numeros.push(numero);

      for (const item of items) {
        const { cuotas, anuladaEl } = cuotasDe(compania, item, hoy);
        const filas = cuotas
          .filter((q) => q.vencimiento >= sumarDias(hoy, -VENTANA.diasAtras) && q.vencimiento <= sumarDias(hoy, 45))
          .map((q) => {
            // Lo que la compañía cobró hace más de un mes ya está validado. Lo de
            // Sancor del mes anterior lo confirma el listado de ejemplo (abajo), y
            // lo del último mes, la primera "Ejecutar validación".
            const pagoViejo = q.estadoCompania === "pagada" && q.vencimiento < sumarDias(hoy, -30);
            const loConfirmaElListado = compania === "Sancor" && pagoViejo && q.vencimiento >= sumarDias(hoy, -60);
            // Federación Patronal ya anuló su Hogar, así Canceladas no arranca vacía. Solo lo que la
            // compañía informa anulado: las impagas de antes las informa vencidas, y si ya estuvieran
            // canceladas, la validación las marcaría a revisar ("puede ser una rehabilitación").
            const cancelada = compania === "Federación Patronal" && anuladaEl !== null && q.estadoCompania === "anulada";
            // La Segunda actualizó la prima de un auto y UNIQO tiene el monto anterior: queda a revisar.
            const monto = compania === "La Segunda" && indice === 0 && q.vencimiento >= sumarDias(hoy, -30) ? dosDecimales(q.monto * 0.92) : q.monto;
            const base = { polizaId: poliza.id, numero: q.cuotaN, monto, vencimiento: q.vencimiento, item: q.item, endoso: q.endoso, cupon: q.cupon, moneda: q.moneda };
            if (pagoViejo && !loConfirmaElListado) {
              const registrada = new Date(`${q.fechaPago}T18:00:00-03:00`);
              const origen: OrigenConfirmacion = item.medio === "mercadopago" ? "comprobante" : compania === "Sancor" ? "listado" : "portal";
              return { ...base, estado: "pagada" as EstadoCuota, estadoValidacion: "pagada" as EstadoValidacion, pagadaEl: registrada, fechaPago: q.fechaPago, medioPago: ETIQUETA_MEDIO[q.medio!], origenConfirmacion: origen, ultimaRevision: registrada };
            }
            if (cancelada) {
              return {
                ...base,
                estado: (q.vencimiento < hoy ? "vencida" : "pendiente") as EstadoCuota,
                estadoValidacion: "cancelada" as EstadoValidacion,
                canceladaEl: anuladaEl,
                motivoCancelacion: "Anulación por falta de pago.",
                ultimaRevision: new Date(`${sumarDias(anuladaEl!, 1)}T08:00:00-03:00`),
              };
            }
            const { estado } = calcularEstado({ numero: q.cuotaN, vencimiento: q.vencimiento, pagada: false, cancelada: false }, { hoy, gracia });
            return { ...base, estado: estadoCuotaDe(estado)!, estadoValidacion: estado };
          });
        if (!filas.length) continue;
        const ids = await tx.insert(schema.cuotas).values(filas).returning({ id: schema.cuotas.id, numero: schema.cuotas.numero, monto: schema.cuotas.monto, estado: schema.cuotas.estado, validacion: schema.cuotas.estadoValidacion });
        for (const fila of ids) {
          const info = cuotas.find((q) => q.cuotaN === fila.numero)!;
          sembradas.push({
            id: fila.id,
            compania,
            ramo: p.ramo,
            numeroPoliza: numero,
            asegurado: dueno.nombre,
            documento: dueno.documento,
            info,
            monto: fila.monto,
            abierta: fila.estado !== "pagada" && fila.validacion !== "cancelada",
          });
        }
      }
    }
  }

  await sembrarListados(tx, { hoy, momento, sembradas });
  await sembrarComprobantes(tx, { hoy, momento, sembradas, cuentas: opciones.cuentas });
  return { polizas: numeros };
}

// ---------- Listados de las compañías ----------

/** Las cuotas de una compañía como las lee el cruce (como cuotasDeCompania del agente, dentro de la transacción). */
async function cuotasDeCompania(tx: Tx, compania: string) {
  const { cuotas, polizas } = schema;
  const filas = await tx
    .select({
      id: cuotas.id,
      compania: polizas.compania,
      poliza: polizas.numero,
      item: cuotas.item,
      endoso: cuotas.endoso,
      numero: cuotas.numero,
      cantidadCuotas: polizas.cantidadCuotas,
      cupon: cuotas.cupon,
      monto: cuotas.monto,
      moneda: cuotas.moneda,
      vencimiento: cuotas.vencimiento,
      estado: cuotas.estado,
      estadoValidacion: cuotas.estadoValidacion,
      origenConfirmacion: cuotas.origenConfirmacion,
    })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId));
  return filas
    .filter((f) => f.compania && companiaCanonica(f.compania) === companiaCanonica(compania))
    .map(({ estado, estadoValidacion, ...c }) => ({ ...c, moneda: c.moneda as Moneda, pagada: estado === "pagada" || estadoValidacion === "pagada", cancelada: estadoValidacion === "cancelada" }));
}

const CSV = (filas: string[][], separador: string) =>
  filas.map((f) => f.map((c) => (c.includes(separador) || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(separador)).join("\r\n") + "\r\n";

const ESTADO_SANCOR: Record<CuotaNormalizada["estadoCompania"], string> = { pagada: "COBRADA", pendiente: "A COBRAR", vencida: "IMPAGA", anulada: "ANULADA" };
const MEDIO_LISTADO: Record<string, string> = {
  debito_tarjeta: "Débito tarjeta",
  debito_cbu: "Débito CBU",
  pago_facil: "Pago Fácil",
  rapipago: "Rapipago",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
};

async function sembrarListados(tx: Tx, datos: { hoy: string; momento: (d: number, hora?: string) => Date; sembradas: CuotaSembrada[] }) {
  const { hoy, momento, sembradas } = datos;

  // 1. Sancor, con su plantilla: lo que cobró en el mes anterior, un pago
  // anticipado incompleto de una póliza de siempre, una póliza que no está en
  // la cartera y la fila de totales.
  const desde = sumarDias(hoy, -60);
  const hasta = sumarDias(hoy, -31);
  const deSancor = sembradas
    .filter((c) => c.compania === "Sancor" && c.info.vencimiento >= desde && c.info.vencimiento <= hasta)
    .sort((a, b) => a.info.vencimiento.localeCompare(b.info.vencimiento) || a.numeroPoliza.localeCompare(b.numeroPoliza) || (a.info.item ?? "").localeCompare(b.info.item ?? ""));
  const filaSancor = (q: Pick<CuotaNormalizada, "poliza" | "item" | "endoso" | "cuotaN" | "cuotaTotal" | "cupon" | "vencimiento" | "monto" | "moneda" | "fechaPago" | "medio" | "estadoCompania">) => [
    q.poliza,
    q.item?.replace(/\D/g, "") ?? "",
    q.endoso ?? "",
    `${q.cuotaN}/${q.cuotaTotal}`,
    q.cupon ?? "",
    ddmmaaaa(q.vencimiento),
    `${q.moneda === "USD" ? "U$S" : "$"} ${MONTO.format(q.monto)}`,
    q.moneda === "USD" ? "Dólares" : "Pesos",
    q.fechaPago ? ddmmaaaa(q.fechaPago) : "",
    q.medio ? MEDIO_LISTADO[q.medio] ?? "" : "",
    ESTADO_SANCOR[q.estadoCompania],
  ];
  const pagos = deSancor.map((c) => filaSancor(c.info));
  pagos.push(filaSancor({ poliza: "61-I-30018", item: null, endoso: null, cuotaN: 2, cuotaTotal: 4, cupon: null, vencimiento: sumarDias(hoy, 9), monto: 1_000_000, moneda: "ARS", fechaPago: sumarDias(hoy, -15), medio: "transferencia", estadoCompania: "pagada" }));
  pagos.push(filaSancor({ poliza: "61-AU-5580021", item: null, endoso: null, cuotaN: 3, cuotaTotal: 12, cupon: "5580021003", vencimiento: sumarDias(hoy, -40), monto: 61_450.8, moneda: "ARS", fechaPago: sumarDias(hoy, -41), medio: "pago_facil", estadoCompania: "pagada" }));
  const totalPesos = pagos.filter((f) => f[7] === "Pesos" && f[10] === "COBRADA").reduce((s, f) => s + Number(f[6].replace(/[^\d,]/g, "").replace(",", ".")), 0);
  const encabezadoSancor = ["Póliza", "Ítem", "Endoso", "Cuota", "Cupón", "Vencimiento", "Importe", "Moneda", "Fecha de cobro", "Medio de pago", "Estado"];
  const csvSancor = CSV([encabezadoSancor, ...pagos, ["", "", "", "", "", "TOTAL", `$ ${MONTO.format(totalPesos)}`, "Pesos", "", "", ""]], ";");
  const nombreSancor = `cobranzas_sancor_${hasta.slice(0, 7)}.csv`;
  const tablaSancor = await tablaDe(nombreSancor, csvSancor);
  const mapeo = proponerMapeoPorSinonimos(tablaSancor.encabezados);
  if (faltanEnMapeo(mapeo).length) throw new Error(`El listado de ejemplo de Sancor no se reconoce: falta ${faltanEnMapeo(mapeo).join(", ")}.`);

  const m = schema.conectorMapeos;
  const [anterior] = await tx.select({ version: m.version }).from(m)
    .where(and(eq(m.compania, "Sancor"), eq(m.ramo, "*"), eq(m.operacion, OPERACION_LISTADO), isNull(m.orgId), isNull(m.producerId)))
    .orderBy(desc(m.version)).limit(1);
  const recibido = momento(-14, "09:40");
  const [plantilla] = await tx.insert(m).values({
    compania: "Sancor",
    ramo: "*",
    operacion: OPERACION_LISTADO,
    version: (anterior?.version ?? 0) + 1,
    mapeo,
    origen: "manual",
    confirmado: true,
    confirmadoEl: recibido,
    esEjemplo: true,
    creadoEl: recibido,
  }).returning({ id: m.id });

  const lectura = leerListado(tablaSancor, mapeo, "Sancor");
  const resultado = procesarFuente({ pagos: lectura.filas }, await cuotasDeCompania(tx, "Sancor"), { toleranciaMonto: 1 });
  const [archivoSancor] = await tx.insert(schema.archivos).values(archivo(nombreSancor, "text/csv", csvSancor, recibido)).returning({ id: schema.archivos.id });
  const [fuente] = await tx.insert(schema.validadorFuentes).values({
    compania: "Sancor",
    tipo: "archivo",
    nombre: nombreSancor,
    periodoDesde: desde,
    periodoHasta: hasta,
    formato: "csv",
    archivoId: archivoSancor.id,
    estado: "procesada",
    mapeoId: plantilla.id,
    filasExtraidas: lectura.filas.length,
    problemas: lectura.problemas,
    esEjemplo: true,
    creadoEl: recibido,
  }).returning({ id: schema.validadorFuentes.id });
  await tx.insert(schema.validadorPagosDetectados).values(resultado.pagos.map((p) => ({
    fuenteId: fuente.id,
    fila: p.fila,
    original: p.original,
    datos: p.pago,
    cuotaId: p.cuotaId,
    puntaje: p.puntaje,
    estado: p.estado,
    candidatos: p.candidatos,
    cambio: p.cambio?.tipo ?? null,
    motivo: p.motivo,
    creadoEl: recibido,
  })));
  // Lo mismo que guardarProceso() del agente: las que pagaron quedan pagadas con origen "listado".
  for (const cambio of resultado.cambios) {
    if (cambio.tipo !== "marcar_pagada") continue;
    await tx.update(schema.cuotas).set({
      estado: "pagada",
      estadoValidacion: "pagada",
      pagadaEl: recibido,
      fechaPago: cambio.fechaPago,
      medioPago: cambio.medio ? ETIQUETA_MEDIO[cambio.medio] : "Informado por Sancor",
      origenConfirmacion: "listado",
      ultimaRevision: recibido,
    }).where(eq(schema.cuotas.id, cambio.cuotaId));
  }
  if (resultado.revisadas.length) await tx.update(schema.cuotas).set({ ultimaRevision: recibido }).where(and(inArray(schema.cuotas.id, resultado.revisadas), isNull(schema.cuotas.ultimaRevision)));
  const t = resultado.totales;
  await tx.insert(schema.actividadAgentes).values({
    agente: "validador",
    fecha: recibido,
    referencia: `fuente:${fuente.id}`,
    texto: `Leyó el listado de Sancor (${nombreSancor}): ${t.pagadas} cuotas pagadas, ${t.canceladas} canceladas, ${t.aRevisar} a revisar y ${t.noIdentificados} pagos no identificados; ${lectura.problemas.length} filas no se pudieron leer.`,
    esEjemplo: true,
  });

  // 2. La Segunda, con un formato que todavía no tiene plantilla: espera que
  // el productor confirme qué dato tiene cada columna. No informa el ítem, así
  // que las cuotas de la flota quedan a revisar.
  const deLaSegunda = sembradas
    .filter((c) => c.compania === "La Segunda" && c.info.vencimiento >= sumarDias(hoy, -30) && c.info.vencimiento <= sumarDias(hoy, 15))
    .sort((a, b) => a.numeroPoliza.localeCompare(b.numeroPoliza) || (a.info.item ?? "").localeCompare(b.info.item ?? "") || a.info.cuotaN - b.info.cuotaN);
  const SITUACION: Record<CuotaNormalizada["estadoCompania"], string> = { pagada: "Cobrada", pendiente: "Pendiente", vencida: "Vencida", anulada: "Anulada" };
  const filasLaSegunda = deLaSegunda.map(({ info: q }) => [
    q.poliza,
    String(q.cuotaN),
    String(q.cuotaTotal),
    ddmmaaaa(q.vencimiento),
    `${q.moneda === "USD" ? "USD" : "$"} ${MONTO.format(q.monto)}`,
    q.fechaPago ? ddmmaaaa(q.fechaPago) : "",
    SITUACION[q.estadoCompania],
    q.medio ? MEDIO_LISTADO[q.medio] ?? "" : "",
  ]);
  const csvLaSegunda = CSV([["Nro. Póliza", "Cuota Nro.", "Cant. Cuotas", "Fecha Vto.", "Importe", "Fecha Pago", "Situación", "Forma de Cobro"], ...filasLaSegunda], ",");
  const nombreLaSegunda = `LS_estado_cobranza_${hoy.slice(0, 7)}.csv`;
  const tablaLaSegunda = await tablaDe(nombreLaSegunda, csvLaSegunda);
  const subido = momento(-1, "17:05");
  const [archivoLaSegunda] = await tx.insert(schema.archivos).values(archivo(nombreLaSegunda, "text/csv", csvLaSegunda, subido)).returning({ id: schema.archivos.id });
  const [pendiente] = await tx.insert(schema.validadorFuentes).values({
    compania: "La Segunda",
    tipo: "archivo",
    nombre: nombreLaSegunda,
    formato: "csv",
    archivoId: archivoLaSegunda.id,
    estado: "mapeo_por_confirmar",
    mapeoPropuesto: { ...proponerMapeoPorSinonimos(tablaLaSegunda.encabezados), origen: "manual" },
    esEjemplo: true,
    creadoEl: subido,
  }).returning({ id: schema.validadorFuentes.id });
  await tx.insert(schema.actividadAgentes).values({
    agente: "validador",
    fecha: subido,
    referencia: `fuente:${pendiente.id}`,
    texto: `Recibió el listado de La Segunda (${nombreLaSegunda}): es un formato nuevo, falta que confirmes qué dato tiene cada columna.`,
    esEjemplo: true,
  });
}

async function tablaDe(nombre: string, csv: string) {
  const bytes = new TextEncoder().encode(csv);
  return leerArchivoTabla({ name: nombre, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
}

function archivo(nombre: string, tipo: string, contenido: string | Buffer, subidoEl: Date) {
  const bytes = typeof contenido === "string" ? Buffer.from(contenido, "utf8") : contenido;
  return { nombre, tipo, tamano: bytes.length, contenido: bytes, subidoEl };
}

// ---------- Comprobantes sueltos ----------

type ComprobanteEjemplo = { canal: "whatsapp" | "email"; recibido: Date; archivo: string; texto: string; datos: ComprobanteExtraido | null; motivo?: string };

async function sembrarComprobantes(tx: Tx, datos: { hoy: string; momento: (d: number, hora?: string) => Date; sembradas: CuotaSembrada[]; cuentas: Map<string, CuentaCompania[]> }) {
  const { hoy, momento, sembradas, cuentas } = datos;
  const abiertas = (compania: string, ramo: string) =>
    sembradas.filter((c) => c.abierta && c.compania === compania && c.ramo === ramo).sort((a, b) => a.info.vencimiento.localeCompare(b.info.vencimiento));
  const proxima = (compania: string, ramo: string) => {
    const cuota = abiertas(compania, ramo).find((c) => c.info.vencimiento >= hoy);
    if (!cuota) throw new Error(`Sin cuota próxima de ${ramo} en ${compania} para el comprobante de ejemplo.`);
    return cuota;
  };
  const vacio: ComprobanteExtraido = { monto: null, moneda: null, fecha: null, medio: null, numeroOperacion: null, referencia: null, pagador: null, documentoPagador: null, destinoTitular: null, destinoCuenta: null };
  const mayusculas = (nombre: string) => nombre.replace(",", "").toUpperCase();

  // 1. Exacto: la Vida de San Cristóbal por Mercado Pago, con la póliza en la referencia.
  const vida = proxima("San Cristóbal", "Vida");
  // 2. En dólares: el Integral de comercio de Sancor.
  const dolares = proxima("Sancor", "Integral de comercio");
  // 3. Dos cobros posibles: el Auto de Mapfre tiene una cuota impaga y la próxima con el mismo monto.
  const auto = abiertas("Mapfre", "Auto").filter((c) => c.asegurado === DUENOS.Mapfre[1].nombre);
  const [impaga] = auto;
  if (!impaga || auto.length < 2) throw new Error("El Auto de Mapfre del comprobante de ejemplo no tiene dos cuotas abiertas.");

  const ejemplos: ComprobanteEjemplo[] = [
    {
      canal: "whatsapp",
      recibido: momento(0, "09:12"),
      archivo: "comprobante-mercadopago.pdf",
      texto: `Mercado Pago - Pagaste ${MONTO.format(vida.monto)} a San Cristobal Seguros`,
      datos: {
        ...vacio,
        monto: vida.monto,
        moneda: "ARS",
        fecha: sumarDias(hoy, -1),
        medio: "Mercado Pago",
        numeroOperacion: "71829304412",
        referencia: `Seguro de vida ${vida.numeroPoliza}`,
        pagador: mayusculas(vida.asegurado),
        documentoPagador: vida.documento.replace(/\D/g, "").slice(2, 10),
        destinoTitular: "San Cristóbal Seguros",
        destinoCuenta: "sancristobal.cobros",
      },
    },
    {
      canal: "email",
      recibido: momento(-1, "15:47"),
      archivo: "transferencia-usd.pdf",
      texto: `Banco Galicia - Transferencia U$S ${MONTO.format(dolares.monto)} a Sancor Cooperativa de Seguros`,
      datos: {
        ...vacio,
        monto: dolares.monto,
        moneda: "USD",
        fecha: sumarDias(hoy, -2),
        medio: "Transferencia · Banco Galicia",
        numeroOperacion: "GAL-00982214",
        referencia: "Cuota seguro comercio",
        pagador: mayusculas(dolares.asegurado),
        documentoPagador: dolares.documento,
        destinoTitular: "Sancor Cooperativa de Seguros",
        destinoCuenta: "sancor.seguros",
      },
    },
    {
      canal: "whatsapp",
      recibido: momento(-1, "11:20"),
      archivo: "ticket-pagofacil.pdf",
      texto: `Pago Facil - Mapfre Argentina Seguros $ ${MONTO.format(impaga.monto)}`,
      datos: {
        ...vacio,
        monto: impaga.monto,
        moneda: "ARS",
        fecha: sumarDias(hoy, -1),
        medio: "Pago Fácil",
        numeroOperacion: "PF-30419877",
        pagador: mayusculas(impaga.asegurado),
        destinoTitular: "Mapfre Argentina Seguros",
      },
    },
    {
      canal: "email",
      recibido: momento(-2, "19:03"),
      archivo: "transferencia-brubank.pdf",
      texto: "Brubank - Transferencia $ 33.150,00 a seguros.martinez",
      datos: {
        ...vacio,
        monto: 33_150,
        moneda: "ARS",
        fecha: sumarDias(hoy, -2),
        medio: "Transferencia · Brubank",
        numeroOperacion: "0099128734",
        referencia: "Seguro",
        pagador: "MARTINEZ ELENA",
        destinoCuenta: "seguros.martinez",
      },
    },
    {
      canal: "whatsapp",
      recibido: momento(0, "10:41"),
      archivo: "foto-comprobante.pdf",
      texto: "Comprobante ilegible (foto movida)",
      datos: null,
      motivo: "La foto está movida y no se leen los datos: cargalos a mano.",
    },
  ];

  const cobros = await cobrosAbiertos(tx, hoy);
  for (const e of ejemplos) {
    const [guardado] = await tx.insert(schema.archivos).values(archivo(e.archivo, "application/pdf", pdfSimple(e.texto), e.recibido)).returning({ id: schema.archivos.id });
    const base = { canal: e.canal, archivoId: guardado.id, extraccion: "manual", recibidoEl: e.recibido, esEjemplo: true };
    if (!e.datos) {
      await tx.insert(schema.comprobantes).values({ ...base, motivoPropuesta: e.motivo ?? null });
      continue;
    }
    const compania = companiaDeDestino([e.datos.destinoTitular, e.datos.destinoCuenta], cuentas);
    const propuesta = proponerCobros(comprobanteParaMatch(e.datos, compania), cobros, { toleranciaMonto: 1 });
    await tx.insert(schema.comprobantes).values({
      ...base,
      monto: e.datos.monto,
      moneda: e.datos.moneda ?? "ARS",
      fecha: e.datos.fecha ? new Date(`${e.datos.fecha}T12:00:00-03:00`) : null,
      medio: e.datos.medio,
      destino: [e.datos.destinoTitular, e.datos.destinoCuenta].filter(Boolean).join(" · ") || null,
      numeroOperacion: e.datos.numeroOperacion,
      referencia: e.datos.referencia,
      pagador: e.datos.pagador,
      documentoPagador: e.datos.documentoPagador,
      candidatos: propuesta.candidatos,
      motivoPropuesta: propuesta.motivo,
    });
  }
}

/** Las cuotas impagas de la ventana del Validador, agrupadas en cobros (como cobrosAbiertos del agente). */
async function cobrosAbiertos(tx: Tx, hoy: string) {
  const { cuotas, polizas, asegurados } = schema;
  const filas = await tx
    .select({
      id: cuotas.id,
      aseguradoId: asegurados.id,
      asegurado: asegurados.nombre,
      documento: asegurados.documento,
      compania: polizas.compania,
      poliza: polizas.numero,
      cupon: cuotas.cupon,
      monto: cuotas.monto,
      moneda: cuotas.moneda,
      vencimiento: cuotas.vencimiento,
    })
    .from(cuotas)
    .innerJoin(polizas, eq(polizas.id, cuotas.polizaId))
    .innerJoin(asegurados, eq(asegurados.id, polizas.aseguradoId))
    .where(and(
      ne(cuotas.estado, "pagada"),
      or(isNull(cuotas.estadoValidacion), ne(cuotas.estadoValidacion, "cancelada")),
      gte(cuotas.vencimiento, sumarDias(hoy, -VENTANA.diasAtras)),
      lte(cuotas.vencimiento, sumarDias(hoy, VENTANA.diasAdelante)),
      isNull(asegurados.bajaEl),
    ));
  return cobrosParaComprobante(filas.map((f) => ({ ...f, moneda: f.moneda as Moneda })));
}
