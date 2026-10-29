"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { confirmarCobro, cuotasDelCobro, pausarSeguimiento } from "@/agentes/cobros";
import { prepararMensaje } from "@/agentes/cobranza";
import { ALCANCE_CARTERA } from "@/agentes/validador/cartera";
import { marcarCasoRevisado, resolverCaso } from "@/agentes/validador/casos";
import { completarComprobante, confirmarComprobante, descartarComprobante, subirComprobante } from "@/agentes/validador/comprobantes";
import { correrEnriquecimiento, correrValidacion, iniciarCorrida } from "@/agentes/validador/corrida";
import { confirmarMapeoElegido, importarListado } from "@/agentes/validador/fuentes";
import { MANEJADORES_VALIDADOR } from "@/agentes/validador/trabajos";
import { registrarComprobante, rechazarComprobantes, revisarComprobantes } from "@/agentes/validador";
import { requerirSesion } from "@/lib/auth";
import { obtenerComprobantes, obtenerCuotas } from "@/lib/datos-agentes";
import { diaEnArgentina } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { procesarTrabajos } from "@/lib/ia/cola";
import { leerFecha, leerMonto } from "@/lib/importacion";
import { agruparCobros, problemasDe } from "@/lib/validador";
import { CAMPOS_LISTADO, type CampoListado } from "@/lib/validador/listados";
import { MEDIOS_MANUALES, pasoParaCobranza } from "@/lib/validador/pantalla";

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
    origen: conComprobante ? "comprobante" : "manual",
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

/**
 * "Ejecutar validación": revisa los comprobantes y arranca una corrida
 * (validación y enriquecimiento) en segundo plano. Queda en Actividad.
 */
export async function revisarAhora() {
  await requerirSesion();
  await revisarComprobantes();
  const { id, nueva } = await iniciarCorrida("manual", "validacion", ALCANCE_CARTERA);
  if (nueva) {
    after(async () => {
      await correrValidacion(id, "manual", ALCANCE_CARTERA);
      const enriquecimiento = await iniciarCorrida("manual", "enriquecimiento", ALCANCE_CARTERA);
      if (enriquecimiento.nueva) await correrEnriquecimiento(enriquecimiento.id, "manual", ALCANCE_CARTERA);
      revalidatePath("/agentes/validador");
    });
  }
  refrescar();
  redirect(`/agentes/validador?aviso=${nueva ? "validacion-iniciada" : "validacion-en-curso"}`);
}

// ---------- Validador v2: pantalla principal ----------

/** Lo que devuelven los formularios que muestran el error al lado (useActionState). */
export type EstadoForm = { error?: string };

function entero(valor: FormDataEntryValue | null): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Dato inválido");
  return n;
}

/** El mensaje de un error pensado para el productor; los de la base no se muestran. */
function mensajeDe(error: unknown, otro: string): string {
  return error instanceof Error && !/datos|database|sql|relation|column|violat/i.test(error.message) ? error.message : otro;
}

/** La primera cuota del cobro de esta cuota: a ella apuntan comprobantes y seguimientos. */
async function cabezaDelCobro(cuotaId: number): Promise<number> {
  const ids = await cuotasDelCobro(cuotaId);
  if (!ids.length) throw new Error("Cuota inexistente");
  return Math.min(...ids);
}

async function archivoDe(formData: FormData): Promise<{ nombre: string; tipo: string; contenido: Buffer } | null> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  return { nombre: archivo.name.slice(0, 200), tipo: archivo.type || "application/octet-stream", contenido: Buffer.from(await archivo.arrayBuffer()) };
}

/** Lo que quedó en la cola de IA del Validador se empieza a leer ya, sin esperar al enriquecimiento. */
function leerConIA() {
  after(async () => {
    await procesarTrabajos(MANEJADORES_VALIDADOR, { limite: 5, tiempoMs: 60_000 });
    revalidatePath("/agentes/validador");
  });
}

/** Carga manual: la cuota (y las que se cobran con ella) quedan pagadas con la fecha y el medio, y el comprobante si lo hay. */
export async function marcarPagada(formData: FormData) {
  await requerirSesion();
  const cabezaId = await cabezaDelCobro(entero(formData.get("cuotaId")));
  const fecha = leerFecha(String(formData.get("fecha") ?? ""));
  const medio = String(formData.get("medio") ?? "");
  if (!fecha || "error" in fecha || fecha.iso > diaEnArgentina(new Date()) || !MEDIOS_MANUALES.includes(medio)) volver(formData, "pago-incompleto");
  const archivo = await archivoDe(formData);
  if (archivo && archivo.contenido.length > TAMANO_MAXIMO) volver(formData, "documento-grande");
  if (archivo) {
    const [guardado] = await db
      .insert(schema.archivos)
      .values({ nombre: archivo.nombre, tipo: archivo.tipo, tamano: archivo.contenido.length, contenido: archivo.contenido })
      .returning({ id: schema.archivos.id });
    // Queda como comprobante del cobro; confirmarCobro lo da por confirmado.
    await db.insert(schema.comprobantes).values({ cuotaId: cabezaId, canal: "manual", medio, fecha: new Date(`${fecha.iso}T12:00:00-03:00`), archivoId: guardado.id });
  }
  await confirmarCobro(cabezaId, { medio, origen: "manual", fechaPago: fecha.iso });
  refrescar();
  volver(formData, "pago-confirmado");
}

/**
 * "Enviar a Cobranza": deja el borrador del paso que corresponde en Cobranza,
 * para aprobar. Nunca sale solo. Si viene de un caso a revisar, el caso queda
 * resuelto.
 */
export async function enviarACobranza(formData: FormData) {
  await requerirSesion();
  const cuotaId = entero(formData.get("cuotaId"));
  const [cuota] = await db.select().from(schema.cuotas).where(eq(schema.cuotas.id, cuotaId));
  if (!cuota || cuota.estado === "pagada" || cuota.estadoValidacion === "pagada" || cuota.estadoValidacion === "cancelada") volver(formData, "cuota-cerrada");
  const r = await prepararMensaje(await cabezaDelCobro(cuotaId), pasoParaCobranza(cuota.vencimiento, diaEnArgentina(new Date())), {
    motivo: "Lo enviaste desde el Validador de pagos: la cuota sigue impaga.",
    soloBorrador: true,
  });
  if (r && formData.get("pagoId")) await marcarCasoRevisado(entero(formData.get("pagoId")));
  refrescar();
  volver(formData, r ? "enviado-a-cobranza" : "sin-contacto");
}

/** Sube el listado de cobranza de una compañía y lo procesa: al instante si el formato es conocido. */
export async function subirListado(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const compania = String(formData.get("compania") ?? "").trim().slice(0, 80);
  const archivo = await archivoDe(formData);
  if (!compania) return { error: "Elegí la compañía del listado." };
  if (!archivo) return { error: "Elegí el archivo del listado." };
  let r: Awaited<ReturnType<typeof importarListado>>;
  try {
    r = await importarListado(archivo, compania, ALCANCE_CARTERA);
  } catch (error) {
    return { error: mensajeDe(error, "No se pudo guardar el listado. Probá de nuevo.") };
  }
  if (r.estado === "error") return { error: r.mensaje };
  if (r.estado === "extrayendo") leerConIA();
  refrescar();
  const aviso = r.estado === "procesada" ? "listado-procesado" : r.estado === "extrayendo" ? "listado-con-ia" : "listado-para-confirmar";
  redirect(`/agentes/validador?tab=revisar&aviso=${aviso}#listado-${r.fuenteId}`);
}

/** El productor confirma qué dato tiene cada columna: queda la plantilla de la compañía y se lee el listado. */
export async function confirmarColumnas(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const fuenteId = entero(formData.get("fuenteId"));
  const columnas = Number(formData.get("columnas"));
  const campos: (CampoListado | "")[] = Array.from({ length: Number.isInteger(columnas) ? Math.min(Math.max(columnas, 0), 200) : 0 }, (_, i) => {
    const campo = String(formData.get(`campo-${i}`) ?? "");
    return (CAMPOS_LISTADO as readonly string[]).includes(campo) ? (campo as CampoListado) : "";
  });
  const estado = String(formData.get("estadoPorDefecto") ?? "");
  const estadoPorDefecto = estado === "pagada" || estado === "pendiente" ? estado : null;
  const monedaPorDefecto = formData.get("monedaPorDefecto") === "USD" ? "USD" : "ARS";
  let r: Awaited<ReturnType<typeof confirmarMapeoElegido>>;
  try {
    r = await confirmarMapeoElegido(fuenteId, { campos, estadoPorDefecto, monedaPorDefecto }, ALCANCE_CARTERA);
  } catch (error) {
    return { error: mensajeDe(error, "No se pudo guardar la plantilla. Probá de nuevo.") };
  }
  if (r.estado === "error") return { error: r.mensaje };
  refrescar();
  redirect(`/agentes/validador?tab=revisar&aviso=plantilla-guardada#listado-${fuenteId}`);
}

/** Un caso a revisar: aplicar lo que informó la compañía a la cuota elegida, o dejarlo como está. */
export async function resolverCasoRevisar(formData: FormData) {
  await requerirSesion();
  const pagoId = entero(formData.get("pagoId"));
  const decision = formData.get("decision") === "aplicar" ? { tipo: "aplicar" as const, cuotaId: entero(formData.get("cuotaId")) } : { tipo: "descartar" as const };
  let r: "aplicado" | "descartado" | null;
  try {
    r = await resolverCaso(pagoId, decision, ALCANCE_CARTERA);
  } catch {
    r = null;
  }
  refrescar();
  volver(formData, r === "aplicado" ? "caso-aplicado" : r === "descartado" ? "caso-descartado" : "caso-no-aplicado");
}

/** Un comprobante subido suelto: la IA lo lee (si está activa) y el matching propone el cobro. */
export async function subirComprobanteSuelto(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const archivo = await archivoDe(formData);
  if (!archivo) return { error: "Elegí la foto o el PDF del comprobante." };
  let r: Awaited<ReturnType<typeof subirComprobante>>;
  try {
    r = await subirComprobante(archivo, "manual", ALCANCE_CARTERA);
  } catch (error) {
    return { error: mensajeDe(error, "No se pudo guardar el comprobante. Probá de nuevo.") };
  }
  if (r.conIA) leerConIA();
  refrescar();
  redirect(`/agentes/validador?tab=revisar&aviso=${r.conIA ? "comprobante-con-ia" : "comprobante-para-completar"}#comprobante-${r.id}`);
}

/** Los datos del comprobante, cargados o corregidos a mano: se vuelve a proponer el cobro. */
export async function completarComprobanteSuelto(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirSesion();
  const id = entero(formData.get("id"));
  const texto = (campo: string) => String(formData.get(campo) ?? "").trim().slice(0, 200) || null;
  const montoTexto = texto("monto");
  const monto = montoTexto ? leerMonto(montoTexto) : null;
  const fechaTexto = texto("fecha");
  const fecha = fechaTexto ? leerFecha(fechaTexto) : null;
  if (montoTexto && monto === null) return { error: "El monto no se entiende: escribilo como 72.500,00." };
  if (fecha && "error" in fecha) return { error: "La fecha no se entiende." };
  if (monto === null && !texto("referencia") && !texto("numeroOperacion") && !texto("pagador")) {
    return { error: "Completá al menos el monto, el número de operación o quién pagó." };
  }
  try {
    await completarComprobante(
      id,
      {
        monto,
        moneda: formData.get("moneda") === "USD" ? "USD" : "ARS",
        fecha: fecha?.iso ?? null,
        medio: texto("medio"),
        numeroOperacion: texto("numeroOperacion"),
        referencia: texto("referencia"),
        pagador: texto("pagador"),
        documentoPagador: texto("documentoPagador"),
        destinoTitular: texto("destinoTitular"),
        destinoCuenta: texto("destinoCuenta"),
      },
      ALCANCE_CARTERA,
    );
  } catch (error) {
    return { error: mensajeDe(error, "No se pudieron guardar los datos. Probá de nuevo.") };
  }
  refrescar();
  redirect(`/agentes/validador?tab=revisar&aviso=comprobante-propuesto#comprobante-${id}`);
}

/** El productor elige el cobro del comprobante: recién ahí la cuota queda pagada. */
export async function confirmarComprobanteSuelto(formData: FormData) {
  await requerirSesion();
  let ok = true;
  try {
    await confirmarComprobante(entero(formData.get("id")), await cabezaDelCobro(entero(formData.get("cuotaId"))));
  } catch {
    ok = false;
  }
  refrescar();
  volver(formData, ok ? "pago-confirmado" : "comprobante-ya-revisado");
}

export async function descartarComprobanteSuelto(formData: FormData) {
  await requerirSesion();
  await descartarComprobante(entero(formData.get("id")));
  refrescar();
  volver(formData, "comprobante-descartado");
}
