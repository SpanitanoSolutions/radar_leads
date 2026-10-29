/**
 * Cartera de ejemplo: la misma que muestran los diseños de docs/diseno, para
 * que la app se vea igual en la primera carga. Las fechas son relativas a hoy
 * (los diseños están hechos con hoy = 27/10/2026).
 *
 * Donde los diseños se contradicen, mandan los asegurados y pólizas de
 * Cartera.dc.html; los demás textos se adaptaron a esos datos.
 */
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { Chequeo, CotizacionRecibida, Retenciones } from "../src/db/schema";
import { borrarEjemplosDeCartera } from "../src/db/ejemplos";
import { CONFIG_COBRANZA_INICIAL } from "../src/agentes/cobranza/secuencia";
import { diaEnArgentina, sumarDias } from "../src/lib/fechas";
import { ACUERDOS_VALIDADOR, graciaDeEjemplo, sembrarValidador } from "./validador-ejemplo";

type P = {
  ramo: string;
  compania: string;
  numero: string;
  bien: string;
  cobertura: string;
  /** Días hasta el fin de la vigencia (negativo: ya venció). */
  vence: number;
  prima: number;
  suma?: number;
  cuotas?: number;
  formaPago?: string;
};

type A = {
  nombre: string;
  tipo: "persona" | "empresa";
  documento: string;
  localidad: string;
  desde: number;
  contacto: { nombre?: string; tel: string | null; email: string | null; dir: string };
  polizas: P[];
};

const p = (
  ramo: string,
  compania: string,
  numero: string,
  bien: string,
  cobertura: string,
  vence: number,
  prima: number,
  extra: Partial<P> = {},
): P => ({ ramo, compania, numero, bien, cobertura, vence, prima, ...extra });

const ASEGURADOS: A[] = [
  {
    nombre: "Transportes Del Atlántico SRL",
    tipo: "empresa",
    documento: "30-71588214-6",
    localidad: "Mar del Plata",
    desde: 2019,
    contacto: {
      nombre: "Marcela Ruiz (administración)",
      tel: "223 495-1180",
      email: "administracion@ejemplo.com.ar",
      dir: "Parque Industrial Gral. Savio",
    },
    polizas: [
      p("Flota", "Mapfre", "4412-0098811", "Camión Scania R450 · AB 123 CD", "Todo riesgo con franquicia", 9, 3200000),
      p("Flota", "Mapfre", "4412-0098812", "Camión Scania R450 · AC 456 EF", "Todo riesgo con franquicia", 9, 3200000),
      p("Flota", "Mapfre", "4412-0098813", "Camión Iveco Tector · AD 789 GH", "Todo riesgo con franquicia", 9, 2700000),
      p("Carga", "Mapfre", "4415-0012270", "Mercadería en tránsito", "Hasta $ 60 M por viaje", 9, 2180000),
      p("Flota", "Federación Patronal", "88-551203", "Renault Kangoo · AE 012 IJ", "Terceros completo", 142, 980000),
      p("Flota", "Federación Patronal", "88-551204", "Fiat Fiorino · AE 345 KL", "Terceros completo", 142, 940000),
      p("ART", "Federación Patronal", "912-004417", "22 empleados", "Riesgos del trabajo", 65, 5200000),
    ],
  },
  {
    nombre: "Gómez, Lucía",
    tipo: "persona",
    documento: "27-31455872-4",
    localidad: "Mar del Plata",
    desde: 2022,
    contacto: { tel: "223 512-4471", email: null, dir: "Mar del Plata" },
    polizas: [p("Auto", "Mapfre", "4410-3321908", "Peugeot 208 · AF 221 QR", "Terceros completo", 12, 960000)],
  },
  {
    nombre: "Panadería La Espiga SA",
    tipo: "empresa",
    documento: "30-70991245-1",
    localidad: "Batán",
    desde: 2018,
    contacto: { nombre: "Raúl Benítez (dueño)", tel: "223 464-2290", email: "laespiga@ejemplo.com.ar", dir: "Batán" },
    polizas: [
      p("Integral de comercio", "Sancor", "61-200455", "Local y cuadra de producción", "Incendio, robo y cristales", 47, 1450000, {
        suma: 2024,
        cuotas: 6,
        formaPago: "Rapipago",
      }),
      p("ART", "Sancor", "61-ART-1187", "9 empleados", "Riesgos del trabajo", 47, 700000),
    ],
  },
  {
    nombre: "Pereyra, Martín",
    tipo: "persona",
    documento: "20-28761334-9",
    localidad: "Miramar",
    desde: 2020,
    contacto: { tel: "2291 44-1208", email: "mpereyra@ejemplo.com.ar", dir: "Miramar" },
    polizas: [
      p("Auto", "La Segunda", "22-778190", "VW Gol Trend · AB 554 TT", "Terceros completo", 23, 820000),
      p("Hogar", "Mapfre", "4420-0551873", "Casa, Miramar", "Combinado familiar", 200, 560000, { suma: 2025 }),
    ],
  },
  {
    nombre: "Clínica Dental Costa Azul SRL",
    tipo: "empresa",
    documento: "30-71402236-5",
    localidad: "Mar del Plata",
    desde: 2023,
    contacto: { nombre: "Dra. Paula Ríos", tel: "223 491-8801", email: "turnos@ejemplo.com.ar", dir: "Mar del Plata" },
    polizas: [
      p("RC profesional", "Sancor", "61-RCP-0332", "3 odontólogos", "Mala praxis", 95, 640000),
      // No se renovó después del robo: queda en la ficha como vencida.
      p("Integral", "Sancor", "61-I-28870", "Consultorio de calle Córdoba", "Integral de consultorio", -7, 980000),
    ],
  },
  {
    nombre: "Fernández, Rocío",
    tipo: "persona",
    documento: "27-35120987-2",
    localidad: "Mar del Plata",
    desde: 2021,
    contacto: { tel: null, email: null, dir: "Mar del Plata" },
    polizas: [
      p("Auto", "Federación Patronal", "88-310276", "Fiat Cronos · AE 908 PL", "Todo riesgo con franquicia", 5, 900000),
      p("Vida", "Federación Patronal", "88-V-11820", "Capital $ 20.000.000", "Vida individual", 5, 220000),
    ],
  },
  {
    nombre: "Constructora Los Acantilados SA",
    tipo: "empresa",
    documento: "30-71311458-0",
    localidad: "Mar del Plata",
    desde: 2017,
    contacto: { nombre: "Ing. Sergio Lamas", tel: "223 480-3315", email: "obras@ejemplo.com.ar", dir: "Mar del Plata" },
    polizas: [
      p("Caución", "Fianzas y Crédito", "FC-55120", "Contrato de obra pública", "Cumplimiento de contrato", 61, 2300000),
      p("RC", "Mapfre", "4430-0098120", "Obra calle Güemes", "RC de obra", 61, 1900000),
      p("ART", "Mapfre", "4490-0012045", "35 empleados", "Riesgos del trabajo", 120, 4100000),
      p("Todo riesgo construcción", "Mapfre", "4431-0004410", "Edificio calle Güemes", "Todo riesgo construcción", 200, 1500000),
    ],
  },
  {
    nombre: "Sosa, Ricardo",
    tipo: "persona",
    documento: "20-17654321-8",
    localidad: "Balcarce",
    desde: 2024,
    // El diseño de Cobranza lo llama por teléfono: tiene teléfono y le falta el email.
    contacto: { tel: "223 478-3021", email: null, dir: "Balcarce" },
    polizas: [
      p("Moto", "La Segunda", "22-M-90314", "Honda CB 190 · A123BCD", "Responsabilidad civil", 140, 310000),
      p("Auto", "Federación Patronal", "88-401276", "Ford Ka · AA 912 HB", "Todo riesgo con franquicia", -26, 760000),
    ],
  },
  {
    nombre: "Distribuidora Tito Hnos. SRL",
    tipo: "empresa",
    documento: "30-70855123-9",
    localidad: "Mar del Plata",
    desde: 2019,
    contacto: { nombre: "Tito Aguirre", tel: "223 475-6612", email: "pedidos@ejemplo.com.ar", dir: "Mar del Plata" },
    polizas: [
      p("Flota", "Mapfre", "4412-0101772", "4 utilitarios de reparto", "Terceros completo", 28, 3200000, { cuotas: 6 }),
      p("Integral de comercio", "Mapfre", "4425-0033901", "Depósito y oficina", "Incendio y robo", 28, 1400000, { suma: 2024 }),
    ],
  },
  {
    nombre: "Ibáñez, Carolina",
    tipo: "persona",
    documento: "27-29874512-6",
    localidad: "Mar del Plata",
    desde: 2021,
    contacto: { tel: "223 600-1934", email: "cibanez@ejemplo.com.ar", dir: "Calle 23 N° 1480, Mar del Plata" },
    polizas: [
      p("Hogar", "Sancor", "61-H-44019", "Departamento, Mar del Plata", "Combinado familiar", 180, 420000, { suma: 2023 }),
    ],
  },
  {
    nombre: "Escuela de Conducir Faro SRL",
    tipo: "empresa",
    documento: "30-71655902-3",
    localidad: "Mar del Plata",
    desde: 2022,
    contacto: { nombre: "Gabriel Funes", tel: "223 455-0071", email: null, dir: "Mar del Plata" },
    polizas: [
      p("Flota", "Federación Patronal", "88-551877", "5 autos doble comando", "Todo riesgo con franquicia", 18, 1900000),
      p("AP", "Federación Patronal", "88-AP-2210", "Alumnos e instructores", "Accidentes personales", 18, 400000),
    ],
  },
  {
    nombre: "Romero, Diego",
    tipo: "persona",
    documento: "20-26554890-1",
    localidad: "Mar Chiquita",
    desde: 2016,
    contacto: { tel: "223 503-7788", email: "dromero@ejemplo.com.ar", dir: "Mar Chiquita" },
    polizas: [
      p("Auto", "Mapfre", "4410-2290117", "Toyota Hilux · AD 333 KJ", "Todo riesgo con franquicia", 210, 1100000, {
        formaPago: "Débito automático",
      }),
      p("Hogar", "Mapfre", "4420-0410022", "Casa, Mar Chiquita", "Combinado familiar", 210, 380000, { suma: 2026 }),
      p("Vida", "Mapfre", "4470-0088120", "Capital $ 30.000.000", "Vida individual", 210, 160000),
    ],
  },
  {
    nombre: "Molina, Hernán",
    tipo: "persona",
    documento: "20-30442118-7",
    localidad: "Mar del Plata",
    desde: 2020,
    contacto: { tel: "223 520-4415", email: "tallerelpuerto@ejemplo.com.ar", dir: "Mar del Plata" },
    polizas: [p("Integral de comercio", "La Segunda", "22-IC-7781", "Taller mecánico", "Incendio y robo", 33, 780000, { suma: 2024 })],
  },
  {
    nombre: "Hotel Brisas del Sur SA",
    tipo: "empresa",
    documento: "30-69874120-4",
    localidad: "Mar del Plata",
    desde: 2015,
    contacto: { nombre: "Laura Ferro (gerencia)", tel: "223 486-2200", email: "gerencia@ejemplo.com.ar", dir: "Mar del Plata" },
    polizas: [
      p("Integral", "Sancor", "61-I-30018", "Edificio del hotel", "Integral hotelero", 74, 4300000, { suma: 2025, cuotas: 4 }),
      p("RC", "Mapfre", "4430-0077104", "Huéspedes y terceros", "RC hotelera", 74, 1150000),
      p("ART", "Sancor", "61-ART-2290", "28 empleados", "Riesgos del trabajo", 74, 1800000),
    ],
  },
  {
    nombre: "Acosta, Valeria",
    tipo: "persona",
    documento: "27-38990145-0",
    localidad: "Necochea",
    desde: 2025,
    contacto: { tel: "2262 51-4420", email: "vacosta@ejemplo.com.ar", dir: "Necochea" },
    polizas: [p("Auto", "Federación Patronal", "88-322019", "Chevrolet Onix · AF 777 ZX", "Responsabilidad civil", 2, 870000)],
  },
  {
    nombre: "Cooperativa Pesquera Puerto Unido Ltda.",
    tipo: "empresa",
    documento: "30-54672218-9",
    localidad: "Mar del Plata",
    desde: 2014,
    contacto: { nombre: "Néstor Galli (presidente)", tel: "223 489-7710", email: null, dir: "Puerto de Mar del Plata" },
    polizas: [
      p("Embarcaciones", "Mapfre", "4460-0001988", 'Buque costero "Don Nino"', "Casco y máquinas", 120, 9800000),
      p("ART", "Mapfre", "4490-0020871", "40 tripulantes", "Riesgos del trabajo", 120, 2800000),
    ],
  },
];

/**
 * Cuotas: [póliza, número, monto, vencimiento, pago].
 * vencimiento y pago: días desde hoy, o { dia } del mes anterior (lo que liquida el conciliador).
 */
type Cuando = number | { dia: number };
type C = [string, number, number, Cuando, ({ cuando: Cuando; medio: string } | null)?];

const CUOTAS: C[] = [
  // Cuotas de estos días (Validador y Cobranza).
  ["88-322019", 4, 72500, 0],
  ["4410-3321908", 6, 80000, 2],
  ["4412-0098811", 10, 237000, 4],
  ["4412-0098812", 10, 237000, 4],
  ["4412-0098813", 10, 200000, 4],
  ["88-310276", 7, 75000, -3],
  ["88-V-11820", 7, 18300, -3],
  ["61-200455", 3, 241700, 6],
  ["61-I-30018", 2, 1075000, 9],
  ["22-IC-7781", 5, 65000, -8],
  ["88-551877", 9, 158300, 12],
  ["4410-2290117", 4, 136700, 3, { cuando: 0, medio: "Débito automático" }],
  ["61-H-44019", 5, 35000, 8, { cuando: 0, medio: "Comprobante por email" }],
  ["4490-0012045", 10, 341700, 5, { cuando: -1, medio: "Transferencia" }],
  ["22-778190", 8, 58400, -5],
  ["22-M-90314", 5, 96200, -12],
  ["4412-0101772", 4, 312500, 3],
  ["61-RCP-0332", 9, 54800, -6],

  // Cobradas el mes pasado: lo que el conciliador compara con las liquidaciones.
  ["61-I-30018", 1, 1075000, { dia: 8 }, { cuando: { dia: 8 }, medio: "Transferencia" }],
  ["61-H-44019", 4, 35000, { dia: 10 }, { cuando: { dia: 10 }, medio: "Transferencia" }],
  ["61-200455", 2, 241700, { dia: 7 }, { cuando: { dia: 5 }, medio: "Rapipago" }],
  ["61-RCP-0332", 8, 54800, { dia: 9 }, { cuando: { dia: 9 }, medio: "Transferencia" }],
  ["61-ART-1187", 9, 58300, { dia: 10 }, { cuando: { dia: 10 }, medio: "Débito automático" }],
  ["61-ART-2290", 9, 630200, { dia: 10 }, { cuando: { dia: 10 }, medio: "Débito automático" }],
  ["88-551877", 8, 158300, { dia: 12 }, { cuando: { dia: 12 }, medio: "Transferencia" }],
  ["88-322019", 3, 72500, { dia: 8 }, { cuando: { dia: 6 }, medio: "Transferencia" }],
  ["88-310276", 6, 75000, { dia: 15 }, { cuando: { dia: 15 }, medio: "Transferencia" }],
  ["88-V-11820", 6, 18300, { dia: 15 }, { cuando: { dia: 15 }, medio: "Transferencia" }],
  ["88-AP-2210", 8, 33300, { dia: 12 }, { cuando: { dia: 12 }, medio: "Transferencia" }],
  ["88-551203", 9, 81700, { dia: 10 }, { cuando: { dia: 10 }, medio: "Transferencia" }],
  ["88-551204", 9, 78300, { dia: 10 }, { cuando: { dia: 10 }, medio: "Transferencia" }],
  ["912-004417", 9, 1139590, { dia: 10 }, { cuando: { dia: 10 }, medio: "Débito automático" }],
  ["22-778190", 6, 65800, { dia: 5 }, { cuando: { dia: 3 }, medio: "Transferencia" }],
  ["22-778190", 7, 65800, { dia: 20 }, { cuando: { dia: 20 }, medio: "Transferencia" }],
  ["22-IC-7781", 3, 65000, { dia: 4 }, { cuando: { dia: 4 }, medio: "Transferencia" }],
  ["22-IC-7781", 4, 65000, { dia: 18 }, { cuando: { dia: 18 }, medio: "Transferencia" }],
  ["22-M-90314", 3, 96200, { dia: 2 }, { cuando: { dia: 2 }, medio: "Transferencia" }],
  ["22-M-90314", 4, 96200, { dia: 17 }, { cuando: { dia: 17 }, medio: "Transferencia" }],
  ["4412-0098811", 9, 237000, { dia: 7 }, { cuando: { dia: 7 }, medio: "Transferencia" }],
  ["4412-0098812", 9, 237000, { dia: 7 }, { cuando: { dia: 7 }, medio: "Transferencia" }],
  ["4412-0098813", 9, 200000, { dia: 7 }, { cuando: { dia: 7 }, medio: "Transferencia" }],
  ["4415-0012270", 9, 181700, { dia: 7 }, { cuando: { dia: 7 }, medio: "Transferencia" }],
  ["4410-3321908", 5, 80000, { dia: 14 }, { cuando: { dia: 14 }, medio: "Transferencia" }],
  ["4420-0551873", 9, 46700, { dia: 11 }, { cuando: { dia: 11 }, medio: "Transferencia" }],
  ["4430-0098120", 9, 158300, { dia: 9 }, { cuando: { dia: 9 }, medio: "Transferencia" }],
  ["4490-0012045", 9, 341700, { dia: 9 }, { cuando: { dia: 9 }, medio: "Transferencia" }],
  ["4431-0004410", 9, 125000, { dia: 9 }, { cuando: { dia: 9 }, medio: "Transferencia" }],
  ["4410-2290117", 3, 136700, { dia: 13 }, { cuando: { dia: 13 }, medio: "Débito automático" }],
  ["4420-0410022", 9, 31700, { dia: 13 }, { cuando: { dia: 13 }, medio: "Débito automático" }],
  ["4470-0088120", 9, 13300, { dia: 13 }, { cuando: { dia: 13 }, medio: "Débito automático" }],
  ["4430-0077104", 9, 95800, { dia: 8 }, { cuando: { dia: 8 }, medio: "Transferencia" }],
  ["4490-0020871", 9, 186500, { dia: 16 }, { cuando: { dia: 16 }, medio: "Transferencia" }],
  ["FC-55120", 9, 90000, { dia: 6 }, { cuando: { dia: 4 }, medio: "Transferencia" }],
];

/** Comisión acordada con cada compañía, por ramo (porcentaje). Se suman los ramos de las pólizas del Validador. */
const ACUERDOS_CARTERA: Record<string, Record<string, number>> = {
  Sancor: { Integral: 15, Hogar: 20, "Integral de comercio": 20, "RC profesional": 20, ART: 10 },
  "Federación Patronal": { Flota: 12, Auto: 15, Vida: 20, AP: 20, ART: 10 },
  "La Segunda": { Auto: 20, Moto: 20, "Integral de comercio": 25 },
  Mapfre: {
    Flota: 12,
    Carga: 12,
    Auto: 15,
    Hogar: 20,
    Vida: 20,
    RC: 15,
    ART: 8,
    "Todo riesgo construcción": 12,
    Embarcaciones: 10,
    "Integral de comercio": 20,
  },
  "Fianzas y Crédito": { Caución: 25 },
};
const ACUERDOS: Record<string, Record<string, number>> = Object.fromEntries(
  [...new Set([...Object.keys(ACUERDOS_CARTERA), ...Object.keys(ACUERDOS_VALIDADOR)])].map((c) => [c, { ...ACUERDOS_CARTERA[c], ...ACUERDOS_VALIDADOR[c] }]),
);

const COMPANIAS = [
  {
    nombre: "Mapfre",
    cuentas: [{ titular: "Mapfre Argentina Seguros", banco: "Banco Galicia", alias: "mapfre.cobranzas" }],
    emailComisiones: "comisiones.mdp@ejemplo-mapfre.com.ar",
    emailSiniestros: "siniestros@ejemplo-mapfre.com.ar",
    mediosPago: "transferencia, débito automático o Rapipago",
  },
  {
    nombre: "Sancor",
    cuentas: [{ titular: "Sancor Cooperativa de Seguros", banco: "Banco Nación", alias: "sancor.seguros" }],
    emailComisiones: "comisiones.zonamdp@ejemplo-sancor.com.ar",
    emailSiniestros: "siniestros@ejemplo-sancor.com.ar",
    mediosPago: "transferencia o Rapipago con el código de la póliza",
  },
  {
    nombre: "Federación Patronal",
    cuentas: [{ titular: "Federación Patronal Seguros", banco: "Banco Nación", alias: "fedpat.cobranzas" }],
    emailComisiones: "productores@ejemplo-fedpat.com.ar",
    emailSiniestros: "siniestros@ejemplo-fedpat.com.ar",
    mediosPago: "transferencia o Pago Fácil",
  },
  {
    nombre: "La Segunda",
    cuentas: [{ titular: "La Segunda Cooperativa de Seguros", banco: "Banco Credicoop", alias: "lasegunda.cobro" }],
    emailComisiones: "comisiones@ejemplo-lasegunda.com.ar",
    emailSiniestros: "siniestros@ejemplo-lasegunda.com.ar",
    mediosPago: "transferencia o Rapipago",
  },
  {
    nombre: "Fianzas y Crédito",
    cuentas: [{ titular: "Fianzas y Crédito Seguros", banco: "Banco Provincia", alias: "fyc.seguros" }],
    emailComisiones: "administracion@ejemplo-fyc.com.ar",
    emailSiniestros: null,
    mediosPago: "transferencia",
  },
  {
    nombre: "San Cristóbal",
    cuentas: [{ titular: "San Cristóbal Seguros", banco: "Banco Provincia", alias: "sancristobal.cobros" }],
    emailComisiones: "productores@ejemplo-sancristobal.com.ar",
    emailSiniestros: "siniestros@ejemplo-sancristobal.com.ar",
    mediosPago: "transferencia, débito automático o Pago Fácil",
  },
  {
    nombre: "Rivadavia",
    cuentas: [{ titular: "Seguros Rivadavia", banco: "Banco Nación", alias: "rivadavia.cobranza" }],
    emailComisiones: "comisiones@ejemplo-rivadavia.com.ar",
    emailSiniestros: "siniestros@ejemplo-rivadavia.com.ar",
    mediosPago: "transferencia o Rapipago",
  },
];

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export async function sembrarCartera(hoy: string = diaEnArgentina(new Date())) {
  const dia = (d: number) => sumarDias(hoy, d);
  const momento = (d: number, hora = "12:00") => new Date(`${dia(d)}T${hora}:00-03:00`);
  const ddmm = (d: number) => `${dia(d).slice(8, 10)}/${dia(d).slice(5, 7)}`;
  const diaSemana = (d: number) => DIAS_SEMANA[new Date(`${dia(d)}T12:00:00Z`).getUTCDay()];
  // El mes anterior es el período que liquidan las compañías.
  const primeroDelMes = `${hoy.slice(0, 7)}-01`;
  const periodo = sumarDias(primeroDelMes, -1).slice(0, 7);
  const delPeriodo = (n: number) => `${periodo}-${String(n).padStart(2, "0")}`;
  const fechaDe = (c: Cuando) => (typeof c === "number" ? dia(c) : delPeriodo(c.dia));
  const delMes = (n: number, hora = "12:00") => new Date(`${hoy.slice(0, 7)}-${String(n).padStart(2, "0")}T${hora}:00-03:00`);

  const totalPolizas = ASEGURADOS.reduce((n, a) => n + a.polizas.length, 0);

  await db.transaction(async (tx) => {
    await borrarEjemplosDeCartera(tx);

    const [importacion] = await tx
      .insert(schema.importaciones)
      .values({
        archivo: "cartera_octubre.csv",
        fecha: momento(-3, "09:30"),
        filas: totalPolizas,
        resumen: {
          aseguradosNuevos: ASEGURADOS.length,
          aseguradosActualizados: 0,
          polizasNuevas: totalPolizas,
          polizasActualizadas: 0,
        },
        esEjemplo: true,
      })
      .returning({ id: schema.importaciones.id });

    // Asegurados y pólizas.
    const aseguradoId = new Map<string, number>();
    const polizaId = new Map<string, number>();
    for (const a of ASEGURADOS) {
      const empresa = a.tipo === "empresa";
      const [fila] = await tx
        .insert(schema.asegurados)
        .values({
          tipo: a.tipo,
          nombre: a.nombre,
          documento: a.documento,
          documentoDigitos: a.documento.replace(/\D/g, ""),
          localidad: a.localidad,
          telefono: a.contacto.tel,
          email: a.contacto.email,
          domicilio: a.contacto.dir,
          contactoNombre: empresa ? (a.contacto.nombre ?? null) : null,
          clienteDesde: a.desde,
          esEjemplo: true,
          importacionId: importacion.id,
          creadoEl: momento(-3, "09:30"),
        })
        .returning({ id: schema.asegurados.id });
      aseguradoId.set(a.nombre, fila.id);
      for (const x of a.polizas) {
        const hasta = dia(x.vence);
        const [pol] = await tx
          .insert(schema.polizas)
          .values({
            aseguradoId: fila.id,
            ramo: x.ramo,
            compania: x.compania,
            numero: x.numero,
            bien: x.bien,
            cobertura: x.cobertura,
            vigenciaDesde: sumarDias(hasta, -365),
            vigenciaHasta: hasta,
            prima: x.prima,
            cantidadCuotas: x.cuotas ?? 12,
            formaPago: x.formaPago ?? "Transferencia",
            sumaActualizadaAnio: x.suma ?? null,
            importacionId: importacion.id,
          })
          .returning({ id: schema.polizas.id });
        polizaId.set(x.numero, pol.id);
      }
    }
    const pol = (numero: string) => {
      const id = polizaId.get(numero);
      if (!id) throw new Error(`Póliza de ejemplo desconocida: ${numero}`);
      return id;
    };
    const aseg = (nombre: string) => aseguradoId.get(nombre)!;

    // Cuotas.
    const cuotaId = new Map<string, number>();
    for (const [numero, n, monto, vence, pago] of CUOTAS) {
      const vencimiento = fechaDe(vence);
      const pagadaEl = pago ? new Date(`${fechaDe(pago.cuando)}T11:00:00-03:00`) : null;
      const [fila] = await tx
        .insert(schema.cuotas)
        .values({
          polizaId: pol(numero),
          numero: n,
          monto,
          vencimiento,
          estado: pago ? "pagada" : vencimiento < hoy ? "vencida" : "pendiente",
          pagadaEl,
          medioPago: pago?.medio ?? null,
        })
        .returning({ id: schema.cuotas.id });
      cuotaId.set(`${numero}#${n}`, fila.id);
    }
    const cuota = (numero: string, n: number) => cuotaId.get(`${numero}#${n}`)!;

    // Validador de pagos: 6 compañías con las pólizas de los conectores simulados, listados y comprobantes sueltos.
    const validador = await sembrarValidador(tx, { hoy, importacionId: importacion.id, cuentas: new Map(COMPANIAS.map((c) => [c.nombre, c.cuentas])) });

    // Comprobantes que llegaron (Validador de pagos).
    const ok = (id: Chequeo["id"], texto: string): Chequeo => ({ id, resultado: "ok", texto });
    await tx.insert(schema.comprobantes).values([
      {
        cuotaId: cuota("88-322019", 4),
        canal: "whatsapp",
        medio: "Transferencia · Banco Nación",
        fecha: momento(0, "10:14"),
        monto: 72500,
        destino: "Federación Patronal Seguros",
        numeroOperacion: "4471-9920",
        recibidoEl: momento(0, "10:15"),
        chequeos: [
          ok("monto", "El monto coincide con la cuota."),
          ok("destino", "El destino es la cuenta de la compañía."),
          ok("fecha", "Pagó antes del vencimiento."),
          ok("operacion", "El número de operación no se usó antes."),
        ],
      },
      {
        cuotaId: cuota("4412-0098811", 10),
        canal: "email",
        medio: "Transferencia · Banco Galicia",
        fecha: momento(-1, "16:40"),
        monto: 640000,
        destino: "Mapfre Argentina Seguros",
        numeroOperacion: "9902-1183",
        recibidoEl: momento(-1, "16:52"),
        chequeos: [
          { id: "monto", resultado: "mal", texto: "Faltan $ 34.000: pagó $ 640.000 y la cuota es $ 674.000." },
          ok("destino", "El destino es la cuenta de la compañía."),
          ok("fecha", "Pagó antes del vencimiento."),
          ok("operacion", "El número de operación no se usó antes."),
        ],
      },
      {
        cuotaId: cuota("61-200455", 3),
        canal: "email",
        medio: "Rapipago",
        fecha: momento(-2, "12:02"),
        monto: 241700,
        destino: "Sancor · 61-200455",
        numeroOperacion: "RP-55310927",
        recibidoEl: momento(-2, "12:30"),
        chequeos: [
          ok("monto", "El monto coincide con la cuota."),
          ok("destino", "El código de pago corresponde a esta póliza."),
          ok("fecha", "Pagó antes del vencimiento."),
          ok("operacion", "La transacción no se usó antes."),
        ],
      },
      {
        cuotaId: cuota("22-IC-7781", 5),
        canal: "email",
        medio: "Transferencia · Mercado Pago",
        fecha: momento(-3, "19:31"),
        monto: 65000,
        destino: "Alias taller.puerto.mp",
        numeroOperacion: "88213409",
        recibidoEl: momento(-3, "19:40"),
        chequeos: [
          ok("monto", "El monto coincide con la cuota."),
          { id: "destino", resultado: "mal", texto: "El destino no es una cuenta de La Segunda. Confirmar a quién le transfirió." },
          { id: "fecha", resultado: "duda", texto: "Pagó 5 días después del vencimiento: revisar si la póliza sigue vigente." },
          ok("operacion", "El número de operación no se usó antes."),
        ],
      },
    ]);

    // Seguimiento de cobranza.
    await tx.insert(schema.seguimientosCobranza).values([
      { cuotaId: cuota("22-M-90314", 5), paso: 3, ultimaNovedad: "Leído, sin respuesta", ultimoContacto: "WhatsApp", ultimaNovedadEl: momento(-5, "10:00") },
      {
        cuotaId: cuota("22-IC-7781", 5),
        paso: 3,
        estado: "pausado",
        motivoPausa: "Pagó a una cuenta equivocada",
        ultimaNovedad: "Pagó a una cuenta equivocada",
        ultimoContacto: "Detectado por el Validador",
        ultimaNovedadEl: momento(-3, "19:40"),
      },
      {
        cuotaId: cuota("61-RCP-0332", 9),
        paso: 3,
        estado: "pausado",
        motivoPausa: "Promesa de pago",
        promesaPagoEl: dia(3),
        ultimaNovedad: "Promesa de pago",
        ultimoContacto: "Respondió por WhatsApp",
        ultimaNovedadEl: momento(-1, "18:20"),
      },
      { cuotaId: cuota("22-778190", 8), paso: 2, ultimaNovedad: "Leído, sin respuesta", ultimoContacto: "WhatsApp", ultimaNovedadEl: momento(-5, "10:00") },
      { cuotaId: cuota("88-310276", 7), paso: 0, ultimaNovedad: "Sin teléfono ni email", ultimoContacto: "No se le pudo avisar" },
      { cuotaId: cuota("4410-3321908", 6), paso: 1, ultimaNovedad: "Sin respuesta", ultimoContacto: "Recordatorio", ultimaNovedadEl: momento(-1, "09:00") },
      { cuotaId: cuota("4412-0101772", 4), paso: 0, ultimaNovedad: "Todavía sin avisos" },
      {
        cuotaId: cuota("4412-0098811", 10),
        paso: 1,
        ultimaNovedad: "Pago incompleto",
        ultimoContacto: "Pagó $ 640.000 de $ 674.000",
        ultimaNovedadEl: momento(-1, "16:52"),
      },
      { cuotaId: cuota("61-I-30018", 2), paso: 0, ultimaNovedad: "Todavía sin avisos" },
      { cuotaId: cuota("88-551877", 9), paso: 0, ultimaNovedad: "Todavía sin avisos" },
    ]);

    // Mensajes de cobranza: los que esperan aprobación y los que ya salieron.
    const ref = (numero: string, n: number, paso: number | "diferencia") =>
      `cuota:${cuota(numero, n)}:${paso === "diferencia" ? "diferencia" : `paso:${paso}`}`;
    await tx.insert(schema.mensajes).values([
      {
        aseguradoId: aseg("Gómez, Lucía"),
        agente: "cobranza",
        canal: "whatsapp",
        destinatario: "223 512-4471",
        referencia: ref("4410-3321908", 6, 2),
        motivo: "Ayer le llegó el recordatorio y todavía no lo leyó.",
        texto: `Hola Lucía, ¿cómo estás? Te recuerdo que el ${diaSemana(2)} ${ddmm(2)} vence la cuota 6 del seguro de tu auto con Mapfre ($ 80.000). Podés pagarla por transferencia o en Rapipago con el código de siempre. Cuando pagues, mandame el comprobante por acá y queda registrado. Saludos, {productor}`,
        creadoEl: momento(0, "08:00"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Transportes Del Atlántico SRL"),
        agente: "cobranza",
        canal: "email",
        destinatario: "Marcela Ruiz (administración)",
        asunto: "Cuota 10 de la flota · diferencia pendiente",
        referencia: ref("4412-0098811", 10, "diferencia"),
        motivo: "El Validador de pagos encontró que transfirieron $ 640.000 y la cuota es $ 674.000.",
        texto: `Hola Marcela, ¿cómo estás? Recibimos la transferencia de $ 640.000 por la cuota 10 de la flota con Mapfre, muchas gracias. La cuota es de $ 674.000, así que quedan $ 34.000 pendientes antes del ${ddmm(4)}. ¿Podrás transferir la diferencia a la misma cuenta? Cualquier duda, avisame. Saludos, {productor}`,
        creadoEl: momento(-1, "17:00"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Pereyra, Martín"),
        agente: "cobranza",
        canal: "whatsapp",
        destinatario: "2291 44-1208",
        referencia: ref("22-778190", 8, 3),
        motivo: "Leyó el aviso del día del vencimiento y no respondió.",
        texto: `Hola Martín, ¿cómo andás? Te escribo porque la cuota 8 del seguro de tu auto con La Segunda ($ 58.400) venció el ${ddmm(-5)} y todavía no me figura el pago. Si ya la pagaste, mandame el comprobante y lo reviso. Si necesitás que te pase otra vez los datos para pagar, decime. Saludos, {productor}`,
        creadoEl: momento(0, "08:00"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Sosa, Ricardo"),
        agente: "cobranza",
        canal: "llamada",
        destinatario: "223 478-3021",
        referencia: ref("22-M-90314", 5, 4),
        motivo: "No respondió los dos mensajes anteriores y se acerca el plazo de gracia de la compañía.",
        texto: `El agente ya le escribió el ${ddmm(-9)} y el ${ddmm(-5)} y los dos mensajes figuran como leídos. Una llamada tuya suele destrabarlo más rápido que otro mensaje.`,
        creadoEl: momento(0, "08:00"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Distribuidora Tito Hnos. SRL"),
        agente: "cobranza",
        canal: "email",
        destinatario: "Tito Aguirre",
        asunto: "Recordatorio · cuota 4 de la flota",
        referencia: ref("4412-0101772", 4, 1),
        motivo: "Es el primer recordatorio de esta cuota. Siempre paga por transferencia.",
        texto: `Hola Tito, ¿cómo estás? Te recuerdo que el ${diaSemana(3)} ${ddmm(3)} vence la cuota 4 de la flota de reparto con Mapfre ($ 312.500). Te dejo los datos para transferir: alias mapfre.cobranzas. Cuando la pagues, respondé este email con el comprobante. Saludos, {productor}`,
        creadoEl: momento(0, "08:00"),
        esEjemplo: true,
      },
      // Historial: lo que ya se mandó.
      {
        aseguradoId: aseg("Sosa, Ricardo"),
        agente: "cobranza",
        canal: "whatsapp",
        destinatario: "223 478-3021",
        referencia: ref("22-M-90314", 5, 3),
        estado: "enviado",
        texto: "Hola Ricardo, la cuota 5 de tu seguro de moto venció y todavía no me figura el pago. Si ya pagaste, mandame el comprobante y lo reviso. Saludos, {productor}",
        creadoEl: momento(-9, "09:30"),
        enviadoEl: momento(-9, "09:31"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Sosa, Ricardo"),
        agente: "cobranza",
        canal: "whatsapp",
        destinatario: "223 478-3021",
        referencia: ref("22-M-90314", 5, 3),
        estado: "enviado",
        texto: "Hola Ricardo, ¿pudiste ver lo de la cuota 5 de la moto? Si necesitás los datos para pagar, decime y te los paso. Saludos, {productor}",
        creadoEl: momento(-5, "10:00"),
        enviadoEl: momento(-5, "10:00"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Pereyra, Martín"),
        agente: "cobranza",
        canal: "whatsapp",
        destinatario: "2291 44-1208",
        referencia: ref("22-778190", 8, 2),
        estado: "enviado",
        texto: "Hola Martín, hoy vence la cuota 8 de tu seguro de auto ($ 58.400). Si ya la pagaste, mandame el comprobante por acá. Saludos, {productor}",
        creadoEl: momento(-5, "09:00"),
        enviadoEl: momento(-5, "10:00"),
        esEjemplo: true,
      },
      {
        aseguradoId: aseg("Gómez, Lucía"),
        agente: "cobranza",
        canal: "whatsapp",
        destinatario: "223 512-4471",
        referencia: ref("4410-3321908", 6, 1),
        estado: "enviado",
        texto: `Hola Lucía, te recuerdo que el ${ddmm(2)} vence la cuota 6 de tu seguro de auto con Mapfre ($ 80.000). Podés pagarla por transferencia o Rapipago. Saludos, {productor}`,
        creadoEl: momento(-1, "09:00"),
        enviadoEl: momento(-1, "09:00"),
        esEjemplo: true,
      },
    ]);

    // Siniestros.
    type DocEj = [string, boolean, number?];
    type EvEj = [number, string, string, string];
    const siniestrosEj: {
      poliza?: string;
      asegurado?: string;
      compania?: string;
      ramo?: string;
      afectado?: string;
      tipo: string;
      descripcion: string;
      fecha: Date;
      lugar: string;
      etapa: "aviso" | "documentacion" | "compania" | "inspeccion" | "liquidacion" | "pago";
      numero?: string;
      avisoDe: string;
      relato?: string;
      denuncia?: { campo: string; valor: string }[];
      denunciaEnviadaEl?: Date;
      ultimaNovedadCompaniaEl?: Date;
      inspeccionEl?: Date;
      montoAprobado?: number;
      montoPagado?: number;
      pagadoEl?: Date;
      cerradoEl?: Date;
      resolucion?: string;
      docs: DocEj[];
      eventos: EvEj[];
    }[] = [
      {
        poliza: "61-H-44019",
        tipo: "agua",
        descripcion: "Daños por agua (filtración del techo)",
        fecha: momento(-1, "22:40"),
        lugar: "Mar del Plata, barrio Los Troncos",
        etapa: "aviso",
        avisoDe: "Carolina por WhatsApp",
        relato: `Durante la lluvia del ${ddmm(-1)} entró agua por el techo del living. Se mojó el cielorraso, que se manchó y empezó a descascararse, la pared lindera y un sillón de tela. No hubo daños a terceros.`,
        denuncia: [
          { campo: "Fecha y hora", valor: `${dia(-1).split("-").reverse().join("/")}, 22:40 aprox.` },
          { campo: "Domicilio", valor: "Calle 23 N° 1480, Mar del Plata" },
          { campo: "Bien afectado", valor: "Cielorraso y pared del living; un sillón" },
          { campo: "Causa", valor: "Filtración por el techo durante la lluvia" },
          { campo: "Fotos", valor: "6 fotos recibidas por WhatsApp" },
        ],
        docs: [
          ["Relato del hecho", true],
          ["Fotos de los daños", true, 6],
          ["Copia de DNI", true],
          ["Presupuesto del arreglo", false],
          ["Factura o foto de compra del sillón (si la tiene)", false],
        ],
        eventos: [
          [-1, "22:51", "Carolina por WhatsApp", '"Hola, se me llovió todo el living, ¿qué hago con el seguro?"'],
          [-1, "22:52", "Agente", "Le pidió fotos, la hora aproximada y qué se dañó."],
          [0, "08:15", "Agente", "Armó la denuncia con lo que mandó Carolina."],
        ],
      },
      {
        poliza: "4410-2290117",
        tipo: "choque_tercero",
        descripcion: "Choque con un tercero",
        fecha: momento(-2, "17:50"),
        lugar: "Av. Constitución y Tejedor, Mar del Plata",
        etapa: "documentacion",
        numero: "4410-S-88213",
        avisoDe: "Diego por WhatsApp",
        denunciaEnviadaEl: momento(-1, "10:30"),
        ultimaNovedadCompaniaEl: momento(-1, "10:30"),
        docs: [
          ["Fotos del vehículo", true, 8],
          ["Registro de conducir y cédula verde", true],
          ["Datos y póliza del tercero", true],
          ["Croquis del choque", true],
          ["Denuncia firmada por el asegurado", false],
        ],
        eventos: [
          [-2, "18:02", "Diego por WhatsApp", '"Me chocaron de atrás en Constitución, estoy bien. ¿Qué tengo que hacer?"'],
          [-2, "18:03", "Agente", "Le pidió fotos, los datos del otro conductor y su seguro."],
          [-1, "10:30", "Agente", "Cargó la denuncia preliminar en el portal de Mapfre."],
        ],
      },
      {
        poliza: "88-551877",
        tipo: "choque_tercero",
        descripcion: "Choque en estacionamiento",
        fecha: momento(-15, "15:20"),
        lugar: "Playa de estacionamiento, Av. Luro 3200",
        etapa: "compania",
        numero: "FP-2026-310442",
        avisoDe: "Gabriel Funes por WhatsApp",
        denunciaEnviadaEl: momento(-14, "09:10"),
        ultimaNovedadCompaniaEl: momento(-15, "15:40"),
        docs: [
          ["Denuncia firmada", true],
          ["Fotos del vehículo", true, 5],
          ["Registro del instructor", true],
          ["Presupuesto del taller", true],
        ],
        eventos: [
          [-15, "15:40", "Gabriel Funes por WhatsApp", "Avisó del choque y mandó fotos."],
          [-14, "09:10", "Agente", "Presentó la denuncia completa en el portal."],
          [-7, "09:00", "Agente", 'Consultó el estado: "en análisis".'],
        ],
      },
      {
        poliza: "61-200455",
        tipo: "cristales",
        descripcion: "Rotura de vidriera",
        fecha: momento(-7, "06:30"),
        lugar: "Local de Av. Independencia 2150",
        etapa: "inspeccion",
        numero: "61-S-772910",
        avisoDe: "Raúl Benítez por WhatsApp",
        denunciaEnviadaEl: momento(-7, "11:00"),
        ultimaNovedadCompaniaEl: momento(-3, "14:20"),
        inspeccionEl: momento(2, "10:00"),
        docs: [
          ["Denuncia firmada", true],
          ["Fotos de la vidriera", true, 4],
          ["Presupuesto de vidriería", true],
        ],
        eventos: [
          [-7, "07:15", "Raúl Benítez por WhatsApp", "Avisó que encontraron la vidriera rota al abrir."],
          [-7, "11:00", "Agente", "Presentó la denuncia en Sancor."],
          [-3, "14:20", "Sancor", `Asignó inspector: ${diaSemana(2)} ${ddmm(2)}, 10:00.`],
        ],
      },
      {
        poliza: "4415-0012270",
        tipo: "carga",
        descripcion: "Faltante de mercadería en tránsito",
        fecha: momento(-25, "20:00"),
        lugar: "Ruta 2, km 340",
        etapa: "liquidacion",
        numero: "4410-S-87120",
        avisoDe: "Marcela Ruiz por email",
        denunciaEnviadaEl: momento(-24, "10:00"),
        ultimaNovedadCompaniaEl: momento(-4, "16:45"),
        montoAprobado: 1250000,
        docs: [
          ["Denuncia y remitos", true],
          ["Denuncia policial", true],
          ["Factura de la mercadería", true],
          ["Informe del liquidador", true],
        ],
        eventos: [
          [-25, "21:30", "Marcela Ruiz por email", "Informó el faltante al llegar a destino."],
          [-24, "10:00", "Agente", "Presentó la denuncia con remitos y denuncia policial."],
          [-4, "16:45", "Mapfre", "Aprobó la indemnización por $ 1.250.000."],
        ],
      },
      {
        poliza: "88-322019",
        tipo: "cristales",
        descripcion: "Rotura de cristal",
        fecha: momento(-29, "09:00"),
        lugar: "Mar del Plata",
        etapa: "pago",
        numero: "FP-2026-298110",
        avisoDe: "Valeria por WhatsApp",
        denunciaEnviadaEl: momento(-29, "12:00"),
        cerradoEl: momento(-21, "16:00"),
        resolucion: "parabrisas reemplazado",
        docs: [
          ["Denuncia firmada", true],
          ["Fotos del parabrisas", true],
        ],
        eventos: [
          [-29, "09:30", "Valeria por WhatsApp", "Avisó la rotura del parabrisas."],
          [-21, "16:00", "Federación Patronal", "Cristalería asignada hizo el reemplazo."],
        ],
      },
      {
        poliza: "61-I-28870",
        tipo: "robo",
        descripcion: "Robo de equipamiento",
        fecha: momento(-53, "08:00"),
        lugar: "Consultorio de calle Córdoba",
        etapa: "pago",
        numero: "61-S-760455",
        avisoDe: "Dra. Paula Ríos por WhatsApp",
        denunciaEnviadaEl: momento(-52, "10:00"),
        montoAprobado: 2180000,
        montoPagado: 2180000,
        pagadoEl: momento(-12, "12:00"),
        cerradoEl: momento(-12, "12:00"),
        docs: [
          ["Denuncia policial", true],
          ["Facturas del equipamiento", true],
        ],
        eventos: [
          [-53, "08:30", "Dra. Paula Ríos por WhatsApp", "Avisó del robo."],
          [-12, "12:00", "Sancor", "Transfirió la indemnización."],
        ],
      },
      {
        poliza: "88-401276",
        tipo: "granizo",
        descripcion: "Granizo",
        fecha: momento(-73, "17:00"),
        lugar: "Mar del Plata",
        etapa: "pago",
        numero: "FP-2026-281904",
        avisoDe: "Ricardo por WhatsApp",
        denunciaEnviadaEl: momento(-72, "10:00"),
        montoAprobado: 640000,
        montoPagado: 640000,
        pagadoEl: momento(-39, "12:00"),
        cerradoEl: momento(-39, "12:00"),
        docs: [
          ["Denuncia firmada", true],
          ["Fotos del vehículo", true],
        ],
        eventos: [
          [-73, "18:00", "Ricardo por WhatsApp", "Avisó daños por granizo."],
          [-39, "12:00", "Federación Patronal", "Transfirió la indemnización."],
        ],
      },
      {
        poliza: "4412-0098812",
        tipo: "choque_tercero",
        descripcion: "Choque en Ruta 2, sin lesionados",
        fecha: momento(-72, "06:40"),
        lugar: "Ruta 2, km 120",
        etapa: "pago",
        numero: "4410-S-85502",
        avisoDe: "Marcela Ruiz por email",
        denunciaEnviadaEl: momento(-71, "10:00"),
        montoAprobado: 1400000,
        montoPagado: 1400000,
        pagadoEl: momento(-45, "12:00"),
        cerradoEl: momento(-45, "12:00"),
        docs: [
          ["Denuncia firmada", true],
          ["Fotos del camión", true, 12],
          ["Presupuesto del taller", true],
        ],
        eventos: [
          [-72, "08:00", "Marcela Ruiz por email", "Avisó del choque del camión AC 456 EF."],
          [-45, "12:00", "Mapfre", "Transfirió la indemnización."],
        ],
      },
      {
        tipo: "accidentes_personales",
        descripcion: "Accidente durante una actividad recreativa",
        fecha: momento(-3, "11:20"),
        lugar: "Club de barrio, Mar del Plata",
        etapa: "documentacion",
        avisoDe: "Caso de ejemplo",
        ramo: "Accidentes personales",
        compania: "Aseguradora de prueba",
        afectado: "Persona de prueba",
        relato: "Expediente sintético para mostrar el flujo de accidentes personales.",
        docs: [
          ["Relato del hecho", true],
          ["Constancia de cobertura", false],
          ["Comprobantes de gastos reclamados", false],
          ["Datos de contacto del afectado", true],
        ],
        eventos: [[-3, "11:30", "Caso de ejemplo", "Se creó un expediente sintético sin póliza vinculada."]],
      },
    ];
    for (const s of siniestrosEj) {
      const polizaId = s.poliza ? pol(s.poliza) : null;
      const [datosPoliza] = polizaId ? await tx.select({ aseguradoId: schema.polizas.aseguradoId, compania: schema.polizas.compania, ramo: schema.polizas.ramo }).from(schema.polizas).where(eq(schema.polizas.id, polizaId)) : [];
      const [fila] = await tx
        .insert(schema.siniestros)
        .values({
          polizaId,
          aseguradoId: s.asegurado ? aseg(s.asegurado) : datosPoliza?.aseguradoId ?? null,
          compania: s.compania ?? datosPoliza?.compania ?? null,
          ramo: s.ramo ?? datosPoliza?.ramo ?? null,
          afectado: s.afectado ?? null,
          tipo: s.tipo,
          descripcion: s.descripcion,
          fecha: s.fecha,
          lugar: s.lugar,
          relato: s.relato ?? null,
          numeroCompania: s.numero ?? null,
          etapa: s.etapa,
          avisoDe: s.avisoDe,
          denuncia: s.denuncia ?? null,
          denunciaEnviadaEl: s.denunciaEnviadaEl ?? null,
          ultimaNovedadCompaniaEl: s.ultimaNovedadCompaniaEl ?? null,
          inspeccionEl: s.inspeccionEl ?? null,
          montoAprobado: s.montoAprobado ?? null,
          montoPagado: s.montoPagado ?? null,
          pagadoEl: s.pagadoEl ?? null,
          cerrado: Boolean(s.cerradoEl),
          esEjemplo: true,
          cerradoEl: s.cerradoEl ?? null,
          resolucion: s.resolucion ?? null,
          creadoEl: s.fecha,
        })
        .returning({ id: schema.siniestros.id });
      await tx.update(schema.siniestros).set({ folio: `SIN-${String(fila.id).padStart(6, "0")}` }).where(eq(schema.siniestros.id, fila.id));
      await tx.insert(schema.siniestroRequisitos).values(
        s.docs.map(([nombre, recibido, cantidad]) => ({
          siniestroId: fila.id,
          nombre,
          recibido,
          cantidad: cantidad ?? null,
          recibidoEl: recibido ? s.fecha : null,
        })),
      );
      await tx.insert(schema.siniestroEventos).values(
        s.eventos.map(([d, hora, quien, texto]) => ({ siniestroId: fila.id, fecha: momento(d, hora), quien, texto })),
      );
    }

    // Notas de la ficha (Transportes Del Atlántico).
    await tx.insert(schema.notasAsegurado).values([
      {
        aseguradoId: aseg("Transportes Del Atlántico SRL"),
        fecha: momento(-86, "11:00"),
        tipo: "nota",
        texto: "El dueño piensa ampliar el depósito el año que viene. Ofrecer Integral.",
      },
      {
        aseguradoId: aseg("Transportes Del Atlántico SRL"),
        fecha: momento(-45, "12:00"),
        tipo: "sistema",
        texto: "Siniestro del camión AC 456 EF cerrado. Pagado $ 1.400.000.",
      },
      {
        aseguradoId: aseg("Transportes Del Atlántico SRL"),
        fecha: momento(-3, "09:30"),
        tipo: "sistema",
        texto: "Datos actualizados desde cartera_octubre.csv.",
      },
    ]);

    // Solicitudes de cotización.
    const [logistica] = await tx
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(eq(schema.leads.empresa, "Logística Atlántica SRL"))
      .limit(1);
    const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000);
    const cot = (compania: string, precio: number | null, observacion?: string): CotizacionRecibida => ({
      compania,
      precio,
      ...(observacion && { observacion }),
    });
    await tx.insert(schema.solicitudesCotizacion).values([
      {
        numero: 1042,
        aseguradoId: aseg("Gómez, Lucía"),
        cliente: "Gómez, Lucía",
        tipo: "renovacion",
        ramo: "Auto",
        bien: "Peugeot 208",
        motivo: "Renovación",
        origen: "whatsapp",
        estado: "lista",
        nota: "Lista para revisar",
        companias: ["Mapfre", "Sancor", "Federación Patronal", "La Segunda"],
        cotizaciones: [cot("Sancor", 912000), cot("Mapfre", 958000), cot("Federación Patronal", 1004000), cot("La Segunda", 979000)],
        creadoEl: hace(60 * 26),
        actualizadoEl: hace(20),
        esEjemplo: true,
      },
      {
        numero: 1041,
        aseguradoId: aseg("Transportes Del Atlántico SRL"),
        cliente: "Transportes Del Atlántico SRL",
        tipo: "renovacion",
        ramo: "Flota",
        bien: "3 camiones",
        motivo: "Renovación",
        origen: "email",
        estado: "esperando",
        nota: "Falta Sancor",
        companias: ["Mapfre", "Sancor", "Federación Patronal"],
        cotizaciones: [cot("Mapfre", 8640000), cot("Federación Patronal", 9120000)],
        creadoEl: hace(60 * 3),
        actualizadoEl: hace(60),
        esEjemplo: true,
      },
      {
        numero: 1040,
        leadId: logistica?.id ?? null,
        cliente: "Logística Atlántica SRL",
        tipo: "nueva",
        ramo: "Flota",
        bien: "2 camiones",
        motivo: "Empresa nueva",
        origen: "manual",
        estado: "atencion",
        nota: "Falta una patente",
        companias: ["Mapfre", "Sancor", "Federación Patronal"],
        cotizaciones: [],
        creadoEl: hace(60 * 4),
        actualizadoEl: hace(120),
        esEjemplo: true,
      },
      {
        numero: 1039,
        aseguradoId: aseg("Acosta, Valeria"),
        cliente: "Acosta, Valeria",
        tipo: "mejora",
        ramo: "Auto",
        bien: "Chevrolet Onix",
        motivo: "Subir a terceros completo",
        origen: "whatsapp",
        estado: "enviada",
        nota: "Esperando respuesta",
        companias: ["Federación Patronal", "Mapfre", "Sancor"],
        cotizaciones: [cot("Federación Patronal", 1140000), cot("Mapfre", 1215000), cot("Sancor", 1190000)],
        creadoEl: hace(60 * 50),
        actualizadoEl: hace(60 * 24),
        esEjemplo: true,
      },
      {
        numero: 1038,
        aseguradoId: aseg("Ibáñez, Carolina"),
        cliente: "Ibáñez, Carolina",
        tipo: "mejora",
        ramo: "Hogar",
        bien: "Departamento",
        motivo: "Actualizar suma asegurada",
        origen: "email",
        estado: "atencion",
        nota: "La compañía pide inspección",
        companias: ["Sancor", "Mapfre", "La Segunda"],
        cotizaciones: [cot("Sancor", 465000), cot("Mapfre", 498000)],
        creadoEl: hace(60 * 48),
        actualizadoEl: hace(60 * 25),
        esEjemplo: true,
      },
      {
        numero: 1037,
        aseguradoId: aseg("Distribuidora Tito Hnos. SRL"),
        cliente: "Distribuidora Tito Hnos. SRL",
        tipo: "renovacion",
        ramo: "Integral de comercio",
        bien: "Depósito",
        motivo: "Renovación",
        origen: "whatsapp",
        estado: "ganada",
        nota: "Renovada",
        companias: ["Mapfre", "Sancor", "La Segunda"],
        cotizaciones: [cot("Mapfre", 1610000), cot("Sancor", 1720000), cot("La Segunda", 1685000)],
        creadoEl: hace(60 * 24 * 6),
        actualizadoEl: hace(60 * 24 * 3),
        esEjemplo: true,
      },
      {
        numero: 1036,
        aseguradoId: aseg("Pereyra, Martín"),
        cliente: "Pereyra, Martín",
        tipo: "mejora",
        ramo: "Auto",
        bien: "VW Gol Trend",
        motivo: "Pasar a todo riesgo",
        origen: "whatsapp",
        estado: "perdida",
        nota: "Sigue con terceros",
        companias: ["La Segunda", "Mapfre", "Federación Patronal"],
        cotizaciones: [cot("La Segunda", 1290000), cot("Mapfre", 1355000), cot("Federación Patronal", 1340000)],
        creadoEl: hace(60 * 24 * 9),
        actualizadoEl: hace(60 * 24 * 5),
        esEjemplo: true,
      },
      {
        numero: 1035,
        aseguradoId: aseg("Escuela de Conducir Faro SRL"),
        cliente: "Escuela de Conducir Faro SRL",
        tipo: "renovacion",
        ramo: "Flota",
        bien: "5 autos doble comando",
        motivo: "Renovación",
        origen: "email",
        estado: "esperando",
        nota: "Falta Mapfre",
        companias: ["Federación Patronal", "Mapfre"],
        cotizaciones: [cot("Federación Patronal", null, "Pide inspección de los autos antes de cotizar")],
        creadoEl: hace(60 * 24 * 6),
        actualizadoEl: hace(60 * 24 * 5),
        esEjemplo: true,
      },
    ]);
    // La demo del agente muestra cinco solicitudes en estados distintos.
    await tx.delete(schema.solicitudesCotizacion).where(and(eq(schema.solicitudesCotizacion.numero, 1038), eq(schema.solicitudesCotizacion.esEjemplo, true)));
    await tx.delete(schema.solicitudesCotizacion).where(and(eq(schema.solicitudesCotizacion.numero, 1036), eq(schema.solicitudesCotizacion.esEjemplo, true)));
    await tx.delete(schema.solicitudesCotizacion).where(and(eq(schema.solicitudesCotizacion.numero, 1035), eq(schema.solicitudesCotizacion.esEjemplo, true)));
    await tx.insert(schema.actividadAgentes).values([
      {
        agente: "cotizacion",
        fecha: momento(0, "09:15"),
        referencia: "solicitud:1040",
        texto: "Pausó la solicitud 1040: falta la patente de uno de los camiones. Te la dejó marcada para que la pidas.",
        esEjemplo: true,
      },
      {
        agente: "cotizacion",
        fecha: momento(0, "09:58"),
        referencia: "solicitud:1041",
        texto: "Pidió precio a Mapfre, Sancor y Federación Patronal para la flota de Transportes Del Atlántico (solicitud 1041).",
        esEjemplo: true,
      },
      {
        agente: "cotizacion",
        fecha: momento(0, "10:42"),
        referencia: "solicitud:1042",
        texto: "Envió la comparativa de la solicitud 1042 a tu revisión: 4 de 4 compañías respondieron.",
        esEjemplo: true,
      },
    ]);

    const solicitudesDemo = await tx.select().from(schema.solicitudesCotizacion).where(eq(schema.solicitudesCotizacion.esEjemplo, true));
    const aseguradorasDemo = await tx.select({ id: schema.cotizacionAseguradoras.id, nombre: schema.cotizacionAseguradoras.nombre }).from(schema.cotizacionAseguradoras);
    for (const solicitud of solicitudesDemo) {
      const enviosDemo = await tx.insert(schema.cotizacionEnvios).values(solicitud.companias.map((compania) => {
        const cotizacion = solicitud.cotizaciones.find((item) => item.compania === compania);
        const recibida = cotizacion?.precio != null;
        const atencion = solicitud.estado === "atencion" && !recibida;
        const aseguradora = aseguradorasDemo.find((item) => item.nombre === compania);
        return {
          solicitudId: solicitud.id,
          aseguradoraId: aseguradora?.id ?? null,
          compania,
          estado: recibida ? "cotizado" as const : atencion ? "pendiente" as const : "enviado" as const,
          estadoBorrador: atencion ? "pendiente" as const : "aprobado" as const,
          aprobadoEl: atencion ? null : solicitud.creadoEl,
          asuntoBorrador: `SOLICITUD – ${solicitud.ramo} – ${compania}`,
          cuerpoBorrador: `Solicitud ${solicitud.numero} · ${solicitud.ramo}${solicitud.bien ? ` · ${solicitud.bien}` : ""}`,
          ultimaActividad: solicitud.actualizadoEl,
          proximoSeguimiento: atencion ? new Date(Date.now() - 60_000) : null,
        };
      })).returning({ id: schema.cotizacionEnvios.id, compania: schema.cotizacionEnvios.compania });
      const resultadosDemo = enviosDemo.flatMap((envio) => {
        const cotizacion = solicitud.cotizaciones.find((item) => item.compania === envio.compania);
        return cotizacion?.precio != null ? [{ envioId: envio.id, primaTotal: cotizacion.precio, primaNeta: Math.round(cotizacion.precio * 0.8), confirmado: true }] : [];
      });
      if (resultadosDemo.length) await tx.insert(schema.cotizacionResultados).values(resultadosDemo);
    }

    // Liquidaciones de comisiones del mes pasado (La Segunda todavía no liquidó).
    const liquidaciones: {
      compania: string;
      recibida: number;
      depositada: number;
      origen: string;
      retenciones: Retenciones;
      /** Pólizas que no vinieron en la liquidación. */
      faltan?: string[];
      /** Pólizas liquidadas con otro porcentaje. */
      porcentajes?: Record<string, number>;
    }[] = [
      { compania: "Sancor", recibida: 8, depositada: 12, origen: "portal", retenciones: { iibb: 3844, ganancias: 2563 }, faltan: ["61-I-30018", "61-H-44019"] },
      {
        compania: "Federación Patronal",
        recibida: 6,
        depositada: 9,
        origen: "portal",
        retenciones: { iibb: 5443, ganancias: 3629 },
        porcentajes: { "88-551877": 10 },
      },
      { compania: "Mapfre", recibida: 5, depositada: 7, origen: "portal", retenciones: { iibb: 7467, ganancias: 4978 } },
      { compania: "Fianzas y Crédito", recibida: 7, depositada: 7, origen: "email", retenciones: {} },
    ];
    const cobradas = CUOTAS.filter(([, , , vence, pago]) => typeof vence !== "number" && pago);
    const companiaDe = new Map(ASEGURADOS.flatMap((a) => a.polizas.map((x) => [x.numero, x] as const)));
    for (const l of liquidaciones) {
      const items = cobradas
        .filter(([numero]) => companiaDe.get(numero)!.compania === l.compania && !l.faltan?.includes(numero))
        .map(([numero, n, monto]) => {
          const ramo = companiaDe.get(numero)!.ramo;
          const porcentaje = l.porcentajes?.[numero] ?? ACUERDOS[l.compania][ramo];
          return {
            polizaNumero: numero,
            polizaId: pol(numero),
            cuotaNumero: n,
            base: monto,
            porcentaje,
            comision: Math.round(monto * porcentaje) / 100,
          };
        });
      // Lo que el Validador dio por pagado en el período también se liquidó.
      const delValidador = await tx
        .select({ numero: schema.polizas.numero, polizaId: schema.polizas.id, ramo: schema.polizas.ramo, n: schema.cuotas.numero, monto: schema.cuotas.monto })
        .from(schema.cuotas)
        .innerJoin(schema.polizas, eq(schema.polizas.id, schema.cuotas.polizaId))
        .where(and(
          eq(schema.polizas.compania, l.compania),
          inArray(schema.polizas.numero, validador.polizas),
          eq(schema.cuotas.estado, "pagada"),
          gte(schema.cuotas.pagadaEl, new Date(`${periodo}-01T00:00:00-03:00`)),
          lt(schema.cuotas.pagadaEl, new Date(`${primeroDelMes}T00:00:00-03:00`)),
        ));
      for (const c of delValidador) {
        const porcentaje = ACUERDOS[l.compania][c.ramo];
        items.push({ polizaNumero: c.numero!, polizaId: c.polizaId, cuotaNumero: c.n, base: c.monto, porcentaje, comision: Math.round(c.monto * porcentaje) / 100 });
      }
      const liquidado = items.reduce((s, i) => s + i.comision, 0);
      const retenido = (l.retenciones.iibb ?? 0) + (l.retenciones.ganancias ?? 0);
      const [fila] = await tx
        .insert(schema.liquidacionesComision)
        .values({
          compania: l.compania,
          periodo,
          recibidaEl: `${hoy.slice(0, 7)}-${String(l.recibida).padStart(2, "0")}`,
          origen: l.origen,
          montoLiquidado: liquidado,
          depositado: liquidado - retenido,
          depositadoEl: `${hoy.slice(0, 7)}-${String(l.depositada).padStart(2, "0")}`,
          retenciones: l.retenciones,
          esEjemplo: true,
          creadoEl: delMes(l.recibida, "09:00"),
        })
        .returning({ id: schema.liquidacionesComision.id });
      await tx.insert(schema.liquidacionItems).values(items.map((i) => ({ ...i, liquidacionId: fila.id })));
    }

    // Acuerdos, compañías, conexiones y agentes: no se pisan si ya existen.
    await tx
      .insert(schema.acuerdosComision)
      .values(
        Object.entries(ACUERDOS).flatMap(([compania, ramos]) =>
          Object.entries(ramos).map(([ramo, porcentaje]) => ({ compania, ramo, porcentaje })),
        ),
      )
      .onConflictDoNothing();
    await tx.insert(schema.companias).values(COMPANIAS).onConflictDoNothing();
    // Gracia del Validador (la usa también Cobranza): los 30 días de siempre, para todos los ramos, salvo en dos compañías.
    await tx
      .insert(schema.validadorGracia)
      .values(COMPANIAS.map((c) => {
        const [diasPrimera, diasSiguientes] = graciaDeEjemplo(c.nombre);
        return { compania: c.nombre, ramo: "*", diasPrimera, diasSiguientes };
      }))
      .onConflictDoNothing();
    const conectada = (clave: string, tipo: string, datos: Record<string, string | boolean>, compania?: string) => ({
      clave,
      tipo,
      compania: compania ?? null,
      estado: "conectado" as const,
      datos: { ...datos, ejemplo: true },
    });
    await tx
      .insert(schema.conexiones)
      .values([
        conectada("email", "email", { direccion: "cotizaciones@[tu-dominio].com.ar", proveedor: "Gmail" }),
        ...["Mapfre", "Sancor", "Federación Patronal", "La Segunda"].map((c) =>
          conectada(`portal:${c}`, "portal", { usuario: "[código]" }, c),
        ),
        {
          clave: "portal:Fianzas y Crédito",
          tipo: "portal",
          compania: "Fianzas y Crédito",
          estado: "por_email" as const,
          datos: { ejemplo: true },
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.configuracionAgentes)
      .values(
        ["cotizacion", "validador", "siniestros", "cobranza", "conciliador"].map((agente) => ({
          agente,
          configurado: true,
          config: agente === "cobranza" ? CONFIG_COBRANZA_INICIAL : {},
        })),
      )
      .onConflictDoNothing();
  });

  const [{ total }] = (await db.execute(sql`select count(*)::int as total from asegurados where es_ejemplo`)) as unknown as {
    total: number;
  }[];
  console.log(`Listo: ${total} asegurados de ejemplo con sus pólizas, cuotas, siniestros y liquidaciones.`);
}
