"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { confirmarCobro, cuotasDelCobro, pausarSeguimiento } from "@/agentes/cobros";
import { prepararMensaje } from "@/agentes/cobranza";
import { registrarComprobante, rechazarComprobantes, revisarComprobantes } from "@/agentes/validador";
import { requerirSesion } from "@/lib/auth";
import { obtenerComprobantes, obtenerCuotas } from "@/lib/datos-agentes";
import { diaEnArgentina } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { leerFecha, leerMonto } from "@/lib/importacion";
import { agruparCobros, problemasDe } from "@/lib/validador";

const TAMANO_MAXIMO = 5 * 1024 * 1024;

function cabezaDe(formData: FormData): number {
  const id = Number(formData.get("cuotaId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Cuota inválida");
  return id;
}

function volver(formData: FormData, aviso: string): never {
  const destino = String(formData.get("volver") ?? "/agentes/validador");
  const url = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/agentes/validador";
  redirect(`${url}${url.includes("?") ? "&" : "?"}aviso=${aviso}`);
}

function refrescar() {
  revalidatePath("/", "layout");
}

async function cobroDe(cabezaId: number) {
  const [cobro] = agruparCobros(await obtenerCuotas(await cuotasDelCobro(cabezaId)));
  if (!cobro) throw new Error("Cobro inexistente");
  return cobro;
}

/** "Confirmar pago" y "Confirmar igual": marca el cobro como pagado y corta la cobranza. */
export async function confirmarPago(formData: FormData) {
  await requerirSesion();
  const cabezaId = cabezaDe(formData);
  const comprobante = (await obtenerComprobantes([cabezaId])).get(cabezaId);
  const conComprobante = comprobante?.estado === "por_revisar";
  await confirmarCobro(cabezaId, {
    medio: conComprobante ? (comprobante.medio ?? "Comprobante") : "Marcado como pagado por vos",
    conProblemas: conComprobante && problemasDe(comprobante.chequeos) > 0,
  });
  refrescar();
  volver(formData, "pago-confirmado");
}

/** El comprobante tiene problemas: deja preparado el pedido de otro y pausa la cobranza. */
export async function pedirOtroComprobante(formData: FormData) {
  await requerirSesion();
  const cabezaId = cabezaDe(formData);
  const comprobante = (await obtenerComprobantes([cabezaId])).get(cabezaId);
  const problema = comprobante?.chequeos.find((c) => c.resultado === "mal") ?? comprobante?.chequeos.find((c) => c.resultado !== "ok");
  const cobro = await cobroDe(cabezaId);
  const faltante = comprobante?.chequeos.find((c) => c.id === "monto" && c.resultado === "mal");
  const r = faltante
    ? await prepararMensaje(cabezaId, "diferencia", {
        agente: "validador",
        pagado: comprobante?.monto ?? 0,
        motivo: `El Validador de pagos encontró que pagaron ${pesos(comprobante?.monto ?? 0)} y la cuota es ${pesos(cobro.monto)}.`,
      })
    : await prepararMensaje(cabezaId, "comprobante", {
        agente: "validador",
        problema: problema?.texto,
        motivo: `El Validador de pagos encontró un problema: ${problema?.texto ?? "el comprobante no coincide"}`,
      });
  if (!faltante) await rechazarComprobantes(cabezaId);
  await pausarSeguimiento(cabezaId, faltante ? "Pago incompleto" : "Comprobante con problemas", { contacto: "Detectado por el Validador" });
  refrescar();
  volver(formData, r ? "pedido-preparado" : "sin-contacto");
}

/** Sin comprobante: prepara el recordatorio para que lo apruebes en Cobranza. */
export async function enviarRecordatorio(formData: FormData) {
  await requerirSesion();
  const cabezaId = cabezaDe(formData);
  const cobro = await cobroDe(cabezaId);
  const paso = cobro.vencimiento < diaEnArgentina(new Date()) ? 3 : 1;
  const r = await prepararMensaje(cabezaId, paso, { motivo: "Lo pediste desde el Validador de pagos: todavía no llegó el comprobante." });
  refrescar();
  volver(formData, r ? "recordatorio-preparado" : "sin-contacto");
}

export async function enviarRecibo(formData: FormData) {
  await requerirSesion();
  const r = await prepararMensaje(cabezaDe(formData), "recibo", { agente: "validador", motivo: "Confirmaste el pago: el recibo le da tranquilidad." });
  refrescar();
  volver(formData, r ? "recibo-preparado" : "sin-contacto");
}

/** Comprobante que el productor carga a mano (llegó por otro lado o en papel). */
export async function cargarComprobante(formData: FormData) {
  await requerirSesion();
  const cabezaId = cabezaDe(formData);
  const texto = (c: string, max = 120) => String(formData.get(c) ?? "").trim().slice(0, max) || null;
  const fecha = leerFecha(String(formData.get("fecha") ?? ""));
  const monto = leerMonto(String(formData.get("monto") ?? ""));
  if (!fecha || "error" in fecha || monto === null) volver(formData, "comprobante-incompleto");
  let archivoId: number | null = null;
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > TAMANO_MAXIMO) volver(formData, "documento-grande");
    const [guardado] = await db
      .insert(schema.archivos)
      .values({
        nombre: archivo.name.slice(0, 200),
        tipo: archivo.type || "application/octet-stream",
        tamano: archivo.size,
        contenido: Buffer.from(await archivo.arrayBuffer()),
      })
      .returning({ id: schema.archivos.id });
    archivoId = guardado.id;
  }
  await registrarComprobante(cabezaId, {
    canal: "manual",
    medio: texto("medio"),
    fecha: new Date(`${fecha.iso}T12:00:00-03:00`),
    monto,
    destino: texto("destino"),
    numeroOperacion: texto("operacion", 60),
    archivoId,
  });
  refrescar();
  volver(formData, "comprobante-cargado");
}

export async function revisarAhora() {
  await requerirSesion();
  await revisarComprobantes();
  refrescar();
  redirect("/agentes/validador?aviso=revisados");
}
