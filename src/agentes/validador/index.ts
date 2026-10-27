import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { agruparCobros, chequearComprobante, normalizarOperacion, type ComprobanteLeido } from "@/lib/validador";
import { obtenerCuentasCompanias, obtenerCuotas } from "@/lib/datos-agentes";
import { cuotasDelCobro } from "../cobros";

/**
 * Lectura de comprobantes de pago.
 *
 * Hoy es determinista: los datos los carga el productor a mano o vienen de la
 * conexión simulada. Acá se enchufa el modelo que lea la imagen o el PDF del
 * comprobante (OCR y extracción de medio, fecha, monto, destino y número de
 * operación) cuando se integre: implementá LectorComprobantes y cambiá
 * `lector`. Los chequeos no cambian: son reglas de src/lib/validador.ts.
 */
export interface LectorComprobantes {
  leer(archivo: { nombre: string; tipo: string; contenido: Buffer }): Promise<Partial<ComprobanteLeido>>;
}

export const lectorSinModelo: LectorComprobantes = {
  async leer() {
    // Sin modelo no se lee la imagen: los datos los completa el productor.
    return {};
  },
};

export const lector: LectorComprobantes = lectorSinModelo;

/** Números de operación ya usados en otros comprobantes (para no aceptar el mismo dos veces). */
async function operacionesUsadas(excepto?: number): Promise<Set<string>> {
  const filas = await db
    .select({ numero: schema.comprobantes.numeroOperacion })
    .from(schema.comprobantes)
    .where(excepto ? and(ne(schema.comprobantes.id, excepto), ne(schema.comprobantes.estado, "rechazado")) : ne(schema.comprobantes.estado, "rechazado"));
  return new Set(filas.map((f) => normalizarOperacion(f.numero ?? "")).filter(Boolean));
}

async function chequear(cabezaId: number, comprobante: ComprobanteLeido, excepto?: number) {
  const ids = await cuotasDelCobro(cabezaId);
  const [cobro] = agruparCobros(await obtenerCuotas(ids));
  const cuentas = (await obtenerCuentasCompanias()).get(cobro.compania ?? "") ?? [];
  return chequearComprobante(comprobante, cobro, { cuentas, operacionesUsadas: await operacionesUsadas(excepto) });
}

/** Registra un comprobante (cargado a mano o recibido) y deja hechos los chequeos. */
export async function registrarComprobante(
  cabezaId: number,
  datos: ComprobanteLeido & { canal: "whatsapp" | "email" | "manual"; archivoId?: number | null },
) {
  const chequeos = await chequear(cabezaId, datos);
  const [fila] = await db
    .insert(schema.comprobantes)
    .values({
      cuotaId: cabezaId,
      canal: datos.canal,
      medio: datos.medio,
      fecha: datos.fecha,
      monto: datos.monto,
      destino: datos.destino,
      numeroOperacion: datos.numeroOperacion,
      archivoId: datos.archivoId ?? null,
      chequeos,
    })
    .returning({ id: schema.comprobantes.id });
  await db.insert(schema.actividadAgentes).values({
    agente: "validador",
    referencia: `cuota:${cabezaId}`,
    texto: `Revisó un comprobante cargado ${datos.canal === "manual" ? "a mano" : `por ${datos.canal}`}: ${
      chequeos.every((c) => c.resultado === "ok") ? "todo coincide" : "hay algo que no cierra"
    }.`,
  });
  return { id: fila.id, chequeos };
}

/**
 * "Revisar comprobantes ahora": vuelve a correr los chequeos de los que
 * esperan revisión (por si cambió algo, como un número de operación repetido)
 * y trae los nuevos de las conexiones (hoy simuladas: no traen nada).
 */
export async function revisarComprobantes(): Promise<number> {
  const pendientes = await db.select().from(schema.comprobantes).where(eq(schema.comprobantes.estado, "por_revisar"));
  for (const c of pendientes) {
    const chequeos = await chequear(c.cuotaId, c, c.id);
    await db.update(schema.comprobantes).set({ chequeos }).where(eq(schema.comprobantes.id, c.id));
  }
  await db.insert(schema.actividadAgentes).values({
    agente: "validador",
    texto: `Revisó ${pendientes.length === 1 ? "1 comprobante pendiente" : `${pendientes.length} comprobantes pendientes`}. No llegaron comprobantes nuevos.`,
  });
  return pendientes.length;
}

/** Marca como rechazados los comprobantes pendientes de un cobro (se pidió otro). */
export async function rechazarComprobantes(cabezaId: number) {
  const ids = await cuotasDelCobro(cabezaId);
  await db
    .update(schema.comprobantes)
    .set({ estado: "rechazado", revisadoEl: new Date() })
    .where(and(inArray(schema.comprobantes.cuotaId, ids), eq(schema.comprobantes.estado, "por_revisar")));
}
