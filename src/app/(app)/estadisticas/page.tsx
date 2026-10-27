import { calcularEstadisticas } from "@/lib/estadisticas";
import { obtenerDatosEstadisticas } from "@/lib/datos-estadisticas";
import { diaEnArgentina } from "@/lib/fechas";
import { pesos, porcentaje } from "@/lib/formato";
import "./estadisticas.css";

export const instant = false;

function anosDisponibles(): number[] {
  const actual = Number(diaEnArgentina(new Date()).slice(0, 4));
  return Array.from({ length: 6 }, (_, i) => actual - i);
}

function Barra({ valor, maximo, tono = "acento" }: { valor: number; maximo: number; tono?: string }) {
  const ancho = maximo ? Math.max(valor > 0 ? 2 : 0, Math.round((valor / maximo) * 100)) : 0;
  return (
    <span className="estadisticas-barra" aria-label={`${ancho}%`}>
      <span className={`estadisticas-barra-valor ${tono}`} style={{ width: `${ancho}%` }} />
    </span>
  );
}

export default async function Estadisticas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const anos = anosDisponibles();
  const candidato = typeof sp.anio === "string" ? Number(sp.anio) : anos[0];
  const anio = anos.includes(candidato) ? candidato : anos[0];
  const datos = { ...(await obtenerDatosEstadisticas()), hoy: diaEnArgentina(new Date()) };
  const estadisticas = calcularEstadisticas(datos, anio);
  const maxCompania = Math.max(0, ...estadisticas.porCompania.map((fila) => fila.prima));
  const maxRamo = Math.max(0, ...estadisticas.porRamo.map((fila) => fila.prima));
  const maxMes = Math.max(0, ...estadisticas.meses.map((mes) => mes.primaCobrada));
  const maxCobranza = Math.max(0, ...estadisticas.cobranza.map((fila) => fila.monto));
  const maxSiniestro = Math.max(0, ...estadisticas.siniestros.porEtapa.map((fila) => fila.cantidad));

  return (
    <>
      <header className="encabezado estadisticas-encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Estadísticas</h1>
          <p className="subtitulo">Facturación, cartera y trabajo del año en una mirada.</p>
        </div>
        <form action="/estadisticas" className="estadisticas-filtro-anio">
          <label htmlFor="estadisticas-anio">Año</label>
          <select id="estadisticas-anio" name="anio" defaultValue={String(anio)}>
            {anos.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
          </select>
          <button type="submit" className="boton">Ver</button>
        </form>
      </header>

      <section aria-label="Resumen de cartera y facturación" className="kpis estadisticas-kpis">
        <article className="tarjeta kpi">
          <span className="kpi-etiqueta">Prima anual vigente</span>
          <strong className="kpi-valor">{pesos(estadisticas.primaAnual)}</strong>
          <span className="kpi-detalle">{estadisticas.polizasVigentes} pólizas · monto anual contratado</span>
        </article>
        <article className="tarjeta kpi">
          <span className="kpi-etiqueta">Cuotas cobradas · {anio}</span>
          <strong className="kpi-valor">{pesos(estadisticas.cuotasCobradas)}</strong>
          <span className="kpi-detalle">{estadisticas.cuotasPagadasAnio} cuotas pagadas</span>
        </article>
        <article className="tarjeta kpi">
          <span className="kpi-etiqueta">Comisiones liquidadas · {anio}</span>
          <strong className="kpi-valor">{pesos(estadisticas.comisionLiquidadaAnio)}</strong>
          <span className="kpi-detalle">según liquidaciones cargadas</span>
        </article>
        <article className="tarjeta kpi">
          <span className="kpi-etiqueta">Comisiones depositadas · {anio}</span>
          <strong className="kpi-valor texto-verde">{pesos(estadisticas.comisionDepositadaAnio)}</strong>
          <span className="kpi-detalle">neto de retenciones declaradas</span>
        </article>
      </section>

      <p className="estadisticas-aclaracion">
        La prima anual vigente es el valor de las pólizas en cartera; no equivale a dinero cobrado. Las comisiones estimadas
        solo incluyen ramos con un acuerdo registrado.
      </p>

      <div className="estadisticas-dos-columnas">
        <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-companias">
          <header className="estadisticas-panel-cabecera">
            <div><h2 id="estadisticas-companias">Cartera por aseguradora</h2><p>Prima anual y cantidad de pólizas vigentes</p></div>
          </header>
          {estadisticas.porCompania.length ? (
            <div className="estadisticas-lista-barras">
              {estadisticas.porCompania.map((fila) => (
                <article className="estadisticas-fila-barra" key={fila.nombre}>
                  <div className="estadisticas-fila-titulo"><strong>{fila.nombre}</strong><span>{fila.polizas} {fila.polizas === 1 ? "póliza" : "pólizas"}</span></div>
                  <Barra valor={fila.prima} maximo={maxCompania} />
                  <div className="estadisticas-fila-detalle"><span>{pesos(fila.prima)}</span><span>{porcentaje(fila.participacion / 100)}</span></div>
                </article>
              ))}
            </div>
          ) : <p className="vacio">Todavía no hay pólizas vigentes.</p>}
        </section>

        <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-ramos">
          <header className="estadisticas-panel-cabecera">
            <div><h2 id="estadisticas-ramos">Cartera por ramo</h2><p>Distribución de prima anual</p></div>
          </header>
          {estadisticas.porRamo.length ? (
            <div className="estadisticas-lista-barras">
              {estadisticas.porRamo.map((fila) => (
                <article className="estadisticas-fila-barra" key={fila.nombre}>
                  <div className="estadisticas-fila-titulo"><strong>{fila.nombre}</strong><span>{fila.polizas} {fila.polizas === 1 ? "póliza" : "pólizas"}</span></div>
                  <Barra valor={fila.prima} maximo={maxRamo} tono="verde" />
                  <div className="estadisticas-fila-detalle"><span>{pesos(fila.prima)}</span><span>{porcentaje(fila.participacion / 100)}</span></div>
                </article>
              ))}
            </div>
          ) : <p className="vacio">Todavía no hay ramos vigentes.</p>}
        </section>
      </div>

      <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-mensuales">
        <header className="estadisticas-panel-cabecera">
          <div><h2 id="estadisticas-mensuales">Facturación y comisiones por mes</h2><p>Cuotas pagadas, comisión estimada, liquidada y depositada durante {anio}</p></div>
        </header>
        <div className="tabla-scroll">
          <table className="tabla estadisticas-tabla">
            <thead><tr><th>Mes</th><th>Cuotas cobradas</th><th className="numero">Prima cobrada</th><th className="numero">Comisión estimada</th><th className="numero">Liquidada</th><th className="numero">Depositada</th></tr></thead>
            <tbody>
              {estadisticas.meses.map((mes) => (
                <tr key={mes.id}>
                  <td>{mes.mes}</td>
                  <td>{mes.cuotas}</td>
                  <td className="numero">{pesos(mes.primaCobrada)}</td>
                  <td className="numero">{pesos(mes.comisionEstimada)}</td>
                  <td className="numero">{pesos(mes.comisionLiquidada)}</td>
                  <td className="numero">{pesos(mes.comisionDepositada)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th>Total {anio}</th><th>{estadisticas.cuotasPagadasAnio}</th><th className="numero">{pesos(estadisticas.cuotasCobradas)}</th><th className="numero">{pesos(estadisticas.comisionEstimadaAnio)}</th><th className="numero">{pesos(estadisticas.comisionLiquidadaAnio)}</th><th className="numero">{pesos(estadisticas.comisionDepositadaAnio)}</th></tr></tfoot>
          </table>
        </div>
        {maxMes > 0 && <div className="estadisticas-meses-barras" aria-label="Prima cobrada por mes">{estadisticas.meses.map((mes) => <div key={mes.id} title={`${mes.mes}: ${pesos(mes.primaCobrada)}`}><span style={{ height: `${Math.max(mes.primaCobrada ? 3 : 0, Math.round((mes.primaCobrada / maxMes) * 100))}%` }} /><small>{mes.mes.slice(0, 1)}</small></div>)}</div>}
      </section>

      <div className="estadisticas-dos-columnas">
        <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-cobranza">
          <header className="estadisticas-panel-cabecera"><div><h2 id="estadisticas-cobranza">Estado de cobranza</h2><p>Cuotas registradas en la cartera</p></div></header>
          <div className="estadisticas-lista-barras">
            {estadisticas.cobranza.map((fila, i) => (
              <article className="estadisticas-fila-barra" key={fila.id}>
                <div className="estadisticas-fila-titulo"><strong>{fila.nombre}</strong><span>{fila.polizas} cuotas</span></div>
                <Barra valor={fila.monto} maximo={maxCobranza} tono={i === 1 ? "rojo" : i === 0 ? "verde" : "ambar"} />
                <div className="estadisticas-fila-detalle"><span>{pesos(fila.monto)}</span></div>
              </article>
            ))}
          </div>
        </section>

        <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-vencimientos">
          <header className="estadisticas-panel-cabecera"><div><h2 id="estadisticas-vencimientos">Renovaciones próximas</h2><p>Pólizas que vencen dentro de 90 días</p></div></header>
          {estadisticas.vencimientosProximos.length ? (
            <div className="estadisticas-renovaciones">
              {estadisticas.vencimientosProximos.map((fila) => <div key={fila.id}><strong>{fila.mes}</strong><span>{fila.polizas} pólizas</span><span>{pesos(fila.prima)}</span></div>)}
            </div>
          ) : <p className="vacio">No hay vencimientos en los próximos 90 días.</p>}
        </section>
      </div>

      <div className="estadisticas-dos-columnas">
        <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-siniestros">
          <header className="estadisticas-panel-cabecera"><div><h2 id="estadisticas-siniestros">Siniestros</h2><p>Estado actual de los trámites</p></div></header>
          <div className="estadisticas-siniestros-resumen">
            <div><span>Abiertos</span><strong>{estadisticas.siniestros.abiertos}</strong></div>
            <div><span>Cerrados</span><strong>{estadisticas.siniestros.cerrados}</strong></div>
            <div><span>Indemnización aprobada</span><strong>{pesos(estadisticas.siniestros.indemnizacionAprobada)}</strong></div>
            <div><span>Indemnización pagada</span><strong>{pesos(estadisticas.siniestros.indemnizacionPagada)}</strong></div>
            <div><span>Promedio de cierre</span><strong>{estadisticas.siniestros.promedioCierreDias === null ? "—" : `${estadisticas.siniestros.promedioCierreDias} días`}</strong></div>
          </div>
          {estadisticas.siniestros.abiertos > 0 && (
            <div className="estadisticas-lista-barras">
              {estadisticas.siniestros.porEtapa.map((fila) => (
                <div className="estadisticas-fila-barra" key={fila.id}>
                  <div className="estadisticas-fila-titulo"><strong>{fila.nombre}</strong><span>{fila.cantidad}</span></div>
                  <Barra valor={fila.cantidad} maximo={maxSiniestro} tono="ambar" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="tarjeta estadisticas-panel" aria-labelledby="estadisticas-cotizaciones">
          <header className="estadisticas-panel-cabecera"><div><h2 id="estadisticas-cotizaciones">Cotizaciones · {anio}</h2><p>Solicitudes creadas en el año</p></div></header>
          <div className="estadisticas-cotizaciones-resumen">
            <strong>{estadisticas.cotizaciones.total}</strong><span>solicitudes</span>
            <strong>{porcentaje(estadisticas.cotizaciones.tasaGanada)}</strong><span>tasa de cierre ganada</span>
          </div>
          <div className="estadisticas-lista-barras">
            {estadisticas.cotizaciones.estados.map((fila) => (
              <div className="estadisticas-fila-titulo estadisticas-cotizacion-fila" key={fila.id}><span>{fila.nombre}</span><strong>{fila.cantidad}</strong></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}