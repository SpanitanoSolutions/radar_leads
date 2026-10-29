import Link from "next/link";
import { Paginas } from "@/components/Paginas";
import { paginar } from "@/lib/asegurados";
import { fechaCorta } from "@/lib/fechas";
import { importe, pesos } from "@/lib/formato";
import { bloqueDe, totalesPorBloque, type BloqueCobranza, type Total } from "@/lib/validador/estados";
import {
  agruparPorAsegurado,
  calendarioDelMes,
  etiquetaDias,
  haceDias,
  leerMes,
  leerOrden,
  mesVecino,
  nombreMes,
  ORDEN_DE,
  ORIGEN_CONFIRMACION,
  ordenarCuotas,
  periodoDePago,
  porPagoReciente,
  porVencimiento,
  textoCuota,
  textoEstado,
  totalesPagadas,
  type ColumnaOrden,
  type CuotaPantalla,
  type PeriodoPagadas,
  type PestanaCuotas,
} from "@/lib/validador/pantalla";
import { ListaAsegurados } from "./ListaAsegurados";
import { filaGrupo, montos, urlValidador, type Parametros } from "./vista";

// Las pestañas de cuotas del Validador (secciones 5.2 a 5.5 de
// docs/specs/validador-v2.md). Todo vive en la URL: vista, bloque, mes,
// orden y página.

const POR_PAGINA_LISTA = 10;
const POR_PAGINA_TABLA = 50;

type Contexto = { sp: Parametros; hoy: string; volver: string; contactables: Set<number>; conComprobante: Set<number> };

const pagina = (sp: Parametros) => Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);

/** Las vistas de una pestaña (Cobranza, Calendario, Tabla…) como segmentos. */
function Vistas({ sp, vistas, actual }: { sp: Parametros; vistas: { id: string; texto: string }[]; actual: string }) {
  return (
    <nav aria-label="Vista" className="segmentos">
      {vistas.map((v) => (
        <Link key={v.id} href={urlValidador(sp, { vista: v.id, pagina: null, orden: null, dir: null })} scroll={false} aria-current={v.id === actual ? "true" : undefined} className="segmento">
          {v.texto}
        </Link>
      ))}
    </nav>
  );
}

/** Una tarjeta de totales: una línea por moneda, pagos y asegurados. Si tiene href, filtra la lista. */
function TarjetaTotal({ titulo, total, href, actual, tono }: { titulo: string; total: Total; href?: string; actual?: boolean; tono?: "rojo" }) {
  const contenido = (
    <>
      <span className="kpi-agente-titulo">{titulo}</span>
      {montos(total).map((m) => (
        <span key={m} className={`kpi-agente-valor kpi-monto${tono === "rojo" && total.pagos ? " texto-rojo" : ""}`}>
          {m}
        </span>
      ))}
      <span className="kpi-agente-detalle">
        {total.pagos === 1 ? "1 pago" : `${total.pagos} pagos`} · {total.asegurados === 1 ? "1 asegurado" : `${total.asegurados} asegurados`}
      </span>
    </>
  );
  return href ? (
    <Link href={href} scroll={false} className="kpi-agente" aria-current={actual ? "true" : undefined}>
      {contenido}
    </Link>
  ) : (
    <div className="kpi-agente">{contenido}</div>
  );
}

/** "Mostrando 1–10 de 89" y las páginas. */
function PieLista({ sp, desde, hasta, total, paginaActual, paginas, unidad }: { sp: Parametros; desde: number; hasta: number; total: number; paginaActual: number; paginas: number; unidad: string }) {
  if (!total) return null;
  return (
    <div className="lista-pie">
      <span className="tabular">
        Mostrando {desde}–{hasta} de {total} {unidad}
      </span>
      <Paginas pagina={paginaActual} paginas={paginas} href={(n) => urlValidador(sp, { pagina: n })} />
    </div>
  );
}

type Columna = { id: string; titulo: string; orden?: ColumnaOrden; numero?: boolean; celda: (c: CuotaPantalla) => React.ReactNode };

/** Todas las columnas planas, ordenables por los encabezados y paginadas. */
function TablaCuotas({ sp, cuotas, columnas, pestana, unidad }: { sp: Parametros; cuotas: CuotaPantalla[]; columnas: Columna[]; pestana: PestanaCuotas; unidad: string }) {
  const orden = leerOrden(sp.orden, sp.dir, ORDEN_DE[pestana]);
  const p = paginar(ordenarCuotas(cuotas, orden.columna, orden.sentido), pagina(sp), POR_PAGINA_TABLA);
  return (
    <>
      <div className="tabla-scroll">
        <table className="tabla tabla-compacta tabla-plana">
          <thead>
            <tr>
              {columnas.map((col) => {
                const activa = col.orden && orden.columna === col.orden;
                const sentido = activa && orden.sentido === "asc" ? "desc" : "asc";
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={col.numero ? "numero" : undefined}
                    aria-sort={activa ? (orden.sentido === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {col.orden ? (
                      <Link href={urlValidador(sp, { orden: col.orden, dir: sentido, pagina: null })} scroll={false} className="orden-columna">
                        {col.titulo}
                        <span aria-hidden="true">{activa ? (orden.sentido === "asc" ? " ↑" : " ↓") : ""}</span>
                      </Link>
                    ) : (
                      col.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {p.filas.map((c) => (
              <tr key={c.id}>
                {columnas.map((col) => (
                  <td key={col.id} className={col.numero ? "numero tabular" : undefined}>
                    {col.celda(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cuotas.length === 0 && <p className="vacio">No hay cuotas con estos filtros.</p>}
      <PieLista sp={sp} desde={p.desde} hasta={p.hasta} total={cuotas.length} paginaActual={p.pagina} paginas={p.paginas} unidad={unidad} />
    </>
  );
}

const Estado = ({ c }: { c: CuotaPantalla }) => {
  const e = textoEstado(c);
  return <span className={`punto-estado punto-${e.tono}`}>{e.texto}</span>;
};

const asegurado = (c: CuotaPantalla) => (
  <Link href={`/asegurados/${c.aseguradoId}`} className="nombre-asegurado">
    {c.asegurado}
  </Link>
);

function columnasPendientes(hoy: string): Columna[] {
  return [
    { id: "asegurado", titulo: "Asegurado", orden: "asegurado", celda: asegurado },
    { id: "compania", titulo: "Compañía", orden: "compania", celda: (c) => c.compania ?? "—" },
    { id: "ramo", titulo: "Ramo", orden: "ramo", celda: (c) => c.ramo },
    { id: "poliza", titulo: "Póliza", orden: "poliza", celda: (c) => c.poliza ?? "—" },
    { id: "cuota", titulo: "Cuota", orden: "cuota", celda: (c) => textoCuota(c) },
    { id: "item", titulo: "Ítem", celda: (c) => c.item ?? "—" },
    { id: "endoso", titulo: "Endoso", celda: (c) => c.endoso ?? "—" },
    { id: "cupon", titulo: "Cupón", celda: (c) => c.cupon ?? "—" },
    { id: "monto", titulo: "Monto", orden: "monto", numero: true, celda: (c) => importe(c.monto, c.moneda) },
    {
      id: "vencimiento",
      titulo: "Vencimiento",
      orden: "vencimiento",
      celda: (c) => {
        const dias = etiquetaDias(c);
        return (
          <>
            <div className="tabular">{fechaCorta(c.vencimiento)}</div>
            <div className={`dias dias-${dias.tono === "rojo" || dias.tono === "gris" ? dias.tono : "ambar"}`}>{dias.texto}</div>
          </>
        );
      },
    },
    { id: "medio", titulo: "Medio de pago", orden: "medio", celda: (c) => c.medio ?? "—" },
    { id: "estado", titulo: "Estado", orden: "estado", celda: (c) => <Estado c={c} /> },
    { id: "revision", titulo: "Última revisión", orden: "revision", celda: (c) => haceDias(c.ultimaRevision, hoy) },
  ];
}

const BLOQUES: { id: BloqueCobranza; titulo: string }[] = [
  { id: "semana", titulo: "Esta semana" },
  { id: "proximos", titulo: "Próximos" },
  { id: "vencidos", titulo: "Vencidos" },
];

/** 5.2 Pendientes: vistas Cobranza (por defecto), Calendario y Tabla. */
export function PestanaPendientes({ cuotas, ...ctx }: Contexto & { cuotas: CuotaPantalla[] }) {
  const { sp, hoy } = ctx;
  const vista = sp.vista === "calendario" || sp.vista === "tabla" ? sp.vista : "cobranza";
  return (
    <>
      <div className="validador-barra-vista">
        <Vistas
          sp={sp}
          actual={vista}
          vistas={[
            { id: "cobranza", texto: "Cobranza" },
            { id: "calendario", texto: "Calendario" },
            { id: "tabla", texto: "Tabla" },
          ]}
        />
      </div>
      {vista === "cobranza" && <VistaCobranza cuotas={cuotas} {...ctx} />}
      {vista === "calendario" && <VistaCalendario cuotas={cuotas} sp={sp} hoy={hoy} />}
      {vista === "tabla" && <TablaCuotas sp={sp} cuotas={cuotas} columnas={columnasPendientes(hoy)} pestana="pendientes" unidad="cuotas" />}
    </>
  );
}

function VistaCobranza({ cuotas, ...ctx }: Contexto & { cuotas: CuotaPantalla[] }) {
  const { sp, hoy, volver } = ctx;
  const totales = totalesPorBloque(cuotas);
  const bloque = BLOQUES.find((b) => b.id === sp.bloque)?.id ?? null;
  const lista = bloque ? cuotas.filter((c) => bloqueDe(c.estado) === bloque) : cuotas;
  const grupos = agruparPorAsegurado(lista, porVencimiento);
  const p = paginar(grupos, pagina(sp), POR_PAGINA_LISTA);
  return (
    <>
      <section aria-label="Totales por plazo" className="kpis-agente">
        {BLOQUES.map((b) => (
          <TarjetaTotal
            key={b.id}
            titulo={b.titulo}
            total={totales[b.id]}
            tono={b.id === "vencidos" ? "rojo" : undefined}
            href={urlValidador(sp, { bloque: bloque === b.id ? null : b.id, pagina: null })}
            actual={bloque === b.id}
          />
        ))}
      </section>
      <section aria-label="Cuotas por asegurado" className="tarjeta">
        <ListaAsegurados grupos={p.filas.map((g) => filaGrupo(g, "pendientes", ctx))} modo="pendientes" volver={volver} hoy={hoy} />
        <PieLista sp={sp} desde={p.desde} hasta={p.hasta} total={grupos.length} paginaActual={p.pagina} paginas={p.paginas} unidad="asegurados" />
      </section>
    </>
  );
}

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function VistaCalendario({ cuotas, sp, hoy }: { cuotas: CuotaPantalla[]; sp: Parametros; hoy: string }) {
  const mes = leerMes(sp.mes, hoy);
  const semanas = calendarioDelMes(cuotas, mes);
  const delMes = semanas.flat().filter((d) => d.delMes);
  const total = delMes.reduce((n, d) => n + d.total.pagos, 0);
  return (
    <section aria-labelledby="titulo-calendario" className="tarjeta tarjeta-padding">
      <div className="lista-cabecera calendario-cabecera">
        <Link href={urlValidador(sp, { mes: mesVecino(mes, -1) })} scroll={false} className="boton boton-chico" aria-label="Mes anterior">
          ←
        </Link>
        <h2 id="titulo-calendario" className="lista-titulo calendario-titulo">
          {nombreMes(mes)}
        </h2>
        <Link href={urlValidador(sp, { mes: mesVecino(mes, 1) })} scroll={false} className="boton boton-chico" aria-label="Mes siguiente">
          →
        </Link>
        <span className="texto-suave">{total === 1 ? "1 cuota impaga" : `${total} cuotas impagas`} en el mes</span>
      </div>
      <div className="tabla-scroll">
        <table className="calendario">
          <thead>
            <tr>
              {DIAS_SEMANA.map((d) => (
                <th key={d} scope="col">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana) => (
              <tr key={semana[0].dia}>
                {semana.map((d) => (
                  <td key={d.dia} className={`${d.delMes ? "" : "fuera-de-mes"} ${d.dia === hoy ? "dia-hoy" : ""}`.trim() || undefined}>
                    <div className="dia-numero" aria-label={fechaCorta(d.dia)}>
                      {Number(d.dia.slice(8))}
                    </div>
                    {d.delMes && d.total.pagos > 0 && (
                      <Link href={urlValidador(sp, { vista: "tabla", desde: d.dia, hasta: d.dia, mes: null, pagina: null })} className="dia-cuotas">
                        <span className="dia-cantidad">{d.total.pagos === 1 ? "1 cuota" : `${d.total.pagos} cuotas`}</span>
                        {d.total.montos.map((m) => (
                          <span key={m.moneda} className="tabular">
                            {importe(m.monto, m.moneda)}
                          </span>
                        ))}
                      </Link>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota-pie">Las cuotas impagas de los últimos cuatro meses y los próximos dos. Tocá un día para ver sus cuotas.</p>
    </section>
  );
}

/** 5.3 Pagadas: vistas Resumen y Tabla, con Este mes y Anteriores. */
export function PestanaPagadas({ cuotas, ...ctx }: Contexto & { cuotas: CuotaPantalla[] }) {
  const { sp, hoy, volver } = ctx;
  const vista = sp.vista === "tabla" ? "tabla" : "resumen";
  const totales = totalesPagadas(cuotas, hoy);
  const periodo: PeriodoPagadas | null = sp.periodo === "mes" || sp.periodo === "anteriores" ? sp.periodo : null;
  const lista = periodo ? cuotas.filter((c) => periodoDePago(c, hoy) === periodo) : cuotas;
  const columnas: Columna[] = [
    { id: "asegurado", titulo: "Asegurado", orden: "asegurado", celda: asegurado },
    { id: "compania", titulo: "Compañía", orden: "compania", celda: (c) => c.compania ?? "—" },
    { id: "poliza", titulo: "Póliza", orden: "poliza", celda: (c) => c.poliza ?? "—" },
    { id: "cuota", titulo: "Cuota", orden: "cuota", celda: (c) => textoCuota(c) },
    { id: "item", titulo: "Ítem", celda: (c) => c.item ?? "—" },
    { id: "monto", titulo: "Monto", orden: "monto", numero: true, celda: (c) => importe(c.monto, c.moneda) },
    { id: "vencimiento", titulo: "Vencimiento", orden: "vencimiento", celda: (c) => fechaCorta(c.vencimiento) },
    { id: "pago", titulo: "Pagó el", orden: "pago", celda: (c) => (c.fechaPago ? fechaCorta(c.fechaPago) : "—") },
    { id: "medio", titulo: "Medio", orden: "medio", celda: (c) => c.medio ?? "—" },
    { id: "origen", titulo: "Origen", celda: (c) => (c.origenConfirmacion ? ORIGEN_CONFIRMACION[c.origenConfirmacion] : "—") },
  ];
  const grupos = agruparPorAsegurado(lista, porPagoReciente);
  const p = paginar(grupos, pagina(sp), POR_PAGINA_LISTA);
  return (
    <>
      <div className="validador-barra-vista">
        <Vistas
          sp={sp}
          actual={vista}
          vistas={[
            { id: "resumen", texto: "Resumen" },
            { id: "tabla", texto: "Tabla" },
          ]}
        />
      </div>
      <section aria-label="Totales pagados" className="kpis-agente">
        <TarjetaTotal titulo="Este mes" total={totales.mes} href={urlValidador(sp, { periodo: periodo === "mes" ? null : "mes", pagina: null })} actual={periodo === "mes"} />
        <TarjetaTotal
          titulo="Anteriores (12 meses)"
          total={totales.anteriores}
          href={urlValidador(sp, { periodo: periodo === "anteriores" ? null : "anteriores", pagina: null })}
          actual={periodo === "anteriores"}
        />
      </section>
      {vista === "resumen" ? (
        <section aria-label="Pagos por asegurado" className="tarjeta">
          <ListaAsegurados grupos={p.filas.map((g) => filaGrupo(g, "pagadas", ctx))} modo="pagadas" volver={volver} hoy={hoy} />
          <PieLista sp={sp} desde={p.desde} hasta={p.hasta} total={grupos.length} paginaActual={p.pagina} paginas={p.paginas} unidad="asegurados" />
        </section>
      ) : (
        <section aria-label="Cuotas pagadas" className="tarjeta">
          <TablaCuotas sp={sp} cuotas={lista} columnas={columnas} pestana="pagadas" unidad="cuotas" />
        </section>
      )}
    </>
  );
}

/** 5.4 Canceladas. */
export function PestanaCanceladas({ cuotas, sp, hoy }: { cuotas: CuotaPantalla[]; sp: Parametros; hoy: string }) {
  const columnas: Columna[] = [
    { id: "asegurado", titulo: "Asegurado", orden: "asegurado", celda: asegurado },
    { id: "compania", titulo: "Compañía", orden: "compania", celda: (c) => c.compania ?? "—" },
    { id: "poliza", titulo: "Póliza", orden: "poliza", celda: (c) => c.poliza ?? "—" },
    { id: "endoso", titulo: "Endoso", celda: (c) => c.endoso ?? "—" },
    { id: "cuota", titulo: "Cuota", orden: "cuota", celda: (c) => textoCuota(c) },
    { id: "item", titulo: "Ítem", celda: (c) => c.item ?? "—" },
    { id: "cupon", titulo: "Cupón", celda: (c) => c.cupon ?? "—" },
    { id: "monto", titulo: "Monto", orden: "monto", numero: true, celda: (c) => importe(c.monto, c.moneda) },
    { id: "cancelacion", titulo: "Cancelada el", orden: "cancelacion", celda: (c) => (c.canceladaEl ? fechaCorta(c.canceladaEl) : "—") },
    { id: "motivo", titulo: "Motivo", celda: (c) => c.motivoCancelacion ?? "—" },
    { id: "estado", titulo: "Estado", celda: (c) => <Estado c={c} /> },
    { id: "revision", titulo: "Última revisión", orden: "revision", celda: (c) => haceDias(c.ultimaRevision, hoy) },
  ];
  return (
    <section aria-label="Cuotas canceladas" className="tarjeta">
      <TablaCuotas sp={sp} cuotas={cuotas} columnas={columnas} pestana="canceladas" unidad="cuotas" />
    </section>
  );
}

export type PolizaRenovacion = {
  id: number;
  aseguradoId: number;
  asegurado: string;
  ramo: string;
  bien: string | null;
  numero: string | null;
  compania: string | null;
  prima: number | null;
  fecha: string;
};

const PLAZOS = [30, 60, 90] as const;

/** 5.5 Renovaciones: Por renovar (los datos de Vencimientos) y Renovadas. */
export function PestanaRenovaciones({ sp, dias, porRenovar, renovadas }: { sp: Parametros; dias: number; porRenovar: PolizaRenovacion[]; renovadas: PolizaRenovacion[] }) {
  const lista = sp.lista === "renovadas" ? "renovadas" : "por_renovar";
  const filas = lista === "renovadas" ? renovadas : porRenovar;
  const prima = (polizas: PolizaRenovacion[]) => pesos(polizas.reduce((t, p) => t + (p.prima ?? 0), 0));
  const tarjeta = (id: typeof lista, titulo: string, polizas: PolizaRenovacion[], detalle: string) => (
    <Link href={urlValidador(sp, { lista: id === "por_renovar" ? null : id })} scroll={false} className="kpi-agente" aria-current={lista === id ? "true" : undefined}>
      <span className="kpi-agente-titulo">{titulo}</span>
      <span className="kpi-agente-valor kpi-monto">{prima(polizas)}</span>
      <span className="kpi-agente-detalle">
        {polizas.length === 1 ? "1 póliza" : `${polizas.length} pólizas`} · {detalle}
      </span>
    </Link>
  );
  return (
    <>
      <div className="validador-barra-vista">
        <nav aria-label="Plazo" className="segmentos">
          {PLAZOS.map((p) => (
            <Link key={p} href={urlValidador(sp, { dias: p === 60 ? null : p })} scroll={false} aria-current={p === dias ? "true" : undefined} className="segmento">
              {p} días
            </Link>
          ))}
        </nav>
        <Link href={`/vencimientos?dias=${dias}`} className="boton boton-mediano">
          Avisar desde Vencimientos
        </Link>
      </div>
      <section aria-label="Renovaciones" className="kpis-agente">
        {tarjeta("por_renovar", "Por renovar", porRenovar, `vencen en los próximos ${dias} días`)}
        {tarjeta("renovadas", "Renovadas", renovadas, `en los últimos ${dias} días`)}
      </section>
      <section aria-label={lista === "renovadas" ? "Pólizas renovadas" : "Pólizas por renovar"} className="tarjeta">
        {filas.length === 0 ? (
          <p className="vacio">{lista === "renovadas" ? `No hay pólizas renovadas en los últimos ${dias} días.` : "No hay pólizas por renovar."}</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta">
              <thead>
                <tr>
                  <th scope="col">{lista === "renovadas" ? "Desde" : "Vence"}</th>
                  <th scope="col">Asegurado</th>
                  <th scope="col">Póliza</th>
                  <th scope="col">Compañía</th>
                  <th scope="col" className="numero">
                    Prima anual
                  </th>
                  <th scope="col">
                    <span className="visualmente-oculto">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id}>
                    <td className="tabular celda-fuerte">{fechaCorta(p.fecha)}</td>
                    <td>
                      <Link href={`/asegurados/${p.aseguradoId}`} className="nombre-asegurado">
                        {p.asegurado}
                      </Link>
                    </td>
                    <td>
                      <div>
                        {p.ramo}
                        {p.bien && ` · ${p.bien}`}
                      </div>
                      {p.numero && <div className="celda-secundaria">Póliza {p.numero}</div>}
                    </td>
                    <td>{p.compania ?? "—"}</td>
                    <td className="numero tabular">{p.prima !== null ? pesos(p.prima) : "—"}</td>
                    <td>
                      <Link href={`/asegurados/${p.aseguradoId}`} className="boton boton-chico">
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
