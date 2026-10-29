import "server-only";
import { auditar, saludDe, type ContextoConector } from "./auditoria";
import { ejecutarConCanales, type ResultadoCanales } from "./canales";
import { conPermisos, type Autorizacion } from "./permisos";
import { registroConectores, type RegistroConectores } from "./registro";
import type { ArgumentosDe, Capacidad, ConectorCompania, CredencialConector, ResultadoDe, ResultadoPrueba } from "./tipos";

/**
 * Puerta de los agentes a las compañías: busca los conectores, aplica los
 * permisos, saltea los canales caídos, prueba en orden y audita cada intento.
 * Sin conectores devuelve `motivo: "manual"`.
 */
export async function ejecutarEnCompania<C extends Capacidad>(
  compania: string,
  capacidad: C,
  argumentos: ArgumentosDe<C>,
  { contexto, autorizacion, registro = registroConectores }: { contexto: ContextoConector; autorizacion: Autorizacion; registro?: RegistroConectores },
): Promise<ResultadoCanales<ResultadoDe<C>>> {
  const conectores = registro.conectoresPara(compania).map((conector) => conPermisos(conector, autorizacion));
  return ejecutarConCanales(conectores, capacidad, argumentos, {
    registrar: auditar(contexto),
    salud: await saludDe(compania, contexto),
  });
}

/** Para "Probar conexión": el resultado también actualiza la salud del canal. */
export async function probarConexion(conector: ConectorCompania, credencial: CredencialConector | undefined, contexto: ContextoConector): Promise<ResultadoPrueba> {
  const inicio = Date.now();
  const resultado = await conector.probarConexion(credencial);
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
