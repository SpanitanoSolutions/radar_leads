import { and, eq } from "drizzle-orm";
import { sumarDias } from "@/lib/fechas";
import type { EstadoCaso, TipoEventoCobranza } from "@/lib/cobranza/tipos";
import { db, schema } from "./index";

// Demo del Agente de Cobranza (Configuración → Demo y `npm run db:seed:cobranza`):
// unos 100 asegurados ficticios con un recibo cada uno, vencimientos de -40 a
// +30 días, ~10 % sin contacto, algunos excluidos y una línea de tiempo con
// todos los tipos de evento. Todo va marcado como ejemplo, y los asegurados
// llevan la nota NOTA_DEMO: así se borra sola o con "Borrar datos de ejemplo".

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const NOTA_DEMO = "Asegurado ficticio de la demo del Agente de Cobranza.";

const NOMBRES = ["Lucía", "Martín", "Valeria", "Diego", "Carolina", "Federico", "Florencia", "Gonzalo", "Romina", "Sebastián", "Natalia", "Matías", "Agustina", "Hernán", "Julieta", "Pablo", "Mariela", "Ignacio", "Daniela", "Facundo"];
const APELLIDOS = ["Benítez", "Ferreyra", "Aguirre", "Domínguez", "Paz", "Sosa", "Villalba", "Ledesma", "Rojas", "Correa", "Molina", "Ojeda", "Quiroga", "Godoy", "Luna", "Vega", "Ríos", "Acosta", "Peralta", "Herrera"];
const EMPRESAS = ["Talleres del Puerto SRL", "Panificadora La Espiga SA", "Logística Atlántica SRL", "Ferretería El Tornillo SRL", "Clínica Veterinaria Sur SA", "Constructora Batán SRL", "Distribuidora Costa Azul SA", "Estudio Contable Mitre SRL", "Lácteos del Sudeste SA", "Transportes Laguna SRL", "Hotel Playa Grande SA", "Imprenta Colón SRL", "Óptica Güemes SRL", "Viveros Los Talas SA", "Pinturería Constitución SRL"];
const COMPANIAS = ["Sancor", "La Segunda", "Federación Patronal", "Rivadavia", "Mercantil Andina", "Allianz", "Zurich"];
const SIGLAS: Record<string, string> = { Sancor: "SAN", "La Segunda": "SEG", "Federación Patronal": "FP", Rivadavia: "RIV", "Mercantil Andina": "MA", Allianz: "ALZ", Zurich: "ZUR" };
const RAMOS_PERSONA = [
  { ramo: "Auto", base: 52_000, forma: "Débito automático" },
  { ramo: "Hogar", base: 14_500, forma: "Tarjeta de crédito" },
  { ramo: "Vida", base: 9_800, forma: "Débito automático" },
  { ramo: "Auto", base: 61_000, forma: "Transferencia" },
];
const RAMOS_EMPRESA = [
  { ramo: "Flota", base: 280_000, forma: "Transferencia" },
  { ramo: "Integral de comercio", base: 74_000, forma: "Transferencia" },
  { ramo: "ART", base: 190_000, forma: "Transferencia" },
];

/** Pseudoazar con semilla: la demo sale igual cada vez. */
function generador(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Borra la demo anterior (si la hay) sin tocar el resto de los ejemplos. */
export async function borrarDemoCobranza(tx: Tx | typeof db = db): Promise<number> {
  const borrados = await tx
    .delete(schema.asegurados)
    .where(and(eq(schema.asegurados.esEjemplo, true), eq(schema.asegurados.notas, NOTA_DEMO)))
    .returning({ id: schema.asegurados.id });
  return borrados.length;
}

type Plan = { estado: EstadoCaso; intentos: number; dias: number };

export async function cargarDemoCobranza(hoy: string, cantidad = 100): Promise<{ casos: number }> {
  const azar = generador(20261031);
  const entre = (min: number, max: number) => Math.floor(min + azar() * (max - min + 1));
  const elegir = <T>(lista: T[]) => lista[Math.floor(azar() * lista.length)];
  const momento = (dias: number, hora = 10) => new Date(`${sumarDias(hoy, dias)}T${String(hora).padStart(2, "0")}:${String(entre(0, 59)).padStart(2, "0")}:00-03:00`);
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  return db.transaction(async (tx) => {
    await borrarDemoCobranza(tx);

    let creados = 0;
    for (let i = 0; i < cantidad; i++) {
      const empresa = i % 7 === 3;
      const sinContacto = i % 10 === 7;
      const nombre = empresa ? `${EMPRESAS[i % EMPRESAS.length]}${i >= EMPRESAS.length * 7 ? ` ${Math.floor(i / 7)}` : ""}` : `${APELLIDOS[i % APELLIDOS.length]}, ${NOMBRES[(i * 7 + 3) % NOMBRES.length]}`;
      const telefono = sinContacto ? null : `223 ${entre(400, 699)}-${String(entre(0, 9999)).padStart(4, "0")}`;
      const correo = sinContacto || (!empresa && azar() < 0.35) ? null : `${normalizarCorreo(nombre)}@ejemplo.com.ar`;
      const [a] = await tx
        .insert(schema.asegurados)
        .values({
          tipo: empresa ? "empresa" : "persona",
          nombre,
          documento: empresa ? `30-${entre(50_000_000, 79_999_999)}-${entre(0, 9)}` : String(entre(20_000_000, 45_000_000)),
          localidad: "Mar del Plata",
          telefono: empresa ? null : telefono,
          email: empresa ? null : correo,
          contactoNombre: empresa ? `${elegir(NOMBRES)} ${elegir(APELLIDOS)} (administración)` : null,
          contactoTelefono: empresa ? telefono : null,
          contactoEmail: empresa ? correo : null,
          clienteDesde: entre(2012, 2025),
          notas: NOTA_DEMO,
          esEjemplo: true,
        })
        .returning({ id: schema.asegurados.id });

      const compania = COMPANIAS[(i * 3) % COMPANIAS.length];
      const tipoRamo = empresa ? elegir(RAMOS_EMPRESA) : elegir(RAMOS_PERSONA);
      const sorteo = entre(-40, 30);
      // El plan de cada caso, coherente con sus días y su contacto.
      const plan: Plan = sinContacto ? { estado: "sin_datos", intentos: 0, dias: sorteo } : planDelCaso(i, sorteo, azar);
      const dias = plan.dias;
      const vencimiento = sumarDias(hoy, dias);
      const vigenciaDesde = sumarDias(vencimiento, -entre(30, 300));
      const numeroCuota = entre(2, 11);
      const [p] = await tx
        .insert(schema.polizas)
        .values({
          aseguradoId: a.id,
          ramo: tipoRamo.ramo,
          compania,
          numero: `${SIGLAS[compania]}-${tipoRamo.ramo.slice(0, 2).toUpperCase()}-${String(1_000_000 + i * 7919).slice(-7)}`,
          vigenciaDesde,
          vigenciaHasta: sumarDias(vigenciaDesde, 365),
          cantidadCuotas: 12,
          formaPago: tipoRamo.forma,
        })
        .returning({ id: schema.polizas.id, numero: schema.polizas.numero });
      const monto = Math.round(tipoRamo.base * (0.7 + azar() * 0.8) * 100) / 100;

      const pagada = plan.estado === "pagado";
      const [c] = await tx
        .insert(schema.cuotas)
        .values({
          polizaId: p.id,
          numero: numeroCuota,
          monto,
          vencimiento,
          cupon: `${String(1_000_000 + i * 7919).slice(-7)}${String(numeroCuota).padStart(3, "0")}`,
          estado: pagada ? "pagada" : dias < 0 ? "vencida" : "pendiente",
          pagadaEl: pagada ? momento(-entre(0, 3), 15) : null,
          estadoValidacion: pagada ? "pagada" : null,
          origenConfirmacion: pagada ? "listado" : null,
          medioPago: pagada ? "Informado por la compañía" : null,
        })
        .returning({ id: schema.cuotas.id });

      if (plan.estado === "excluido") {
        await tx.insert(schema.cobranzaNoContactar).values({ aseguradoId: a.id, motivo: i === BAJA ? "baja" : "manual" });
      }
      const ultimo = plan.intentos ? momento(-Math.min(3, Math.max(1, Math.abs(dias) % 4)), 11) : null;
      const promesaEl = plan.estado === "promesa" ? sumarDias(hoy, entre(1, 6)) : null;
      const [k] = await tx
        .insert(schema.cobranzaCasos)
        .values({
          cuotaId: c.id,
          aseguradoId: a.id,
          estado: plan.estado,
          motivo: MOTIVO[plan.estado] ?? null,
          intentos: plan.intentos,
          ultimoContactoEl: ultimo,
          promesaEl,
          pagadoEl: pagada ? momento(-entre(0, 3), 15) : null,
          esEjemplo: true,
          creadoEl: momento(Math.min(-1, dias - 5), 9),
        })
        .returning({ id: schema.cobranzaCasos.id });

      // La línea de tiempo.
      const canal = empresa && correo ? "email" : telefono ? "whatsapp" : "email";
      const prueba = i % 9 === 0;
      const eventos: (typeof schema.cobranzaEventos.$inferInsert)[] = [];
      const ev = (tipo: TipoEventoCobranza, resumen: string, cuando: Date, extra: Partial<typeof schema.cobranzaEventos.$inferInsert> = {}) =>
        eventos.push({ casoId: k.id, tipo, resumen, creadoEl: cuando, esPrueba: prueba, ...extra });
      for (let n = 1; n <= plan.intentos; n++) {
        const cuando = momento(-(plan.intentos - n) * 3 - 1, 10);
        const vencido = dias < 0 ? `vencida hace ${-dias} días` : `vence el ${ddmm(vencimiento)}`;
        if (n === 3 && i % 4 === 0) {
          ev("llamada_buzon", `Llamada a buzón. Intento ${n}. Póliza ${vencido}.`, cuando, { canal: "telefono" });
        } else if (n === 2 && canal === "email" && i % 5 === 1) {
          ev("correo_fallido", `El correo rebotó: la casilla no existe. Intento ${n}.`, cuando, { canal: "email" });
        } else {
          ev(canal === "email" ? "email_enviado" : "whatsapp_enviado", `${n === 1 ? "Primer aviso" : `Intento ${n}`}: ${vencido}, ${formatoPesos(monto)}.`, cuando, {
            canal,
            datos: { texto: `Hola, te escribo por la cuota ${numeroCuota} de tu seguro de ${tipoRamo.ramo.toLowerCase()} con ${compania} (${formatoPesos(monto)}), que ${vencido}. Si ya la pagaste, avisame y lo reviso. ¡Gracias!` },
          });
          if (n < plan.intentos || plan.estado === "sin_respuesta" || plan.estado === "escalado") ev("sin_respuesta", `Sin respuesta. ${n === 4 ? "Cuarto" : `Intento ${n}`} intento total.`, momento(-(plan.intentos - n) * 3 + 1, 18));
        }
      }
      const ahoraEv = momento(-1, 17);
      if (plan.estado === "promesa") {
        ev(canal === "email" ? "email_respondido" : "whatsapp_respondido", "Respondió que paga en estos días.", ahoraEv, { canal, datos: { texto: "Hola! Sí, lo pago en estos días, gracias por avisar." } });
        ev("promesa", `Prometió pagar el ${ddmm(promesaEl!)}.`, ahoraEv);
      }
      if (plan.estado === "escalado") ev("escalado", `Sin respuesta después de ${plan.intentos} intentos: te lo pasé para que lo llames.`, ahoraEv);
      if (plan.estado === "rechazado") {
        ev("whatsapp_respondido", "Respondió que no piensa pagar.", ahoraEv, { canal: "whatsapp", datos: { texto: "No voy a pagar más, quiero dar de baja la póliza." } });
        ev("rechazo", "Dice que no va a pagar y quiere dar de baja la póliza.", ahoraEv);
        ev("escalado", "Te avisé: quiere dar de baja la póliza.", ahoraEv);
      }
      if (plan.estado === "respondio") {
        ev("whatsapp_respondido", "Preguntó por el monto de la cuota.", ahoraEv, { canal: "whatsapp", datos: { texto: "Hola, ¿por qué subió la cuota este mes?" } });
        ev("respondio", "Consulta: pregunta por qué aumentó la cuota. Necesita tu respuesta.", ahoraEv);
      }
      if (plan.estado === "informo_pago") {
        ev("email_respondido", "Respondió que ya pagó por home banking.", ahoraEv, { canal: "email", datos: { texto: "Buenas tardes, ya la abonamos ayer por home banking. Saludos." } });
        ev("informo_pago", "Dice que ya pagó: lo confirma el Validador de pagos.", ahoraEv);
      }
      if (plan.estado === "pagado") ev("pagado", `${compania} informó el pago (Validador de pagos).`, momento(-1, 15));
      if (plan.estado === "excluido") ev(i === BAJA ? "baja" : "excluido", i === BAJA ? "Pidió no recibir más mensajes: el agente no le vuelve a escribir." : "Lo marcaste para no contactar.", momento(-5, 9));
      if (plan.estado === "sin_datos") ev("nota", "No tiene teléfono ni email: completá el contacto para que el agente le escriba.", momento(-2, 9));
      if (i === 5) ev("error", "No se pudo enviar: WhatsApp respondió que el número no tiene cuenta.", momento(-2, 10), { canal: "whatsapp" });
      if (i === 11) ev("llamada_pendiente", "Te dejé la llamada: no responde los mensajes.", momento(-1, 9), { canal: "telefono" });
      if (eventos.length) await tx.insert(schema.cobranzaEventos).values(eventos);
      creados++;
    }
    await tx.insert(schema.actividadAgentes).values({ agente: "cobranza", texto: `Se cargó la demo: ${creados} recibos de ejemplo.`, esEjemplo: true });
    return { casos: creados };
  });
}

const MOTIVO: Partial<Record<EstadoCaso, string>> = {
  escalado: "Sin respuesta después de 5 intentos.",
  rechazado: "Dice que no va a pagar.",
  respondio: "Hizo una consulta.",
  informo_pago: "Dice que ya pagó.",
  promesa: "Promesa de pago",
  excluido: "Lo marcaste para no contactar.",
};

/** El asegurado de la demo que pidió la baja. */
const BAJA = 26;

function planDelCaso(i: number, dias: number, azar: () => number): Plan {
  if (i % 17 === 9 || i === BAJA) return { estado: "excluido", intentos: 0, dias };
  if (i % 13 === 6) return { estado: "escalado", intentos: 5, dias: Math.min(dias, -12) };
  if (dias > 5) return { estado: "pendiente", intentos: 0, dias };
  const r = azar();
  if (r < 0.22) return { estado: "pendiente", intentos: 0, dias };
  if (r < 0.52) return { estado: "sin_respuesta", intentos: 1 + Math.floor(azar() * 4), dias };
  if (r < 0.64) return { estado: "promesa", intentos: 1 + Math.floor(azar() * 3), dias };
  if (r < 0.75) return { estado: "rechazado", intentos: 2, dias };
  if (r < 0.8) return { estado: "respondio", intentos: 1, dias };
  if (r < 0.85) return { estado: "informo_pago", intentos: 2, dias };
  if (r < 0.95) return { estado: "pagado", intentos: 1 + Math.floor(azar() * 2), dias };
  return { estado: "sin_respuesta", intentos: 2, dias };
}

function normalizarCorreo(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\b(srl|sa)\b/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

const PESOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const formatoPesos = (v: number) => PESOS.format(v);
