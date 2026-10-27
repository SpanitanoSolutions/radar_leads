import Link from "next/link";
import { calcularEstadisticas } from "@/lib/estadisticas";
import { obtenerDatosDashboard } from "@/lib/datos-dashboard";
import { obtenerDatosEstadisticas } from "@/lib/datos-estadisticas";
import { diaEnArgentina, diaYHora, fechaCorta, fechaLarga } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import "./dashboard.css";

export const instant = false;

const ORIGENES: Record<string, string> = {
  cotizacion: "Cotización",
  validador: "Validador",
  cobranza: "Cobranza",
  siniestros: "Siniestros",
  conciliador: "Conciliador",
  cartera: "Cartera",
};

function Barra({ valor, maximo, tono = "acento" }: { valor: number; maximo: number; tono?: string }) {
  const ancho = maximo ? Math.max(valor > 0 ? 2 : 0, Math.round((valor / maximo) * 100)) : 0;
  return <span className="dashboard-barra"><span className={`dashboard-barra-valor ${tono}`} style={{ width: `${ancho}%` }} /></span>;
}

export default async function Dashboard() {
  const [cartera, datosEstadisticas] = await Promise.all([obtenerDatosDashboard(), obtenerDatosEstadisticas()]);
  const hoy = diaEnArgentina(new Date());
  const estadisticas = calcularEstadisticas({ ...datosEstadisticas, hoy }, Number(hoy.slice(0, 4)));
  const cuotasVencidas = estadisticas.cobranza.find((fila) => fila.id === "vencida") ?? { polizas: 0, monto: 0 };
  const avisos = [
    { href: "/agentes/validador?tab=revisar", texto: "Comprobantes por revisar", cantidad: cartera.avisos.comprobantes, tono: "rojo" },
    { href: "/agentes/cobranza", texto: "Mensajes para aprobar", cantidad: cartera.avisos.cobranza, tono: "ambar" },
    { href: "/agentes/cotizacion?estado=atencion", texto: "Cotizaciones con atención", cantidad: cartera.avisos.cotizaciones, tono: "ambar" },
    { href: "/agentes/siniestros", texto: "Siniestros abiertos", cantidad: cartera.avisos.siniestros, tono: "azul" },
    { href: "/agentes/validador?tab=vencidos", texto: "Cuotas vencidas", cantidad: cuotasVencidas.polizas, tono: "rojo", detalle: `${pesos(cuotasVencidas.monto)} pendientes de cobro` },
  ];
  const totalAvisos = avisos.reduce((suma, aviso) => suma + aviso.cantidad, 0);
  const maxCompania = Math.max(0, ...estadisticas.porCompania.slice(0, 5).map((fila) => fila.prima));
  const maxRamo = Math.max(0, ...estadisticas.porRamo.slice(0, 5).map((fila) => fila.prima));
  const maxMes = Math.max(0, ...estadisticas.meses.map((mes) => mes.primaCobrada));
  const maxCuotas = Math.max(0, ...estadisticas.cobranza.map((fila) => fila.polizas));
  const vencimientos = cartera.vencimientos.slice(0, 5);

  return (
    <>
      <header className="encabezado dashboard-encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Resumen general</h1>
          <p className="subtitulo">{fechaLarga()} · Estado de tus pólizas y tareas que requieren atención.</p>
        </div>
        <div className="dashboard-acciones">
          <Link href="/asegurados" className="boton boton-primario">Ver asegurados</Link>
          <Link href="/importar" className="boton">Importar cartera</Link>
        </div>
      </header>

      <section aria-label="Indicadores principales" className="dashboard-kpis">
        <Link href="/asegurados" className="tarjeta dashboard-kpi">
          <span>Pólizas administradas</span><strong>{estadisticas.polizasTotal}</strong><small>en toda la cartera</small>
        </Link>
        <Link href="/asegurados" className="tarjeta dashboard-kpi">
          <span>Pólizas vigentes</span><strong>{estadisticas.polizasVigentes}</strong><small>en administración</small>
        </Link>
        <Link href="/estadisticas" className="tarjeta dashboard-kpi">
          <span>Prima anual vigente</span><strong>{pesos(estadisticas.primaAnual)}</strong><small>valor anual contratado</small>
        </Link>
        <Link href="/vencimientos" className="tarjeta dashboard-kpi">
          <span>Vencen en 30 días</span><strong className={cartera.vencimientos.length ? "texto-ambar" : ""}>{cartera.vencimientos.length}</strong><small>pólizas para renovar</small>
        </Link>
        <Link href="/agentes/validador?tab=vencidos" className="tarjeta dashboard-kpi">
          <span>Cuotas vencidas</span><strong className={cuotasVencidas.polizas ? "texto-rojo" : ""}>{cuotasVencidas.polizas}</strong><small>{pesos(cuotasVencidas.monto)} pendientes de cobro</small>
        </Link>
        <Link href="/estadisticas" className="tarjeta dashboard-kpi">
          <span>Comisiones depositadas</span><strong>{pesos(estadisticas.comisionDepositadaAnio)}</strong><small>en {estadisticas.anio}</small>
        </Link>
      </section>

      <section className="dashboard-alertas" aria-labelledby="dashboard-alertas-titulo">
        <div className="dashboard-seccion-cabecera">
          <div><h2 id="dashboard-alertas-titulo">Notificaciones</h2><p>{totalAvisos ? `${totalAvisos} asuntos requieren seguimiento` : "No hay asuntos pendientes"}</p></div>
          {totalAvisos > 0 && <span className="dashboard-alertas-total">{totalAvisos}</span>}
        </div>
        <div className="dashboard-alertas-grid">
          {avisos.map((aviso) => (
            <Link href={aviso.href} className={`tarjeta dashboard-aviso ${aviso.cantidad ? `con-${aviso.tono}` : ""}`} key={aviso.href}>
              <span className="dashboard-aviso-etiqueta">{aviso.texto}</span>
              <strong>{aviso.cantidad}</strong>
              <span className="dashboard-aviso-pie">{"detalle" in aviso ? aviso.detalle : aviso.cantidad === 1 ? "pendiente" : "pendientes"}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-dos-columnas">
        <section className="tarjeta dashboard-panel" aria-labelledby="dashboard-companias">
          <header className="dashboard-panel-cabecera">
            <div><h2 id="dashboard-companias">Cartera por aseguradora</h2><p>Prima anual y pólizas vigentes</p></div>
            <Link href="/estadisticas">Ver estadísticas</Link>
          </header>
          {estadisticas.porCompania.length ? (
            <div className="dashboard-lista-barras">
              {estadisticas.porCompania.slice(0, 5).map((fila) => (
                <div className="dashboard-fila-barra" key={fila.nombre}>
                  <div><strong>{fila.nombre}</strong><span>{fila.polizas} {fila.polizas === 1 ? "póliza" : "pólizas"}</span></div>
                  <Barra valor={fila.prima} maximo={maxCompania} />
                  <small>{pesos(fila.prima)}</small>
                </div>
              ))}
            </div>
          ) : <p className="vacio">Todavía no hay pólizas vigentes.</p>}
        </section>

        <section className="tarjeta dashboard-panel" aria-labelledby="dashboard-ramos">
          <header className="dashboard-panel-cabecera">
            <div><h2 id="dashboard-ramos">Cartera por ramo</h2><p>Tipos de póliza por prima anual</p></div>
            <Link href="/estadisticas">Ver todos</Link>
          </header>
          {estadisticas.porRamo.length ? (
            <div className="dashboard-lista-barras">
              {estadisticas.porRamo.slice(0, 5).map((fila) => (
                <div className="dashboard-fila-barra" key={fila.nombre}>
                  <div><strong>{fila.nombre}</strong><span>{fila.polizas} {fila.polizas === 1 ? "póliza" : "pólizas"}</span></div>
                  <Barra valor={fila.prima} maximo={maxRamo} tono="verde" />
                  <small>{pesos(fila.prima)}</small>
                </div>
              ))}
            </div>
          ) : <p className="vacio">Todavía no hay ramos vigentes.</p>}
        </section>
      </div>

      <div className="dashboard-dos-columnas">
        <section className="tarjeta dashboard-panel dashboard-facturacion" aria-labelledby="dashboard-facturacion">
          <header className="dashboard-panel-cabecera">
            <div><h2 id="dashboard-facturacion">Cuotas cobradas</h2><p>{estadisticas.anio} · {pesos(estadisticas.cuotasCobradas)} en el año</p></div>
            <Link href="/estadisticas">Ver detalle</Link>
          </header>
          <div className="dashboard-meses" role="img" aria-label={`Prima cobrada por mes en ${estadisticas.anio}`}>
            {estadisticas.meses.map((mes) => (
              <div key={mes.id} title={`${mes.mes}: ${pesos(mes.primaCobrada)}`}>
                <span className="dashboard-mes-columna"><span style={{ height: `${maxMes ? Math.max(mes.primaCobrada ? 3 : 0, Math.round((mes.primaCobrada / maxMes) * 100)) : 0}%` }} /></span>
                <small>{mes.mes.replace(".", "")}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="tarjeta dashboard-panel" aria-labelledby="dashboard-estado-cuotas">
          <header className="dashboard-panel-cabecera">
            <div><h2 id="dashboard-estado-cuotas">Estado de cuotas</h2><p>Pagadas, pendientes y vencidas</p></div>
            <Link href="/agentes/validador">Ver cobranza</Link>
          </header>
          <div className="dashboard-lista-barras">
            {estadisticas.cobranza.map((fila) => (
              <div className="dashboard-fila-barra" key={fila.id}>
                <div><strong>{fila.nombre}</strong><span>{fila.polizas} {fila.polizas === 1 ? "cuota" : "cuotas"}</span></div>
                <Barra valor={fila.polizas} maximo={maxCuotas} tono={fila.id} />
                <small>{pesos(fila.monto)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-dos-columnas">
        <section className="tarjeta dashboard-panel" aria-labelledby="dashboard-renovaciones">
          <header className="dashboard-panel-cabecera">
            <div><h2 id="dashboard-renovaciones">Próximos vencimientos</h2><p>Los más cercanos en los próximos 30 días</p></div>
            <Link href="/vencimientos">Ver todos</Link>
          </header>
          {vencimientos.length ? (
            <ul className="dashboard-renovaciones">
              {vencimientos.map((poliza) => (
                <li key={poliza.id}>
                  <Link href={`/asegurados/${poliza.aseguradoId}`}><strong>{poliza.cliente}</strong><span>{poliza.ramo} · {poliza.compania ?? "Sin compañía"}</span></Link>
                  <span className="dashboard-vencimiento">{poliza.vigenciaHasta ? fechaCorta(poliza.vigenciaHasta) : "—"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="vacio">No hay vencimientos en los próximos 30 días.</p>}
        </section>

        <section className="tarjeta dashboard-panel" aria-labelledby="dashboard-cuotas-vencidas">
          <header className="dashboard-panel-cabecera">
            <div><h2 id="dashboard-cuotas-vencidas">Cobros vencidos</h2><p>Cuotas impagas con vencimiento anterior a hoy</p></div>
            <Link href="/agentes/validador?tab=vencidos">Ver todos</Link>
          </header>
          {cartera.cobrosVencidos.length ? (
            <ul className="dashboard-renovaciones">
              {cartera.cobrosVencidos.map((cuota) => (
                <li key={cuota.id}>
                  <Link href={`/asegurados/${cuota.aseguradoId}`}>
                    <strong>{cuota.cliente}</strong>
                    <span>{cuota.ramo} · {cuota.numeroPoliza ? `Póliza ${cuota.numeroPoliza}` : `Cuota ${cuota.numeroCuota}/${cuota.cantidadCuotas}`}</span>
                  </Link>
                  <span className="dashboard-cobro-vencido"><strong>{pesos(cuota.monto)}</strong><small>{fechaCorta(cuota.vencimiento)}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="vacio">No hay cuotas vencidas pendientes.</p>}
        </section>

        <section className="tarjeta dashboard-panel dashboard-actividad-panel" aria-labelledby="dashboard-actividad">
          <header className="dashboard-panel-cabecera"><div><h2 id="dashboard-actividad">Actividad reciente</h2><p>Últimos movimientos de agentes y siniestros</p></div></header>
          {cartera.actividad.length ? (
            <ol className="dashboard-actividad">
              {cartera.actividad.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.fecha.toISOString()}>{fechaCorta(diaEnArgentina(item.fecha))} · {diaYHora(item.fecha).slice(6)}</time>
                  <span><strong>{ORIGENES[item.origen] ?? item.origen}</strong>{item.cliente && ` · ${item.cliente}`}</span>
                  <p>{item.texto}</p>
                </li>
              ))}
            </ol>
          ) : <p className="vacio">La actividad de tus agentes va a aparecer acá.</p>}
        </section>
      </div>

      <footer className="dashboard-pie">
        <span>{estadisticas.siniestros.abiertos} siniestros abiertos</span>
        <span>{estadisticas.cotizaciones.total} cotizaciones iniciadas en {estadisticas.anio}</span>
        <Link href="/estadisticas">Abrir todas las estadísticas</Link>
      </footer>
    </>
  );
}
