"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schema } from "@/db";
import { enviarReclamoComision } from "@/agentes/conciliador";
import { requerirSesion } from "@/lib/auth";
import { CAMPOS_LIQUIDACION, conciliarPeriodo, type CampoLiquidacion } from "@/lib/conciliacion";
import { obtenerDatosConciliacion } from "@/lib/datos-agentes";
import { companiaCanonica, leerArchivoTabla, leerMonto, obligatoriosSinColumna } from "@/lib/importacion";
import { diaEnArgentina } from "@/lib/fechas";
import { db } from "@/db";

function mensajeDe(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor.trim() : "";
}

function periodoValido(periodo: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
}

function volver(periodo: string, aviso: string, compania = ""): never {
  revalidatePath("/", "layout");
  redirect(`/agentes/conciliador?periodo=${encodeURIComponent(periodo)}${compania ? `&cia=${encodeURIComponent(compania)}` : ""}&aviso=${aviso}`);
}

export async function enviarReclamo(formData: FormData) {
  await requerirSesion();
  const periodo = mensajeDe(formData, "periodo");
  const compania = mensajeDe(formData, "compania");
  const asunto = mensajeDe(formData, "asunto").slice(0, 250);
  const texto = mensajeDe(formData, "texto").slice(0, 8000);
  if (!periodoValido(periodo) || !compania || !asunto || !texto) throw new Error("El reclamo está incompleto.");
  const datos = await obtenerDatosConciliacion(periodo);
  const fila = conciliarPeriodo(periodo, datos.cuotas, datos.acuerdos, datos.liquidaciones).find((f) => f.compania === compania);
  if (!fila || fila.estado === "cierra") throw new Error("No hay una diferencia pendiente para reclamar.");
  const resultado = await enviarReclamoComision({ fila, asunto, texto });
  volver(periodo, resultado.ok ? "reclamo-enviado" : "envio-error", compania);
}

export async function subirLiquidacion(formData: FormData) {
  await requerirSesion();
  const archivo = formData.get("archivo");
  const periodoActual = mensajeDe(formData, "periodo");
  if (!(archivo instanceof File) || !archivo.size) volver(periodoActual, "archivo-vacio");
  if (archivo.size > 4 * 1024 * 1024) volver(periodoActual, "archivo-grande");

  let tabla;
  try {
    tabla = await leerArchivoTabla(archivo);
  } catch {
    volver(periodoActual, "archivo-invalido");
  }
  let mapeo: (CampoLiquidacion | "")[];
  try {
    const campos = JSON.parse(mensajeDe(formData, "mapeo")) as unknown;
    const permitidos = new Set(CAMPOS_LIQUIDACION.map((campo) => campo.id));
    if (!Array.isArray(campos) || campos.length !== tabla.encabezados.length) throw new Error("mapa inválido");
    mapeo = campos.map((campo) => (typeof campo === "string" && permitidos.has(campo as CampoLiquidacion) ? campo as CampoLiquidacion : ""));
  } catch {
    volver(periodoActual, "columnas-incompletas");
  }
  if (obligatoriosSinColumna(mapeo, CAMPOS_LIQUIDACION).length) volver(periodoActual, "columnas-incompletas");
  const indice = Object.fromEntries(mapeo.map((campo, posicion) => [campo, posicion])) as Record<string, number | undefined>;
  const registros: { compania: string; periodo: string; poliza: string; cuota: number | null; comision: number; porcentaje: number | null }[] = [];
  let depositado: number | null = null;
  let iibb = 0;
  let ganancias = 0;
  for (const [posicion, fila] of tabla.filas.entries()) {
    if (fila.every((celda) => !celda.trim())) continue;
    const leer = (campo: string) => fila[indice[campo] ?? -1]?.trim() ?? "";
    const compania = companiaCanonica(leer("compania"));
    const periodo = leer("periodo");
    const poliza = leer("poliza");
    const comision = leerMonto(leer("comision"));
    const cuotaTexto = leer("cuota");
    const porcentaje = leerMonto(leer("porcentaje"));
    if (!compania || !periodoValido(periodo) || !poliza || comision === null || comision < 0) {
      volver(periodoActual, `fila-invalida-${posicion + 2}`);
    }
    if (cuotaTexto && !/^\d+$/.test(cuotaTexto)) volver(periodoActual, `fila-invalida-${posicion + 2}`);
    registros.push({ compania, periodo, poliza, cuota: cuotaTexto ? Number(cuotaTexto) : null, comision, porcentaje });
    const valorDepositado = leerMonto(leer("depositado"));
    const valorIibb = leerMonto(leer("iibb"));
    const valorGanancias = leerMonto(leer("ganancias"));
    if (valorDepositado !== null) depositado = valorDepositado;
    if (valorIibb !== null) iibb = valorIibb;
    if (valorGanancias !== null) ganancias = valorGanancias;
  }
  if (!registros.length) volver(periodoActual, "sin-filas");
  const compania = registros[0].compania;
  const periodo = registros[0].periodo;
  if (registros.some((r) => r.compania !== compania || r.periodo !== periodo)) volver(periodoActual, "mezcla-periodos");
  const [existente] = await db
    .select({ id: schema.liquidacionesComision.id })
    .from(schema.liquidacionesComision)
    .where(and(eq(schema.liquidacionesComision.compania, compania), eq(schema.liquidacionesComision.periodo, periodo)));
  if (existente) volver(periodo, "liquidacion-existente", compania);

  await db.transaction(async (tx) => {
    const montoLiquidado = Math.round(registros.reduce((suma, registro) => suma + registro.comision, 0) * 100) / 100;
    const retenciones = iibb || ganancias ? { iibb, ganancias } : null;
    const [nueva] = await tx.insert(schema.liquidacionesComision).values({
      compania,
      periodo,
      recibidaEl: diaEnArgentina(new Date()),
      origen: "archivo",
      montoLiquidado,
      depositado,
      retenciones,
    }).returning({ id: schema.liquidacionesComision.id });
    const polizas = await tx.select({ id: schema.polizas.id, numero: schema.polizas.numero }).from(schema.polizas).where(eq(schema.polizas.compania, compania));
    const polizaIds = new Map(polizas.map((poliza) => [poliza.numero, poliza.id]));
    await tx.insert(schema.liquidacionItems).values(registros.map((registro) => ({
      liquidacionId: nueva.id,
      polizaNumero: registro.poliza,
      polizaId: polizaIds.get(registro.poliza) ?? null,
      cuotaNumero: registro.cuota,
      porcentaje: registro.porcentaje,
      comision: registro.comision,
    })));
  });
  volver(periodo, "liquidacion-cargada", compania);
}