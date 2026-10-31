"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guardarConfigCobranza, leerConfigCobranza } from "@/agentes/cobranza/casos";
import { enviarPorCanal, estadoCanales } from "@/agentes/cobranza/canales";
import { borrarDemoCobranza, cargarDemoCobranza } from "@/db/demo-cobranza";
import { requerirSesion } from "@/lib/auth";
import { aplicarCambios, NOMBRE_CANAL } from "@/lib/cobranza/configuracion";
import { idParaTramo } from "@/lib/cobranza/tramos";
import { CANALES_COBRANZA, type CanalCobranza, type ConfiguracionCobranza, type FiltroPruebaCobranza } from "@/lib/cobranza/tipos";
import { obtenerCuenta } from "@/lib/datos";
import { diaEnArgentina } from "@/lib/fechas";

const RUTA = "/agentes/cobranza/configuracion";

function ir(query: Record<string, string>): never {
  revalidatePath("/", "layout");
  redirect(`${RUTA}?${new URLSearchParams(query)}`);
}

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? "").trim();
const marcado = (f: FormData, campo: string) => f.get(campo) === "on";
function numero(f: FormData, campo: string): number | null {
  const v = texto(f, campo).replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Valida y guarda; si algo no cierra, vuelve a la sección con el primer error. */
async function guardar(cambios: unknown, volver: Record<string, string>, aviso = "config-guardada") {
  const actual = await leerConfigCobranza();
  const r = aplicarCambios(actual, cambios);
  if (!r.ok) ir({ ...volver, aviso: "config-invalida", detalle: r.errores[0] });
  await guardarConfigCobranza(r.config);
  ir({ ...volver, aviso });
}

const SECCIONES = ["estrategia", "filtros", "horario", "informacion", "notificaciones", "pruebas"] as const;

export async function guardarSeccion(formData: FormData) {
  await requerirSesion();
  const seccion = SECCIONES.find((s) => s === formData.get("seccion"));
  if (!seccion) throw new Error("Sección desconocida");
  const f = formData;
  let cambios: Record<string, unknown>;
  switch (seccion) {
    case "estrategia":
      cambios = {
        reglasGenerales: texto(f, "reglasGenerales"),
        maxIntentos: numero(f, "maxIntentos"),
        diasEntreIntentos: numero(f, "diasEntreIntentos"),
        diasGraciaPromesa: numero(f, "diasGraciaPromesa"),
        diasPrimerContacto: numero(f, "diasPrimerContacto"),
      };
      break;
    case "filtros":
      cambios = {
        filtros: {
          companias: f.getAll("compania").map(String),
          ramos: f.getAll("ramo").map(String),
          montoMinimo: numero(f, "montoMinimo"),
          excluirMarcados: marcado(f, "excluirMarcados"),
        },
      };
      break;
    case "horario":
      cambios = {
        horaEjecucion: texto(f, "horaEjecucion"),
        zonaHoraria: texto(f, "zonaHoraria"),
        diasPermitidos: f.getAll("dia").map(Number).sort(),
        ventanaDesde: texto(f, "ventanaDesde"),
        ventanaHasta: texto(f, "ventanaHasta"),
      };
      break;
    case "informacion":
      cambios = { firmanteNombre: texto(f, "firmanteNombre"), firmanteEmail: texto(f, "firmanteEmail"), firmanteTelefono: texto(f, "firmanteTelefono"), idioma: texto(f, "idioma") };
      break;
    case "notificaciones":
      cambios = {
        notificaciones: {
          alEscalar: marcado(f, "alEscalar"),
          alPrometer: marcado(f, "alPrometer"),
          resumenDiario: marcado(f, "resumenDiario"),
          canal: texto(f, "canal"),
          destinatarios: texto(f, "destinatarios")
            .split(/[\n,;]+/)
            .map((d) => d.trim())
            .filter(Boolean),
        },
      };
      break;
    case "pruebas": {
      const tipo = texto(f, "filtroTipo");
      const filtro: FiltroPruebaCobranza =
        tipo === "tramo" ? { tipo, tramo: texto(f, "filtroTramo") } : tipo === "compania" ? { tipo, compania: texto(f, "filtroCompania") } : { tipo: "cualquiera" };
      cambios = {
        modoPrueba: marcado(f, "modoPrueba"),
        pedirAprobacion: marcado(f, "pedirAprobacion"),
        prueba: { telefono: texto(f, "pruebaTelefono"), email: texto(f, "pruebaEmail"), whatsapp: texto(f, "pruebaWhatsapp"), maxRecibos: numero(f, "maxRecibos"), filtro },
      };
      break;
    }
  }
  await guardar(cambios, { seccion });
}

// ---------- Tramos ----------

export async function guardarTramo(formData: FormData) {
  await requerirSesion();
  const actual = await leerConfigCobranza();
  const id = texto(formData, "id");
  const nombre = texto(formData, "nombre");
  const tramo = {
    id: id === "nuevo" ? idParaTramo(nombre, actual.tramos.map((t) => t.id)) : id,
    nombre,
    minDias: numero(formData, "minDias"),
    maxDias: numero(formData, "maxDias"),
    instrucciones: texto(formData, "instrucciones") || null,
  };
  const tramos = id === "nuevo" ? [...actual.tramos, tramo] : actual.tramos.map((t) => (t.id === id ? tramo : t));
  if (id !== "nuevo" && !actual.tramos.some((t) => t.id === id)) ir({ seccion: "estrategia", aviso: "tramo-inexistente" });
  await guardar({ tramos }, { seccion: "estrategia" }, "tramo-guardado");
}

export async function borrarTramo(formData: FormData) {
  await requerirSesion();
  const actual = await leerConfigCobranza();
  const id = texto(formData, "id");
  await guardar({ tramos: actual.tramos.filter((t) => t.id !== id) }, { seccion: "estrategia" }, "tramo-borrado");
}

export async function moverTramo(formData: FormData) {
  await requerirSesion();
  const actual = await leerConfigCobranza();
  const i = actual.tramos.findIndex((t) => t.id === texto(formData, "id"));
  const j = i + (formData.get("sentido") === "arriba" ? -1 : 1);
  if (i < 0 || j < 0 || j >= actual.tramos.length) ir({ seccion: "estrategia" });
  const tramos = [...actual.tramos];
  [tramos[i], tramos[j]] = [tramos[j], tramos[i]];
  await guardar({ tramos }, { seccion: "estrategia" }, "tramo-guardado");
}

// ---------- Canales ----------

function canalDe(formData: FormData): CanalCobranza {
  const canal = CANALES_COBRANZA.find((c) => c === formData.get("canal"));
  if (!canal) throw new Error("Canal desconocido");
  return canal;
}

export async function guardarCanal(formData: FormData) {
  await requerirSesion();
  const canal = canalDe(formData);
  const actual = await leerConfigCobranza();
  const remitente = texto(formData, "remitente") || null;
  const cambio: Partial<ConfiguracionCobranza["canales"][CanalCobranza]> = {
    habilitado: marcado(formData, "habilitado"),
    instrucciones: texto(formData, "instrucciones"),
    remitente,
    // Si cambia el remitente, hay que volver a verificarlo.
    verificado: remitente === actual.canales[canal].remitente ? actual.canales[canal].verificado : false,
  };
  await guardar({ canales: { [canal]: cambio } }, { tab: "canales", canal }, "canal-guardado");
}

/** "Verificar": el remitente es el de la conexión real de UNIQO. */
export async function verificarCanal(formData: FormData) {
  await requerirSesion();
  const canal = canalDe(formData);
  const estado = (await estadoCanales())[canal];
  if (!estado.conectado) ir({ tab: "canales", canal, aviso: "canal-sin-conexion", detalle: NOMBRE_CANAL[canal] });
  await guardar({ canales: { [canal]: { remitente: estado.remitente, verificado: true } } }, { tab: "canales", canal }, "canal-verificado");
}

/** "Probar": manda un mensaje de prueba al destino que se escribe (real si el canal está conectado). */
export async function probarCanal(formData: FormData) {
  await requerirSesion();
  const canal = canalDe(formData);
  const [config, cuenta, estado] = await Promise.all([leerConfigCobranza(), obtenerCuenta(), estadoCanales()]);
  const nombre = texto(formData, "nombre") || "Prueba";
  const destino = texto(formData, "destino");
  if (!destino) ir({ tab: "canales", canal, aviso: "canal-sin-destino" });
  const firmante = config.firmanteNombre || cuenta.nombre || "tu productor de seguros";
  const r = await enviarPorCanal(
    canal,
    {
      para: destino,
      asunto: "Prueba del Agente de Cobranza",
      texto: `Hola ${nombre}, esta es una prueba del Agente de Cobranza de ${firmante}. Si te llegó, el canal ${NOMBRE_CANAL[canal]} funciona.`,
      remitente: firmante,
    },
    { modoPrueba: true, estado },
  );
  if (!r.ok) ir({ tab: "canales", canal, aviso: "canal-error", detalle: r.error });
  ir({ tab: "canales", canal, aviso: r.simulado ? "canal-simulado" : "canal-probado", detalle: destino });
}

// ---------- Demo ----------

export async function cargarDemo() {
  await requerirSesion();
  const { casos } = await cargarDemoCobranza(diaEnArgentina(new Date()));
  ir({ seccion: "demo", aviso: "demo-cargada", detalle: String(casos) });
}

export async function borrarDemo() {
  await requerirSesion();
  const n = await borrarDemoCobranza();
  ir({ seccion: "demo", aviso: "demo-borrada", detalle: String(n) });
}

/** Settings de la vista del agente: modo prueba y aprobación, sin pasar por toda la sección Pruebas. */
export async function cambiarModo(formData: FormData) {
  await requerirSesion();
  const actual = await leerConfigCobranza();
  const r = aplicarCambios(actual, { modoPrueba: marcado(formData, "modoPrueba"), pedirAprobacion: marcado(formData, "pedirAprobacion") });
  if (!r.ok) redirect(`/agentes/cobranza/instrucciones?tab=settings&aviso=config-invalida`);
  await guardarConfigCobranza(r.config);
  revalidatePath("/", "layout");
  redirect("/agentes/cobranza/instrucciones?tab=settings&aviso=config-guardada");
}
