import "server-only";
import { companiaCanonica } from "@/lib/importacion";
import { auditar, saludDe, type ContextoConector } from "./auditoria";
import { conTiempoMaximo, ejecutarConCanales, TIEMPO_MAXIMO_MS, type ResultadoCanales } from "./canales";
import { canalesDeCompania } from "./companias";
import { conPermisos, type Autorizacion } from "./permisos";
import { registroConectores, type RegistroConectores } from "./registro";
import { ErrorConector, type ArgumentosDe, type Capacidad, type ConectorCompania, type CredencialConector, type ResultadoDe, type ResultadoPrueba, type TipoConector } from "./tipos";

/**
 * Puerta de los agentes a las compañías: busca los conectores, aplica los
 * permisos, saltea los canales caídos, prueba en orden y audita cada intento.
 * El orden es `canales` o, si no se pasa, el de la compañía en
 * conector_companias; sin fila, API → portal → archivo. Sin conectores
 * devuelve `motivo: "manual"`. La compañía va por su nombre canónico
 * ("Seguros Rivadavia" → "Rivadavia"), así los agentes comparten el orden y la salud.
 */
export async function ejecutarEnCompania<C extends Capacidad>(
  compania: string,
  capacidad: C,
  argumentos: ArgumentosDe<C>,
  { contexto, autorizacion, canales, registro = registroConectores }: {
    contexto: ContextoConector;
    autorizacion: Autorizacion;
    canales?: readonly TipoConector[];
    registro?: RegistroConectores;
  },
): Promise<ResultadoCanales<ResultadoDe<C>>> {
  const nombre = companiaCanonica(compania);
  const conectores = registro.conectoresPara(nombre).map((conector) => conPermisos(conector, autorizacion));
  if (!conectores.length) return { ok: false, motivo: "manual", intentos: [] };
  const [salud, orden] = await Promise.all([saludDe(nombre, contexto), canales ?? canalesDeCompania(nombre, contexto)]);
  return ejecutarConCanales(conectores, capacidad, argumentos, { registrar: auditar(contexto), salud, canales: orden });
}

/**
 * Para "Probar conexión": el resultado también actualiza la salud del canal.
 * Tiene el mismo tope de tiempo que una llamada, y si el conector falla de
 * una forma inesperada cuenta como no disponible.
 */
export async function probarConexion(conector: ConectorCompania, credencial: CredencialConector | undefined, contexto: ContextoConector): Promise<ResultadoPrueba> {
  const inicio = Date.now();
  let resultado: ResultadoPrueba;
  try {
    resultado = await conTiempoMaximo(conector.probarConexion(credencial), TIEMPO_MAXIMO_MS[conector.tipo]);
  } catch (error) {
    resultado = { ok: false, codigo: error instanceof ErrorConector ? error.codigo : "no_disponible" };
  }
  await auditar(contexto)({
    compania: conector.compania,
    canal: conector.tipo,
    operacion: "probarConexion",
    resultado: resultado.ok ? "ok" : "error",
    codigoError: resultado.ok ? null : resultado.codigo,
    duracionMs: Date.now() - inicio,
  });
  return resultado;
}
