import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { buscarTelefono } from "./buscar";
import { busquedaApagada, claveEmpresa, type EmpresaABuscar, type TelefonoEncontrado } from "./telefono";

const { leads } = schema;

export type ResumenTelefonos = {
  estado: "ok" | "sin-configurar" | "error";
  empresasBuscadas: number;
  encontrados: number;
  pendientes: number;
  detalle: string;
};

type Grupo = EmpresaABuscar & { ids: number[] };

/** Leads sin teléfono buscado, agrupados por empresa, de mayor a menor score. */
async function empresasPendientes(): Promise<Grupo[]> {
  const filas = await db
    .select({
      id: leads.id,
      empresa: leads.empresa,
      cuit: leads.cuit,
      localidad: leads.localidad,
      rubro: leads.rubro,
    })
    .from(leads)
    .where(and(isNull(leads.telefonoBuscadoEl), eq(leads.esEjemplo, false)))
    .orderBy(desc(leads.scoreBase), desc(leads.detectadoEl));
  const grupos = new Map<string, Grupo>();
  for (const { id, ...empresa } of filas) {
    const clave = claveEmpresa(empresa);
    const grupo = grupos.get(clave);
    if (grupo) grupo.ids.push(id);
    else grupos.set(clave, { ...empresa, ids: [id] });
  }
  return [...grupos.values()];
}

/** Resultados ya buscados, para no pagar dos veces por la misma empresa con un lead nuevo. */
async function resultadosAnteriores(): Promise<Map<string, TelefonoEncontrado | null>> {
  const filas = await db
    .select({
      empresa: leads.empresa,
      cuit: leads.cuit,
      localidad: leads.localidad,
      telefono: leads.telefono,
      telefonoFuente: leads.telefonoFuente,
    })
    .from(leads)
    .where(isNotNull(leads.telefonoBuscadoEl));
  const anteriores = new Map<string, TelefonoEncontrado | null>();
  for (const f of filas) {
    const encontrado =
      f.telefono && f.telefonoFuente ? { telefono: f.telefono, tipo: "general" as const, fuenteUrl: f.telefonoFuente } : null;
    const clave = claveEmpresa(f);
    if (encontrado || !anteriores.has(clave)) anteriores.set(clave, encontrado);
  }
  return anteriores;
}

async function guardar(ids: number[], resultado: TelefonoEncontrado | null) {
  await db
    .update(leads)
    .set({
      telefonoBuscadoEl: new Date(),
      ...(resultado && { telefono: resultado.telefono, telefonoFuente: resultado.fuenteUrl }),
    })
    .where(inArray(leads.id, ids));
}

/**
 * Busca el teléfono de las empresas que todavía no lo tienen. Cada ejecución
 * procesa como mucho `limite` empresas y deja de empezar búsquedas nuevas al
 * pasar `plazoMs`, así entra en el tiempo máximo de una función de Vercel.
 * Sin ANTHROPIC_API_KEY o sin TELEFONOS_IA=1 no hace nada (ver busquedaApagada).
 */
export async function completarTelefonos({
  limite = 30,
  plazoMs = 200_000,
  simultaneas = 4,
}: { limite?: number; plazoMs?: number; simultaneas?: number } = {}): Promise<ResumenTelefonos> {
  const apagada = busquedaApagada(process.env);
  if (apagada) {
    return { estado: "sin-configurar", empresasBuscadas: 0, encontrados: 0, pendientes: 0, detalle: apagada };
  }

  const [pendientes, anteriores] = await Promise.all([empresasPendientes(), resultadosAnteriores()]);

  // Empresas que ya se buscaron por otro lead: se copia el resultado sin buscar.
  const aBuscar: Grupo[] = [];
  for (const grupo of pendientes) {
    const clave = claveEmpresa(grupo);
    if (anteriores.has(clave)) await guardar(grupo.ids, anteriores.get(clave)!);
    else aBuscar.push(grupo);
  }

  const cliente = new Anthropic();
  const inicio = Date.now();
  const cola = aBuscar.slice(0, limite);
  let buscadas = 0;
  let encontrados = 0;
  let falla = null as string | null; // la escriben los trabajadores

  async function trabajar() {
    for (let grupo = cola.shift(); grupo; grupo = cola.shift()) {
      if (falla || Date.now() - inicio > plazoMs) return;
      try {
        const resultado = await buscarTelefono(cliente, grupo);
        await guardar(grupo.ids, resultado);
        buscadas++;
        if (resultado) encontrados++;
      } catch (err) {
        // Clave inválida o pedido mal armado: no tiene sentido seguir gastando.
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError) {
          falla = err.message;
        } else {
          console.error(`Teléfono de ${grupo.empresa}:`, err); // se reintenta en la próxima ejecución
        }
      }
    }
  }
  await Promise.all(Array.from({ length: simultaneas }, trabajar));

  const pendientesRestantes = aBuscar.length - buscadas;
  return {
    estado: falla ? "error" : "ok",
    empresasBuscadas: buscadas,
    encontrados,
    pendientes: pendientesRestantes,
    detalle: falla
      ? `La API de Claude rechazó el pedido: ${falla}`
      : `${encontrados} de ${buscadas} empresas con teléfono publicado. Quedan ${pendientesRestantes} por buscar.`,
  };
}
