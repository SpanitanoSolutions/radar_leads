/**
 * Mide el Validador con un set de prueba (criterio 14 de docs/specs/validador-v2.md):
 * la extracción de monto, fecha y póliza tiene que acertar al menos el 95 % y
 * el matching tiene que sugerir la cuota correcta al menos el 90 %.
 *
 *   npm run evaluar:validador -- scripts/evaluacion-validador/demo
 *   npm run evaluar:validador -- <carpeta> --ia
 *
 * La carpeta tiene un set.json (formato abajo, en `SetEvaluacion`) y los
 * archivos que nombra. Sin --ia se leen los listados en Excel o CSV con la
 * plantilla del set (o, si no trae, con la propuesta por sinónimos), y el
 * matching de los comprobantes usa los datos que trae el set: mide el código.
 * Con --ia, los listados sin plantilla y los PDF los lee la IA, y los
 * comprobantes también: mide la IA de punta a punta. Necesita DATABASE_URL,
 * ANTHROPIC_API_KEY y la IA activa en ia_configuracion (queda en ia_uso).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CuentaCompania } from "../src/db/schema";
import type { Moneda } from "../src/lib/conectores/tipos";
import { leerArchivoTabla, type Tabla } from "../src/lib/importacion";
import { cobrosParaComprobante, companiaDeDestino, comprobanteParaMatch, verificarExtraccion, type ComprobanteExtraido } from "../src/lib/validador/comprobantes";
import { leerListado, leerMapeoListado, mapeoDePropuestaIA, proponerMapeoPorSinonimos, type MapeoListado } from "../src/lib/validador/listados";
import { claveNumero, proponerCobros } from "../src/lib/validador/matching";
import { procesarFuente, type CuotaParaProcesar } from "../src/lib/validador/procesar";

type CuotaDelSet = {
  id: number;
  asegurado: string;
  documento: string | null;
  compania: string;
  poliza: string;
  item: string | null;
  endoso: string | null;
  numero: number;
  cantidadCuotas: number;
  cupon: string | null;
  monto: number;
  moneda: Moneda;
  vencimiento: string;
  pagada: boolean;
};

/** Lo que tiene que salir de una fila del listado. `cuotaId` null: no es de la cartera. */
type FilaEsperada = { fila: number; poliza: string; monto: number; vencimiento: string; cuotaId: number | null };

type SetEvaluacion = {
  descripcion?: string;
  /** Las cuotas contra las que se cruza, con un id propio del set. */
  cartera: CuotaDelSet[];
  /** Cuentas de cada compañía, para reconocer el destino de un comprobante. */
  cuentas?: Record<string, CuentaCompania[]>;
  listados: { archivo: string; compania: string; mapeo?: MapeoListado; filas: FilaEsperada[] }[];
  comprobantes: {
    archivo: string;
    /** Lo que se lee del comprobante a mano: sin --ia es la entrada del matching. */
    datos?: ComprobanteExtraido;
    esperado: { monto: number; fecha: string; poliza: string | null; cuotaId: number | null };
  }[];
};

type Conteo = { bien: number; total: number };
const conteo = (): Conteo => ({ bien: 0, total: 0 });
const ALCANCE = { orgId: null, producerId: null };
const META_EXTRACCION = 0.95;
const META_MATCHING = 0.9;

const errores: string[] = [];
const avisos: string[] = [];
const extraccion = { monto: conteo(), fecha: conteo(), poliza: conteo() };
const matching = conteo();

function anotar(c: Conteo, ok: boolean, detalle: string) {
  c.total++;
  if (ok) c.bien++;
  else errores.push(detalle);
}

const mismoMonto = (a: number | null | undefined, b: number) => a !== null && a !== undefined && Math.abs(a - b) < 0.01;

async function tablaDeArchivo(ruta: string, nombre: string): Promise<Tabla> {
  const bytes = await readFile(ruta);
  return leerArchivoTabla({ name: nombre, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
}

type IA = typeof import("../src/agentes/validador/ia");

async function cargarIA(): Promise<IA> {
  const faltan = ["DATABASE_URL", "ANTHROPIC_API_KEY"].filter((v) => !process.env[v]);
  if (faltan.length) throw new Error(`Con --ia hace falta ${faltan.join(" y ")}.`);
  const ia = await import("../src/agentes/validador/ia");
  for (const operacion of [ia.OPERACIONES_IA.extraerListado, ia.OPERACIONES_IA.extraerComprobante, ia.OPERACIONES_IA.mapear]) {
    if (!(await ia.iaDisponible(operacion, ALCANCE))) throw new Error(`La IA no está disponible para ${operacion}: revisá ia_configuracion (activa y con cuota) y la clave.`);
  }
  return ia;
}

async function evaluarListados(set: SetEvaluacion, carpeta: string, ia: IA | null) {
  const cuotas: CuotaParaProcesar[] = set.cartera.map((c) => ({
    id: c.id,
    compania: c.compania,
    poliza: c.poliza,
    item: c.item,
    endoso: c.endoso,
    numero: c.numero,
    cantidadCuotas: c.cantidadCuotas,
    cupon: c.cupon,
    monto: c.monto,
    moneda: c.moneda,
    vencimiento: c.vencimiento,
    pagada: c.pagada,
    cancelada: false,
    origenConfirmacion: null,
  }));
  for (const listado of set.listados) {
    const ruta = join(carpeta, listado.archivo);
    const pdf = /\.pdf$/i.test(listado.archivo);
    let tabla: Pick<Tabla, "encabezados" | "filas" | "filaInicial">;
    let mapeo = listado.mapeo ? leerMapeoListado(listado.mapeo) : null;
    if (listado.mapeo && !mapeo) throw new Error(`El mapeo de ${listado.archivo} no tiene el formato de una plantilla.`);
    if (pdf) {
      if (!ia) {
        avisos.push(`${listado.archivo} es un PDF: se mide solo con --ia.`);
        continue;
      }
      const r = await ia.extraerListadoPdf({ nombre: listado.archivo, tipoMime: "application/pdf", contenido: await readFile(ruta) }, ALCANCE);
      if (!r.ok) {
        for (const f of listado.filas) for (const c of Object.values(extraccion)) anotar(c, false, `${listado.archivo} fila ${f.fila}: la IA no pudo leer el PDF.`);
        continue;
      }
      // Como en el agente: la tabla transcripta empieza en la fila 2, debajo del encabezado.
      tabla = { ...r.datos.tabla, filaInicial: 2 };
      mapeo ??= mapeoDePropuestaIA(r.datos.propuesta, r.datos.tabla.encabezados);
    } else {
      tabla = await tablaDeArchivo(ruta, listado.archivo);
      if (!mapeo && ia) {
        const r = await ia.proponerMapeoConIA({ encabezados: tabla.encabezados, filas: tabla.filas }, ALCANCE);
        if (r.ok) mapeo = mapeoDePropuestaIA(r.datos, tabla.encabezados);
      }
      mapeo ??= proponerMapeoPorSinonimos(tabla.encabezados);
    }

    const lectura = leerListado(tabla, mapeo, listado.compania);
    // En un PDF la numeración la pone la transcripción: se alinea por orden.
    const leidas = pdf ? new Map(lectura.filas.map((f, i) => [listado.filas[i]?.fila, f])) : new Map(lectura.filas.map((f) => [f.fila, f]));
    const resultado = procesarFuente({ pagos: lectura.filas }, cuotas, { toleranciaMonto: 1 });
    const matchDe = new Map(resultado.pagos.map((p) => [p.fila, p]));

    for (const esperada of listado.filas) {
      const donde = `${listado.archivo} fila ${esperada.fila}`;
      const leida = leidas.get(esperada.fila);
      const problema = lectura.problemas.find((p) => p.fila === esperada.fila);
      if (!leida) {
        const motivo = problema ? problema.mensaje : "no se leyó";
        for (const [campo, c] of Object.entries(extraccion)) anotar(c, false, `${donde}: ${campo} sin leer (${motivo})`);
        anotar(matching, false, `${donde}: sin cuota sugerida (${motivo})`);
        continue;
      }
      anotar(extraccion.monto, mismoMonto(leida.pago.monto, esperada.monto), `${donde}: monto ${leida.pago.monto}, esperado ${esperada.monto}`);
      anotar(extraccion.fecha, leida.pago.vencimiento === esperada.vencimiento, `${donde}: vencimiento ${leida.pago.vencimiento}, esperado ${esperada.vencimiento}`);
      anotar(extraccion.poliza, claveNumero(leida.pago.poliza) === claveNumero(esperada.poliza), `${donde}: póliza ${leida.pago.poliza}, esperada ${esperada.poliza}`);
      const match = matchDe.get(pdf ? leida.fila : esperada.fila);
      const sugerida = match?.cuotaId ?? match?.candidatos[0]?.cuotaId ?? null;
      anotar(matching, sugerida === esperada.cuotaId, `${donde}: sugiere la cuota ${sugerida ?? "ninguna"}, esperada ${esperada.cuotaId ?? "ninguna"} (${match?.motivo ?? "sin match"})`);
    }
  }
}

async function evaluarComprobantes(set: SetEvaluacion, carpeta: string, ia: IA | null) {
  // Como en la app: las cuotas impagas del mismo asegurado, compañía, vencimiento y moneda son un cobro.
  const asegurados = [...new Set(set.cartera.map((c) => c.asegurado))];
  const cobros = cobrosParaComprobante(
    set.cartera.filter((c) => !c.pagada).map((c) => ({
      id: c.id,
      aseguradoId: asegurados.indexOf(c.asegurado),
      asegurado: c.asegurado,
      documento: c.documento,
      compania: c.compania,
      poliza: c.poliza,
      cupon: c.cupon,
      monto: c.monto,
      moneda: c.moneda,
      vencimiento: c.vencimiento,
    })),
  );
  const cuentas = new Map(Object.entries(set.cuentas ?? {}));
  for (const comprobante of set.comprobantes) {
    const donde = comprobante.archivo;
    let datos = comprobante.datos ?? null;
    if (ia) {
      const tipoMime = /\.pdf$/i.test(comprobante.archivo) ? "application/pdf" : /\.png$/i.test(comprobante.archivo) ? "image/png" : "image/jpeg";
      const r = await ia.extraerComprobante({ nombre: comprobante.archivo, tipoMime, contenido: await readFile(join(carpeta, comprobante.archivo)) }, ALCANCE);
      datos = r.ok ? verificarExtraccion(r.datos) : null;
      const { esperado } = comprobante;
      anotar(extraccion.monto, mismoMonto(datos?.monto, esperado.monto), `${donde}: monto ${datos?.monto ?? "sin leer"}, esperado ${esperado.monto}`);
      anotar(extraccion.fecha, datos?.fecha === esperado.fecha, `${donde}: fecha ${datos?.fecha ?? "sin leer"}, esperada ${esperado.fecha}`);
      if (esperado.poliza) {
        const leido = claveNumero([datos?.referencia, datos?.numeroOperacion].filter(Boolean).join(" "));
        anotar(extraccion.poliza, leido.includes(claveNumero(esperado.poliza)), `${donde}: la referencia leída no menciona la póliza ${esperado.poliza}`);
      }
    }
    if (!datos) {
      anotar(matching, comprobante.esperado.cuotaId === null, `${donde}: sin datos no se puede proponer el cobro`);
      continue;
    }
    const compania = companiaDeDestino([datos.destinoTitular, datos.destinoCuenta], cuentas);
    const propuesta = proponerCobros(comprobanteParaMatch(datos, compania), cobros, { toleranciaMonto: 1 });
    const [primero] = propuesta.candidatos;
    const esperada = comprobante.esperado.cuotaId;
    const ok = esperada === null ? !primero : Boolean(primero?.cuotaIds.includes(esperada));
    anotar(matching, ok, `${donde}: propone ${primero ? `las cuotas ${primero.cuotaIds.join(", ")} (${primero.puntaje} pts)` : "ningún cobro"}, esperada ${esperada ?? "ninguna"}`);
  }
}

const porcentaje = (c: Conteo) => (c.total ? (100 * c.bien) / c.total : 0);
const linea = (nombre: string, c: Conteo) => `  ${nombre.padEnd(8)} ${String(c.bien).padStart(4)}/${String(c.total).padEnd(4)} ${porcentaje(c).toFixed(1)} %`;

async function main() {
  const carpeta = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const conIA = process.argv.includes("--ia");
  if (!carpeta) {
    process.stderr.write("Uso: npm run evaluar:validador -- <carpeta con set.json> [--ia]\n");
    process.exitCode = 2;
    return;
  }
  const raiz = resolve(process.cwd(), carpeta);
  const set = JSON.parse(await readFile(join(raiz, "set.json"), "utf8")) as SetEvaluacion;
  if (!Array.isArray(set.cartera) || !Array.isArray(set.listados) || !Array.isArray(set.comprobantes)) throw new Error("set.json tiene que traer cartera, listados y comprobantes.");
  const ia = conIA ? await cargarIA() : null;

  await evaluarListados(set, raiz, ia);
  await evaluarComprobantes(set, raiz, ia);

  const totalExtraccion = Object.values(extraccion).reduce((s, c) => ({ bien: s.bien + c.bien, total: s.total + c.total }), conteo());
  const companias = new Set(set.listados.map((l) => l.compania)).size;
  const salida = [
    `Set: ${set.descripcion ?? carpeta} (${set.listados.length} listados de ${companias} compañías, ${set.comprobantes.length} comprobantes)${conIA ? ", con IA" : ", sin IA"}`,
    "",
    `Extracción (meta ${META_EXTRACCION * 100} %)${conIA ? "" : ": listados leídos por el código; los comprobantes, solo con --ia"}`,
    linea("monto", extraccion.monto),
    linea("fecha", extraccion.fecha),
    linea("póliza", extraccion.poliza),
    linea("total", totalExtraccion),
    "",
    `Matching: sugiere la cuota correcta (meta ${META_MATCHING * 100} %)`,
    linea("total", matching),
  ];
  if (errores.length) salida.push("", "Lo que no salió:", ...errores.map((e) => `  - ${e}`));
  const completo = companias >= 3 && set.comprobantes.length >= 20;
  if (!completo) avisos.push("La meta de aceptación pide listados de 3 compañías y 20 comprobantes reales anonimizados.");
  if (!conIA) avisos.push("Sin --ia no se mide la IA: la meta se da por cumplida solo con --ia.");
  if (avisos.length) salida.push("", ...avisos);
  process.stdout.write(salida.join("\n") + "\n");
  const cumple = porcentaje(totalExtraccion) >= META_EXTRACCION * 100 && porcentaje(matching) >= META_MATCHING * 100;
  if (!cumple || !completo || !conIA) process.exitCode = 1;
}

// Con --ia queda abierta la conexión a la base: se sale a mano.
main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "No se pudo ejecutar la evaluación."}\n`);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
