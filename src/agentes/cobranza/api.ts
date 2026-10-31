import "server-only";
import { desc, eq, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { claveDelEncabezado, generarClave, hashClave, type ErrorApi } from "@/lib/cobranza/api";
import { ESTADO_INFO } from "@/lib/cobranza/estados";
import type { ConfiguracionCobranza } from "@/lib/cobranza/tipos";
import { ALCANCE_COBRANZA } from "./casos";
import { situacionDelCaso, type CasoCobranza } from "./datos";

// La API de Cobranza (/api/v1/agentes/cobranza/...): clave por Bearer, errores
// como { error: { codigo, mensaje } } y los casos serializados igual en todas
// las rutas. El proxy deja pasar /api/v1 sin sesión: cada ruta pide la clave.

export function errorApi(status: ErrorApi["status"], codigo: string, mensaje: string): Response {
  return Response.json({ error: { codigo, mensaje } }, { status });
}

/** La clave del pedido, o la respuesta de error (401 o 403). */
async function autenticar(request: Request, permiso: string): Promise<Response | { claveId: number }> {
  const clave = claveDelEncabezado(request.headers.get("authorization"));
  if (!clave) return errorApi(401, "sin_clave", "Falta la clave: mandá Authorization: Bearer <clave>.");
  const [fila] = await db.select().from(schema.apiClaves).where(eq(schema.apiClaves.hash, hashClave(clave)));
  if (!fila || fila.revocadaEl) return errorApi(401, "clave_invalida", "La clave no existe o fue revocada.");
  if (!fila.permisos.includes(permiso)) return errorApi(403, "sin_permiso", `Esta clave no tiene permiso para ${permiso}.`);
  await db.update(schema.apiClaves).set({ ultimoUsoEl: new Date() }).where(eq(schema.apiClaves.id, fila.id));
  return { claveId: fila.id };
}

/** Envuelve una ruta: autentica y convierte cualquier error inesperado en un 500 con el formato de la API. */
export async function conClave(request: Request, manejar: () => Promise<Response>): Promise<Response> {
  await connection();
  const auth = await autenticar(request, "cobranza");
  if (auth instanceof Response) return auth;
  try {
    return await manejar();
  } catch (e) {
    console.error("Error en la API de Cobranza:", e);
    return errorApi(500, "error_interno", "Error inesperado. Probá de nuevo en un rato.");
  }
}

/** El cuerpo JSON, o un 400 si no es JSON. */
export async function cuerpoJson(request: Request): Promise<unknown | Response> {
  try {
    const texto = await request.text();
    return texto ? JSON.parse(texto) : {};
  } catch {
    return errorApi(400, "json_invalido", "El cuerpo no es JSON válido.");
  }
}

export function idDeRuta(texto: string): number | null {
  const id = Number(texto);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Un caso como lo devuelve la API. */
export function casoParaApi(k: CasoCobranza, config: ConfiguracionCobranza, hoy: string) {
  const s = situacionDelCaso(k, config, hoy);
  return {
    id: k.id,
    estado: k.estado,
    estadoTexto: ESTADO_INFO[k.estado].texto,
    motivo: k.motivo,
    asegurado: { id: k.aseguradoId, nombre: k.asegurado.nombre, tipo: k.asegurado.tipo, documento: k.asegurado.documento },
    contacto: k.contacto,
    compania: k.compania,
    ramo: k.ramo,
    poliza: k.polizaNumero,
    recibo: k.recibo,
    cuota: k.cuota,
    endoso: k.endoso,
    formaPago: k.formaPago,
    vigencia: k.vigencia,
    moneda: k.moneda,
    monto: k.monto,
    cuotasJuntas: k.cuotas,
    vencimiento: k.vencimiento,
    diasParaVencer: s.diasParaVencer,
    tramo: s.tramo ? { id: s.tramo.id, nombre: s.tramo.nombre } : null,
    intentos: k.intentos,
    ultimoContacto: k.ultimoContactoEl?.toISOString() ?? null,
    promesa: k.promesaEl,
    pagadoEl: k.pagadoEl?.toISOString() ?? null,
    noContactar: k.noContactar,
    puedeContactarHoy: s.motivoNoContactar === null,
    motivoNoContactar: s.motivoNoContactar,
    canalesDisponibles: s.canales,
    borradorPendiente: k.borradorPendiente,
    esEjemplo: k.esEjemplo,
  };
}

// ---------- Claves (pantalla de la API) ----------

export async function crearClaveApi(nombre: string): Promise<string> {
  const { clave, prefijo, hash } = generarClave();
  await db.insert(schema.apiClaves).values({ nombre: nombre.trim().slice(0, 80) || "Sin nombre", prefijo, hash, permisos: ["cobranza"], ...ALCANCE_COBRANZA });
  return clave;
}

export async function revocarClaveApi(id: number) {
  await db.update(schema.apiClaves).set({ revocadaEl: new Date() }).where(eq(schema.apiClaves.id, id));
}

export async function listarClavesApi() {
  return db
    .select({ id: schema.apiClaves.id, nombre: schema.apiClaves.nombre, prefijo: schema.apiClaves.prefijo, creadaEl: schema.apiClaves.creadaEl, ultimoUsoEl: schema.apiClaves.ultimoUsoEl })
    .from(schema.apiClaves)
    .where(isNull(schema.apiClaves.revocadaEl))
    .orderBy(desc(schema.apiClaves.creadaEl));
}
