import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { cifrar, claveCredenciales, descifrar } from "@/lib/cifrado";
import { companiaCanonica } from "@/lib/importacion";
import type { CredencialConector } from "./tipos";

// Credenciales de los portales de las compañías (credenciales_portal),
// compartidas por los agentes. El secreto se cifra al guardarlo y solo se
// descifra para pasárselo a un conector: nunca se devuelve a la UI ni se
// escribe en logs.

export type EstadoCredencial = "activa" | "vencida" | "desactivada";
export type AlcanceCredencial = { orgId: string | null; producerId: string | null };

/** Lo que se puede mostrar de una credencial: todo menos el secreto. */
export type CredencialVisible = {
  id: number;
  compania: string;
  etiqueta: string;
  usuario: string;
  estado: EstadoCredencial;
  ultimoUsoEl: Date | null;
  creadoEl: Date;
};

const c = schema.credencialesPortal;
const igualONulo = (columna: AnyPgColumn, valor: string | null) => (valor === null ? isNull(columna) : eq(columna, valor));
const delAlcance = (alcance: AlcanceCredencial) => and(igualONulo(c.orgId, alcance.orgId), igualONulo(c.producerId, alcance.producerId));

function cifrarSecreto(secreto: string): string {
  const { clave, nombre } = claveCredenciales();
  return cifrar(secreto, clave, nombre);
}

/** Crea una credencial, o la actualiza si viene `id`. Sin `secreto` al editar, se conserva el anterior. */
export async function guardarCredencial(
  datos: { id?: number; compania: string; etiqueta: string; usuario: string; secreto?: string; estado?: EstadoCredencial },
  alcance: AlcanceCredencial,
): Promise<number> {
  const ahora = new Date();
  if (datos.id) {
    const [fila] = await db.update(c).set({
      etiqueta: datos.etiqueta,
      usuario: datos.usuario,
      ...(datos.secreto ? { secretoCifrado: cifrarSecreto(datos.secreto) } : {}),
      ...(datos.estado ? { estado: datos.estado } : {}),
      actualizadoEl: ahora,
    }).where(and(eq(c.id, datos.id), delAlcance(alcance))).returning({ id: c.id });
    if (!fila) throw new Error("Credencial inexistente");
    return fila.id;
  }
  if (!datos.secreto) throw new Error("Falta la contraseña del portal.");
  const [fila] = await db.insert(c).values({
    compania: datos.compania,
    etiqueta: datos.etiqueta,
    usuario: datos.usuario,
    secretoCifrado: cifrarSecreto(datos.secreto),
    estado: datos.estado ?? "activa",
    orgId: alcance.orgId,
    producerId: alcance.producerId,
  }).returning({ id: c.id });
  return fila.id;
}

export async function listarCredenciales(alcance: AlcanceCredencial, compania?: string): Promise<CredencialVisible[]> {
  const filas = await db.select({
    id: c.id,
    compania: c.compania,
    etiqueta: c.etiqueta,
    usuario: c.usuario,
    estado: c.estado,
    ultimoUsoEl: c.ultimoUsoEl,
    creadoEl: c.creadoEl,
  }).from(c).where(and(delAlcance(alcance), compania ? eq(c.compania, compania) : undefined)).orderBy(c.compania, c.etiqueta);
  return filas.map((f) => ({ ...f, estado: f.estado as EstadoCredencial }));
}

/**
 * La credencial activa de una compañía, descifrada, para pasársela a un
 * conector. Registra el uso. Sin credencial activa devuelve null. La compañía
 * se compara por su nombre canónico: una clave guardada como "Seguros
 * Rivadavia" sirve para "Rivadavia".
 */
export async function credencialParaConector(compania: string, alcance: AlcanceCredencial): Promise<CredencialConector | null> {
  const buscada = companiaCanonica(compania);
  const activas = await db.select().from(c)
    .where(and(eq(c.estado, "activa"), delAlcance(alcance)))
    .orderBy(desc(c.ultimoUsoEl), desc(c.creadoEl));
  const fila = activas.find((f) => companiaCanonica(f.compania) === buscada);
  if (!fila) return null;
  const { clave, nombre } = claveCredenciales();
  const secreto = descifrar(fila.secretoCifrado, clave, nombre);
  await db.update(c).set({ ultimoUsoEl: new Date() }).where(eq(c.id, fila.id));
  return { usuario: fila.usuario, secreto };
}

/** Por ejemplo, "vencida" cuando el conector informa `credencial_vencida`. */
export async function cambiarEstadoCredencial(id: number, estado: EstadoCredencial, alcance: AlcanceCredencial): Promise<void> {
  await db.update(c).set({ estado, actualizadoEl: new Date() }).where(and(eq(c.id, id), delAlcance(alcance)));
}

export async function borrarCredencial(id: number, alcance: AlcanceCredencial): Promise<void> {
  await db.delete(c).where(and(eq(c.id, id), delAlcance(alcance)));
}
