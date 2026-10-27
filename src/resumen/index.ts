import "server-only";
import { connection } from "next/server";
import { obtenerAjustes, obtenerCartera, obtenerCuenta, obtenerLeads, obtenerSectores } from "@/lib/datos";
import { diaEnArgentina } from "@/lib/fechas";
import { leadsVisibles } from "@/lib/filtros";
import { registrarCaptura } from "@/fuentes/guardar";
import { armarResumen, type Resumen } from "./armar";
import { canalesDisponibles, urlDeLaApp } from "./canales";

export const FUENTE_RESUMEN = "resumen-diario";

/** Resumen de hoy con los mismos sectores, zonas y scores que ve la lista. */
export async function resumenDeHoy(): Promise<Resumen> {
  // La hora se toma recién en el pedido, nunca durante el build.
  await connection();
  const ahora = new Date();
  const [sectores, ajustes, leads, cartera, cuenta] = await Promise.all([
    obtenerSectores(),
    obtenerAjustes(),
    obtenerLeads(),
    obtenerCartera(),
    obtenerCuenta(),
  ]);
  return armarResumen(leadsVisibles(leads, sectores, ajustes, ahora), {
    dia: diaEnArgentina(ahora),
    ahora,
    productor: cuenta.nombre ?? undefined,
    cartera,
  });
}

/** Arma el resumen y lo envía por los canales configurados. Sin canales, solo lo arma. */
export async function enviarResumenDeHoy() {
  const resumen = await resumenDeHoy();
  const canales = canalesDisponibles();
  const baseUrl = urlDeLaApp();
  const enviados: string[] = [];
  const errores: string[] = [];
  for (const canal of canales) {
    try {
      await canal.enviar(resumen, baseUrl);
      enviados.push(canal.nombre);
    } catch (err) {
      errores.push(`${canal.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const detalle = canales.length
    ? `Enviado por ${enviados.join(", ") || "ningún canal"}.`
    : "Sin RESEND_API_KEY o RESUMEN_EMAIL_DESTINO: el resumen solo se muestra en /resumen.";
  await registrarCaptura(FUENTE_RESUMEN, {
    version: resumen.dia,
    nuevos: resumen.mejores.length,
    error: errores.length ? errores.join(" | ") : null,
  });
  return { dia: resumen.dia, mejores: resumen.mejores.length, recordatorios: resumen.recordatorios.length, enviados, errores, detalle };
}
