import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoAgente } from "@/components/agentes/Agente";
import { Filtros } from "@/components/agentes/Filtros";
import type { Comprobante } from "@/db/schema";
import { ALCANCE_CARTERA, graciaDeLaCartera } from "@/agentes/validador/cartera";
import { tablaParaConfirmar } from "@/agentes/validador/fuentes";
import { iaDisponible, OPERACIONES_IA } from "@/agentes/validador/ia";
import { contactoDe } from "@/lib/asegurados";
import {
  agenteConfigurado,
  conexionesConectadas,
  obtenerActividad,
  obtenerComprobantes,
  obtenerContactos,
  obtenerCuotasRecientes,
  obtenerUltimosEnvios,
} from "@/lib/datos-agentes";
import { obtenerAsegurados } from "@/lib/datos-cartera";
import {
  obtenerCasosARevisar,
  obtenerComprobantesSueltos,
  obtenerCorridas,
  obtenerCorridasEnCurso,
  obtenerCuotasValidador,
  obtenerListadosSubidos,
  obtenerNombresCompanias,
  obtenerPolizasParaRenovaciones,
} from "@/lib/datos-validador";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { pesos, pesosConCentavos } from "@/lib/formato";
import { agruparCobros, avisoConexionesValidador, detalleCobro, esPagoConCodigo, problemasDe, textoVence, type Cobro } from "@/lib/validador";
import { conEstados, cuotasDePestana, leerFiltros, opcionesDeFiltros, tarjetasInicio, type PestanaCuotas } from "@/lib/validador/pantalla";
import { agruparPorSemana, polizasPorVencer, polizasRenovadas } from "@/lib/vencimientos";
import { revisarAhora } from "./actions";
import { ActividadValidador } from "./Actividad";
import { ProgresoCorrida } from "./Formularios";
import { PestanaCanceladas, PestanaPagadas, PestanaPendientes, PestanaRenovaciones, type PolizaRenovacion } from "./Pestanas";
import { PestanaRevisar, type TablaListado } from "./Revisar";
import type { FilaCobro } from "./TablaCobros";
import { parametrosDe, urlValidador } from "./vista";
import "../agentes.css";
import "./validador.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

type Pestana = PestanaCuotas | "revisar" | "renovaciones";

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "pendientes", texto: "Pendientes" },
  { id: "revisar", texto: "Por revisar" },
  { id: "pagadas", texto: "Pagadas" },
  { id: "canceladas", texto: "Canceladas" },
  { id: "renovaciones", texto: "Renovaciones" },
];

const FECHAS: Record<PestanaCuotas, string> = { pendientes: "Vence", pagadas: "Pagó", canceladas: "Cancelada" };

/** Los cobros con un comprobante esperando revisión, como los muestra TablaCobros: primero los que están bien. */
async function filasDeCobros(cobros: Cobro[], comprobantes: Map<number, Comprobante>, hoy: string): Promise<FilaCobro[]> {
  const cabezas = cobros.map((c) => c.cabezaId);
  const [contactos, envios] = await Promise.all([obtenerContactos([...new Set(cobros.map((c) => c.aseguradoId))]), obtenerUltimosEnvios(cabezas)]);
  return cobros
    .map((cobro) => ({ cobro, comprobante: comprobantes.get(cobro.cabezaId)! }))
    .sort((a, b) => Number(problemasDe(a.comprobante.chequeos) > 0) - Number(problemasDe(b.comprobante.chequeos) > 0) || a.cobro.vencimiento.localeCompare(b.cobro.vencimiento))
    .map(({ cobro, comprobante }) => {
      const a = contactos.get(cobro.aseguradoId);
      const contacto = a ? contactoDe(a) : { telefono: null, email: null };
      const d = detalleCobro(cobro, comprobante, {
        hoy,
        tieneContacto: Boolean(contacto.telefono || contacto.email),
        ultimoEnvio: envios.get(cobro.cabezaId) ?? null,
      });
      const conCodigo = esPagoConCodigo(comprobante.medio ?? null);
      return {
        id: cobro.cabezaId,
        aseguradoId: cobro.aseguradoId,
        cliente: cobro.asegurado,
        compania: cobro.compania ?? "—",
        poliza: cobro.poliza,
        cuota: cobro.cuota,
        monto: pesos(cobro.monto),
        vence: textoVence(cobro.vencimiento, hoy),
        comprobante: {
          texto: d.estado.texto,
          clase: d.estado.tono === "verde" ? "pastilla pastilla-verde" : d.estado.tono === "rojo" ? "pastilla pastilla-rojo" : "texto-suave",
        },
        detalle: {
          canal: { whatsapp: "WhatsApp", email: "Email", manual: "Cargado a mano" }[comprobante.canal],
          datos: [
            ["Medio", comprobante.medio ?? "—"],
            ["Fecha", comprobante.fecha ? `${fechaCorta(diaEnArgentina(comprobante.fecha))} ${diaYHora(comprobante.fecha).slice(6)}` : "—"],
            ["Monto", comprobante.monto !== null ? pesosConCentavos(comprobante.monto) : "—"],
            [conCodigo ? "Código de pago" : "Destino", comprobante.destino ?? "—"],
            [conCodigo ? "N° de transacción" : "N° de operación", comprobante.numeroOperacion ?? "—"],
          ] as [string, string][],
          archivoId: comprobante.archivoId ?? null,
          titulo: d.titulo,
          chequeos: d.chequeos,
          acciones: d.acciones,
          puedeCargar: false,
        },
      };
    });
}

export default async function Validador({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = parametrosDe(await searchParams);
  // Direcciones de la pantalla anterior.
  if (sp.tab === "pagados") redirect(urlValidador(sp, { tab: "pagadas" }));
  if (sp.tab === "vencidos") redirect(urlValidador(sp, { tab: null, bloque: "vencidos" }));
  const aviso = (await searchParams).aviso;
  const verActividad = sp.ver === "actividad";
  const pestana = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "pendientes";
  const filtros = leerFiltros(sp);
  const hoy = diaEnArgentina(new Date());

  const [base, graciaDe, activo, conectadas, enCurso, recientes, casos, sueltos, listados, iaComprobantes, iaPdf] = await Promise.all([
    obtenerCuotasValidador(hoy),
    graciaDeLaCartera(ALCANCE_CARTERA),
    agenteConfigurado("validador"),
    conexionesConectadas(),
    obtenerCorridasEnCurso(),
    obtenerCuotasRecientes(hoy),
    obtenerCasosARevisar(),
    obtenerComprobantesSueltos(),
    obtenerListadosSubidos(),
    iaDisponible(OPERACIONES_IA.extraerComprobante, ALCANCE_CARTERA),
    iaDisponible(OPERACIONES_IA.extraerListado, ALCANCE_CARTERA),
  ]);
  const cuotas = conEstados(base, hoy, graciaDe);
  const tarjetas = tarjetasInicio(cuotas, hoy);

  // Los cobros con un comprobante por revisar (la revisión de siempre).
  const cobros = agruparCobros(recientes).filter((c) => !c.pagada);
  const comprobantes = await obtenerComprobantes(cobros.map((c) => c.cabezaId));
  const cobrosConComprobante = cobros.filter((c) => comprobantes.get(c.cabezaId)?.estado === "por_revisar");
  const conComprobante = new Set(cobrosConComprobante.flatMap((c) => c.cuotas.map((q) => q.id)));
  const porRevisar = cobrosConComprobante.length + casos.casos.length + sueltos.comprobantes.length + listados.filter((l) => l.estado === "mapeo_por_confirmar").length;

  const cuentas: Partial<Record<Pestana, number>> = {
    pendientes: tarjetas.monitoreadas,
    revisar: porRevisar,
    canceladas: cuotas.filter((c) => c.estado === "cancelada").length,
  };
  const volver = urlValidador(sp);
  const conexiones = avisoConexionesValidador({
    whatsapp: conectadas.has("whatsapp"),
    mercadopago: conectadas.has("mercadopago"),
    banco: conectadas.has("banco"),
  });
  const deCuotas = pestana === "pendientes" || pestana === "pagadas" || pestana === "canceladas";
  const opciones = opcionesDeFiltros(base);

  async function contenido() {
    if (verActividad) {
      const [corridas, actividad] = await Promise.all([obtenerCorridas(), obtenerActividad("validador")]);
      return <ActividadValidador corridas={corridas} actividad={actividad} />;
    }
    if (pestana === "revisar") {
      const porConfirmar = listados.filter((l) => l.estado === "mapeo_por_confirmar");
      const [filas, companias, tablas] = await Promise.all([
        filasDeCobros(cobrosConComprobante, comprobantes, hoy),
        obtenerNombresCompanias(),
        Promise.all(porConfirmar.map(async (l) => [l.id, await tablaParaConfirmar(l.id)] as const)),
      ]);
      return (
        <PestanaRevisar
          cobros={filas}
          casos={casos}
          sueltos={sueltos}
          listados={listados}
          tablas={new Map(tablas.filter((t): t is readonly [number, TablaListado] => t[1] !== null))}
          companias={companias}
          ia={{ comprobantes: iaComprobantes, pdf: iaPdf }}
          volver={volver}
        />
      );
    }
    if (pestana === "renovaciones") {
      const dias = [30, 90].find((d) => String(d) === sp.dias) ?? 60;
      const [asegurados, polizas] = await Promise.all([obtenerAsegurados(), obtenerPolizasParaRenovaciones()]);
      const porRenovar: PolizaRenovacion[] = agruparPorSemana(polizasPorVencer(asegurados, hoy), hoy, dias)
        .flatMap((s) => s.items)
        .map(({ poliza: p, asegurado: a, vence }) => ({ ...p, asegurado: a.nombre, fecha: vence }));
      const renovadas: PolizaRenovacion[] = polizasRenovadas(polizas, hoy, dias)
        .sort((a, b) => (b.vigenciaDesde ?? "").localeCompare(a.vigenciaDesde ?? ""))
        .map((p) => ({ ...p, fecha: p.vigenciaDesde! }));
      return <PestanaRenovaciones sp={sp} dias={dias} porRenovar={porRenovar} renovadas={renovadas} />;
    }
    const lista = cuotasDePestana(cuotas, pestana, filtros);
    if (pestana === "canceladas") return <PestanaCanceladas cuotas={lista} sp={sp} hoy={hoy} />;
    const abiertos = [...new Set(lista.map((c) => c.aseguradoId))];
    const contactos = pestana === "pendientes" ? await obtenerContactos(abiertos) : new Map();
    const contactables = new Set(
      [...contactos.values()].filter((a) => contactoDe(a).telefono || contactoDe(a).email).map((a) => a.id as number),
    );
    const ctx = { sp, hoy, volver, contactables, conComprobante };
    return pestana === "pagadas" ? <PestanaPagadas cuotas={lista} {...ctx} /> : <PestanaPendientes cuotas={lista} {...ctx} />;
  }

  return (
    <>
      <EncabezadoAgente
        agente="validador"
        titulo="Agente validador de pagos"
        activo={activo}
        descripcion="Cruza lo que informan las compañías y los comprobantes de tus asegurados con las cuotas de la cartera, respetando la gracia de cada compañía y ramo. Lo que no cierra te lo deja para revisar: nada se marca pagado sin una fuente o sin tu confirmación."
      >
        <Link href="/configuracion" className="boton">
          Configuración
        </Link>
        <Link href={verActividad ? urlValidador(sp, { ver: null }) : urlValidador(sp, { ver: "actividad" })} className="boton">
          {verActividad ? "Ver cuotas" : "Actividad"}
        </Link>
        <Link href="/agentes/validador?tab=revisar#importar" className="boton">
          Importar listado
        </Link>
        <form action={revisarAhora}>
          <button type="submit" className="boton boton-primario" disabled={enCurso.length > 0}>
            {enCurso.length > 0 ? "Validando…" : "Ejecutar validación"}
          </button>
        </form>
      </EncabezadoAgente>

      <Aviso codigo={aviso} />
      {enCurso.length > 0 && <ProgresoCorrida inicial={enCurso.map((c) => ({ id: c.id, etapa: c.etapa, progreso: c.progreso }))} />}

      {conexiones && (
        <section className="aviso-agente">
          <span className="aviso-agente-icono" aria-hidden="true">
            !
          </span>
          <p>{conexiones}</p>
          <Link href="/configuracion">Ir a Conexiones</Link>
        </section>
      )}

      <section aria-label="Resumen" className="kpis-agente">
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Cuotas monitoreadas</span>
          <span className="kpi-agente-valor">{tarjetas.monitoreadas}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Pagos confirmados hoy</span>
          <span className="kpi-agente-valor texto-verde">{tarjetas.confirmadasHoy}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Cuotas pendientes</span>
          <span className="kpi-agente-valor">{tarjetas.pendientes}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Cuotas vencidas</span>
          <span className="kpi-agente-valor texto-rojo">{tarjetas.vencidas}</span>
        </div>
      </section>

      {!verActividad && (
        <nav aria-label="Cuotas" className="pestanas">
          {PESTANAS.map((p) => (
            <Link
              key={p.id}
              href={`/agentes/validador?tab=${p.id}`}
              scroll={false}
              aria-current={p.id === pestana ? "page" : undefined}
              className="pestana"
            >
              {p.texto}
              {cuentas[p.id] !== undefined && (
                <span className={p.id === "revisar" && porRevisar > 0 ? "contador-rojo" : "contador-gris"}>{cuentas[p.id]}</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      {!verActividad && deCuotas && (
        <div className="lista-cabecera validador-filtros">
          <Filtros
            valores={{ q: filtros.q, cia: filtros.compania, ramo: filtros.ramo, medio: filtros.medio, desde: filtros.desde, hasta: filtros.hasta }}
            campos={[
              { nombre: "q", tipo: "buscar", etiqueta: "Buscar póliza o asegurado", placeholder: "Buscar póliza o asegurado" },
              {
                nombre: "cia",
                tipo: "elegir",
                etiqueta: "Compañía",
                opciones: [{ valor: "", texto: "Todas las compañías" }, ...opciones.companias.map((c) => ({ valor: c, texto: c }))],
              },
              { nombre: "ramo", tipo: "elegir", etiqueta: "Ramo", opciones: [{ valor: "", texto: "Todos los ramos" }, ...opciones.ramos.map((r) => ({ valor: r, texto: r }))] },
              {
                nombre: "medio",
                tipo: "elegir",
                etiqueta: "Medio de pago",
                opciones: [{ valor: "", texto: "Todos los medios" }, ...opciones.medios.map((m) => ({ valor: m, texto: m }))],
              },
              { nombre: "desde", tipo: "fecha", etiqueta: `${FECHAS[pestana as PestanaCuotas]} desde` },
              { nombre: "hasta", tipo: "fecha", etiqueta: "hasta" },
            ]}
          />
          <a href={`/agentes/validador/exportar${urlValidador({ ...sp, tab: pestana }).replace("/agentes/validador", "")}`} className="segmento" download>
            Exportar
          </a>
        </div>
      )}

      {await contenido()}
    </>
  );
}
