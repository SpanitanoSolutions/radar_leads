import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContextoEnvios } from "@/lib/cotizacion/detalle";
import { correosSinEnviar } from "./correo";
import { consultasProgramadas, enviosCotizando } from "./cotizar";

// Lo que el detalle de una solicitud necesita además de los envíos: qué se
// está cotizando, qué correo aprobado no salió, qué consulta está programada,
// los paquetes y las respuestas. Lo usan la pantalla, la exportación de
// Contactos y el resumen al ejecutivo.

type Resultado = { envioId: number; primaTotal: number; confirmado: boolean; moneda: string };

export async function contextoDeEnvios(
  envios: { id: number; paqueteId: number | null }[],
  resultados: Resultado[],
  paquetes?: { id: number; nombre: string }[],
): Promise<ContextoEnvios> {
  const ids = envios.map((envio) => envio.id);
  const paqueteIds = [...new Set(envios.flatMap((envio) => envio.paqueteId == null ? [] : [envio.paqueteId]))];
  const [cotizando, sinEnviar, consultas, nombres] = await Promise.all([
    enviosCotizando(ids),
    correosSinEnviar(ids),
    consultasProgramadas(ids),
    paquetes ?? (paqueteIds.length
      ? db.select({ id: schema.cotizacionPaquetes.id, nombre: schema.cotizacionPaquetes.nombre }).from(schema.cotizacionPaquetes).where(inArray(schema.cotizacionPaquetes.id, paqueteIds))
      : Promise.resolve([])),
  ]);
  return {
    cotizando,
    sinEnviar,
    consultas,
    nombrePaquete: new Map(nombres.map((paquete) => [paquete.id, paquete.nombre])),
    resultados: new Map(resultados.map((resultado) => [resultado.envioId, resultado])),
  };
}
