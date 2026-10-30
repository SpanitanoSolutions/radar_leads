import Link from "next/link";
import { EncabezadoAgente, Bitacora } from "@/components/agentes/Agente";
import { agenteConfigurado, obtenerActividad, obtenerChecklistCotizacion, obtenerEnviosCotizacion, obtenerMetricasCotizacion, obtenerRespuestasSinConfirmar, obtenerSolicitudesCotizacion } from "@/lib/datos-agentes";
import { pasosConfiguracionCotizacion } from "@/lib/cotizacion/configuracion";
import { estadoVisible, estaCerrada, mejorCotizacion, filtrarSolicitudes, resumenCotizacion, soloConfirmadas, ESTADOS_COTIZACION, ESTADOS_VISIBLES_COTIZACION } from "@/lib/cotizacion";
import { diaEnArgentina } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { metricasPorAseguradora, rankingProductores, solicitudesDetenidas } from "@/lib/cotizacion/metricas";
import { actualizarSolicitud, aprobarEnvioCotizacion, cargarResultadoCotizacion, omitirBorradorCotizacion } from "./actions";
import { estadoEnvioVisible } from "@/lib/cotizacion/orquestador";
import "../agentes.css";

export const instant = false;

const ORIGENES = [
  { id: "whatsapp", texto: "WhatsApp" },
  { id: "email", texto: "Email" },
  { id: "manual", texto: "Cargada a mano" },
];
const AVISOS: Record<string, { texto: string; error?: boolean }> = {
  "solicitud-actualizada": { texto: "Actualizaste la solicitud." },
  "configuracion-guardada": { texto: "Guardaste la configuración." },
  "solicitud-invalida": { texto: "No se pudo actualizar: revisá los datos de la solicitud.", error: true },
  "solicitud-inexistente": { texto: "La solicitud ya no existe o fue eliminada.", error: true },
  "solicitud-incompleta": { texto: "Completá cliente, tipo y ramo para crear la solicitud.", error: true },
  "solicitud-vinculo-invalido": { texto: "Elegí un asegurado o un lead válido.", error: true },
  "asegurado-inexistente": { texto: "No encontramos ese asegurado. Actualizá la pantalla e intentá de nuevo.", error: true },
  "lead-inexistente": { texto: "No encontramos ese lead. Actualizá la pantalla e intentá de nuevo.", error: true },
  "sin-companias-configuradas": { texto: "Configurá al menos una compañía habilitada para cotizar antes de crear la solicitud.", error: true },
  "error-operacion": { texto: "No pudimos guardar la solicitud por un problema inesperado. Revisá si se creó antes de volver a intentarlo.", error: true },
  "resultado-cotizacion-guardado": { texto: "Guardamos la respuesta y actualizamos la comparativa." },
  "resultado-cotizacion-invalido": { texto: "Ingresá una compañía y un precio anual mayor que cero.", error: true },
  "error-resultado-cotizacion": { texto: "No pudimos guardar esa respuesta. Revisá si la solicitud sigue abierta y si la compañía pertenece a ella.", error: true },
  "envio-aprobado": { texto: "Aprobaste el correo y salió desde tu correo conectado." },
  "correo-enviado": { texto: "Salió el correo que habías aprobado." },
  "envio-aprobado-sin-enviar": { texto: "Aprobaste el correo, pero no salió: falta conectar tu correo en Configuración → Conexiones o cargar el contacto de la compañía. En el detalle de la solicitud está el motivo y el botón “Enviar ahora”.", error: true },
  "borrador-omitido": { texto: "Omitiste el borrador; no se envió nada." },
  "borrador-no-disponible": { texto: "Ese borrador ya no está pendiente de aprobación.", error: true },
  "envio-invalido": { texto: "No encontramos ese envío.", error: true },
  "error-aprobar-envio": { texto: "No pudimos aprobar el borrador. No se registró el envío.", error: true },
  "solicitud-riesgo-invalido": { texto: "Revisá los datos del riesgo y el CUIT/CUIL; no guardamos la solicitud.", error: true },
  "archivo-invalido": { texto: "El archivo debe ser PDF, Word, Excel o imagen y pesar hasta 25 MB.", error: true },
};

function desdeInicioDeMes(): Date {
  const hoy = diaEnArgentina(new Date());
  return new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`);
}

function fechaActualizada(fecha: Date): string {
  const hoy = diaEnArgentina(new Date());
  const dia = diaEnArgentina(fecha);
  return dia === hoy ? `Hoy ${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha)}` : fechaCorta(dia);
}

function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${fecha}T00:00:00Z`));
}

function nombreOrigen(origen: string): string {
  return ORIGENES.find((opcion) => opcion.id === origen)?.texto ?? origen;
}

function hrefSolicitudes(filtros: { q: string; estado: string; ramo: string; origen: string; ejecutivo: string; desde: string; hasta: string }): string {
  const parametros = new URLSearchParams({ tab: "solicitudes" });
  for (const [clave, valor] of Object.entries(filtros)) if (valor) parametros.set(clave, valor);
  return `/agentes/cotizacion?${parametros.toString()}`;
}

function hrefExportacion(filtros: { q: string; estado: string; ramo: string; origen: string; ejecutivo: string; desde: string; hasta: string }, formato?: string): string {
  const parametros = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([, valor]) => Boolean(valor))));
  if (formato) parametros.set("formato", formato);
  return `/agentes/cotizacion/exportar?${parametros.toString()}`;
}

export default async function Cotizacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "bitacora" || sp.tab === "desempeno" ? sp.tab : "solicitudes";
  const q = typeof sp.q === "string" ? sp.q : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const ramo = typeof sp.ramo === "string" ? sp.ramo : "";
  const origen = typeof sp.origen === "string" ? sp.origen : "";
  const ejecutivo = typeof sp.ejecutivo === "string" ? sp.ejecutivo : "";
  const desde = typeof sp.desde === "string" ? sp.desde : "";
  const hasta = typeof sp.hasta === "string" ? sp.hasta : "";
  const [registros, actividad, activo, datosChecklist, enviosCotizacion, datosMetricas, sinConfirmar] = await Promise.all([
    obtenerSolicitudesCotizacion(),
    tab === "bitacora" ? obtenerActividad("cotizacion") : Promise.resolve([]),
    agenteConfigurado("cotizacion"),
    obtenerChecklistCotizacion(),
    obtenerEnviosCotizacion(),
    tab === "desempeno" ? obtenerMetricasCotizacion() : Promise.resolve({ envios: [], solicitudes: [] }),
    obtenerRespuestasSinConfirmar(),
  ]);
  const solicitudes = registros.map(({ solicitud, asegurado, lead }) => {
    const cotizaciones = soloConfirmadas(solicitud.cotizaciones, sinConfirmar.get(solicitud.id) ?? []);
    return {
      ...solicitud,
      cotizaciones,
      cliente: asegurado ?? lead ?? solicitud.cliente,
      relacion: asegurado ? `Asegurado · ${solicitud.tipo}` : lead ? "Prospecto · desde Leads" : `Contacto · ${solicitud.tipo}`,
      origenTexto: nombreOrigen(solicitud.origen),
      mejor: mejorCotizacion(cotizaciones),
      respuestas: cotizaciones.filter((cotizacion) => cotizacion.precio !== null).length,
    };
  });
  const mesSolicitudes = solicitudes.filter((solicitud) => solicitud.creadoEl >= desdeInicioDeMes());
  const kpis = resumenCotizacion(mesSolicitudes);
  const filtradas = filtrarSolicitudes(solicitudes, { q, estado, ramo, origen, ejecutivo, desde, hasta });
  const ramos = [...new Set(solicitudes.map((solicitud) => solicitud.ramo))].sort((a, b) => a.localeCompare(b, "es"));
  const ejecutivos = [...new Set(solicitudes.map((solicitud) => solicitud.ejecutivo).filter((nombre): nombre is string => Boolean(nombre)))].sort((a, b) => a.localeCompare(b, "es"));
  const cerradas = solicitudes.filter((solicitud) => solicitud.estado === "ganada" || solicitud.estado === "perdida");
  const tasaGanada = cerradas.length ? Math.round((solicitudes.filter((solicitud) => solicitud.estado === "ganada").length / cerradas.length) * 100) : null;
  const preciosPorCompania = new Map<string, number>();
  for (const solicitud of solicitudes) {
    const precios = solicitud.cotizaciones.filter((cotizacion) => cotizacion.precio !== null);
    const menor = mejorCotizacion(precios);
    if (menor) preciosPorCompania.set(menor.compania, (preciosPorCompania.get(menor.compania) ?? 0) + 1);
  }
  const primeraCompania = [...preciosPorCompania].sort((a, b) => b[1] - a[1])[0];
  const metricasAseguradoras = metricasPorAseguradora(datosMetricas.envios);
  const ranking = rankingProductores(datosMetricas.envios);
  const detenidas = solicitudesDetenidas(datosMetricas.solicitudes, new Date());
  const aviso = typeof sp.aviso === "string"
    ? AVISOS[sp.aviso] ?? (/^solicitud-(\d+)$/.test(sp.aviso)
      ? { texto: `Creaste la solicitud ${sp.aviso.slice("solicitud-".length)}.`, error: false }
      : null)
    : null;
  const estados = ESTADOS_COTIZACION;
  const checklist = pasosConfiguracionCotizacion(datosChecklist);
  const faltaConfigurar = checklist.some((paso) => !paso.listo);

  return (
    <>
      <EncabezadoAgente
        agente="cotizacion"
        titulo="Agente de cotización"
        activo={activo}
        descripcion="Prepará solicitudes, revisá las respuestas de tus compañías y compará las coberturas antes de hacer una propuesta."
        extra={<span className="cotizacion-correo">El agente deja cada correo como borrador. Nada sale sin tu aprobación.</span>}
      >
        <Link href="/agentes/cotizacion/configuracion" className="boton">Configuración</Link>
        <Link href="/agentes/cotizacion/nueva" className="boton boton-primario">Nueva solicitud</Link>
      </EncabezadoAgente>

      {aviso && <p role={aviso.error ? "alert" : "status"} className={`cotizacion-aviso${aviso.error ? " error" : ""}`}>{aviso.texto}</p>}

      {faltaConfigurar && (
        <section className="cotizacion-configuracion" aria-labelledby="cotizacion-checklist">
          <div>
            <h2 id="cotizacion-checklist">Terminá de configurar tu agente de cotización</h2>
            <p>{checklist.filter((paso) => paso.listo).length} de {checklist.length} listos. Cada paso lleva a su sección de la configuración.</p>
          </div>
          <ol>
            {checklist.map((paso) => (
              <li key={paso.id} className={paso.listo ? "listo" : "pendiente"}>
                <span aria-hidden="true">{paso.listo ? "✓" : "○"}</span>
                <span className="cotizacion-checklist-paso">
                  {paso.listo ? <span>{paso.texto}</span> : <Link href={paso.href}>{paso.texto}</Link>}
                  <small>{paso.listo ? "Listo" : paso.detalle}</small>
                </span>
                <span className="visualmente-oculto">{paso.listo ? " (listo)" : " (pendiente)"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <nav aria-label="Secciones del agente" className="pestanas">
        <Link href="/agentes/cotizacion?tab=solicitudes" aria-current={tab === "solicitudes" ? "page" : undefined} className="pestana">Solicitudes</Link>
        <Link href="/agentes/cotizacion?tab=bitacora" aria-current={tab === "bitacora" ? "page" : undefined} className="pestana">Historial</Link>
        <Link href="/agentes/cotizacion?tab=desempeno" aria-current={tab === "desempeno" ? "page" : undefined} className="pestana">Desempeño</Link>
      </nav>

      {tab === "solicitudes" && (
        <>
          <section aria-label="Resumen" className="kpis-agente cotizacion-kpis">
            <Link href={hrefSolicitudes({ q, estado: "", ramo, origen, ejecutivo, desde, hasta })} className="kpi-agente cotizacion-kpi-link">
              <span className="kpi-agente-titulo">Activas</span><span className="kpi-agente-valor">{kpis.activas}</span>
            </Link>
            <Link href={hrefSolicitudes({ q, estado: estado === "atencion" ? "" : "atencion", ramo, origen, ejecutivo, desde, hasta })} aria-pressed={estado === "atencion"} className="kpi-agente cotizacion-kpi-link">
              <span className="kpi-agente-titulo">Requieren tu atención</span><span className="kpi-agente-valor texto-rojo">{kpis.atencion}</span>
            </Link>
            <div className="kpi-agente"><span className="kpi-agente-titulo">Solicitudes del mes</span><span className="kpi-agente-valor">{kpis.delMes}</span></div>
            <div className="kpi-agente"><span className="kpi-agente-titulo">Cotizaciones recibidas</span><span className="kpi-agente-valor">{kpis.recibidas}</span></div>
          </section>

          <section aria-label="Solicitudes" className="tarjeta cotizacion-tabla-tarjeta">
            <form action="/agentes/cotizacion" className="cotizacion-filtros">
              <input type="hidden" name="tab" value="solicitudes" />
              <label className="visualmente-oculto" htmlFor="cotizacion-q">Buscar cliente o número</label>
              <input id="cotizacion-q" type="search" name="q" defaultValue={q} placeholder="Buscar cliente o número" />
              <label className="visualmente-oculto" htmlFor="cotizacion-estado">Estado</label>
              <select id="cotizacion-estado" name="estado" defaultValue={estado}><option value="">Todos los estados</option>{ESTADOS_VISIBLES_COTIZACION.map((e) => <option key={e.id} value={e.id}>{e.texto}</option>)}</select>
              <label className="visualmente-oculto" htmlFor="cotizacion-ramo">Ramo</label>
              <select id="cotizacion-ramo" name="ramo" defaultValue={ramo}><option value="">Todos los ramos</option>{ramos.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <label className="visualmente-oculto" htmlFor="cotizacion-origen">Origen</label>
              <select id="cotizacion-origen" name="origen" defaultValue={origen}><option value="">Todos los orígenes</option>{ORIGENES.map((item) => <option key={item.id} value={item.id}>{item.texto}</option>)}</select>
              <label className="visualmente-oculto" htmlFor="cotizacion-ejecutivo">Ejecutivo</label>
              <select id="cotizacion-ejecutivo" name="ejecutivo" defaultValue={ejecutivo}><option value="">Todos los ejecutivos</option>{ejecutivos.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <label className="visualmente-oculto" htmlFor="cotizacion-desde">Desde</label><input id="cotizacion-desde" type="date" name="desde" defaultValue={desde} />
              <label className="visualmente-oculto" htmlFor="cotizacion-hasta">Hasta</label><input id="cotizacion-hasta" type="date" name="hasta" defaultValue={hasta} />
              <button type="submit" className="boton">Filtrar</button>
              {(q || estado || ramo || origen || ejecutivo || desde || hasta) && <Link href="/agentes/cotizacion?tab=solicitudes" className="cotizacion-limpiar">Limpiar</Link>}
            </form>
            <div className="cotizacion-botones-borrador"><Link className="boton" href={hrefExportacion({ q, estado, ramo, origen, ejecutivo, desde, hasta })}>Exportar CSV</Link><Link className="boton" href={hrefExportacion({ q, estado, ramo, origen, ejecutivo, desde, hasta }, "xlsx")}>Exportar Excel</Link></div>
            <div className="tabla-scroll">
              <table className="tabla cotizacion-tabla">
                <thead><tr><th>N°</th><th>Cliente</th><th>Pedido</th><th>Origen</th><th>Compañías</th><th className="numero">Mejor precio</th><th>Estado</th><th>Actualizado</th></tr></thead>
                <tbody>
                  {filtradas.map((solicitud) => {
                    const porcentaje = solicitud.companias.length ? Math.round((solicitud.respuestas / solicitud.companias.length) * 100) : 0;
                    const visible = estadoVisible(solicitud);
                    const estadoSolicitud = ESTADOS_VISIBLES_COTIZACION.find((item) => item.id === visible);
                    return (
                      <tr key={solicitud.id}>
                        <td><Link href={`/agentes/cotizacion/${solicitud.id}`}><strong>{solicitud.numero}</strong></Link></td>
                        <td><strong>{solicitud.cliente}</strong><span className="cotizacion-relacion">{solicitud.relacion}</span></td>
                        <td><strong>{solicitud.ramo}{solicitud.bien ? ` · ${solicitud.bien}` : ""}</strong><span className="cotizacion-relacion">{solicitud.motivo ?? "Sin motivo informado"}</span></td>
                        <td>{solicitud.origenTexto}</td>
                        <td>
                          <span>{solicitud.respuestas} de {solicitud.companias.length} respondieron</span>
                          <span className="cotizacion-progreso" aria-label={`${porcentaje}% de respuestas`}><span style={{ width: `${porcentaje}%` }} /></span>
                          <details className="cotizacion-actualizar">
                            <summary>Ver respuestas / cargar precio</summary>
                            <div className="cotizacion-respuestas">
                              {solicitud.companias.map((compania) => {
                                const resultado = solicitud.cotizaciones.find((item) => item.compania === compania);
                                const cotizacion = resultado?.precio !== null ? resultado : undefined;
                                const envio = enviosCotizacion.find((item) => item.solicitudId === solicitud.id && item.compania === compania);
                                return (
                                  <section key={compania}>
                                    <strong>{compania}</strong>
                                    {cotizacion ? <p>{pesos(cotizacion.precio!)}{cotizacion.recibidaEl ? ` · recibida ${cotizacion.recibidaEl.slice(0, 10)}` : ""}</p> : sinConfirmar.get(solicitud.id)?.includes(compania) ? <p>Llegó una respuesta que falta confirmar. <Link href={`/agentes/cotizacion/${solicitud.id}?tab=cotizaciones`}>Revisala en el detalle</Link>.</p> : envio?.estadoBorrador === "pendiente" ? <p>Borrador pendiente de tu aprobación.</p> : envio?.estadoBorrador === "omitido" && !envio.canalUsado ? <p>Omitido; no se envió nada.</p> : envio ? <p>{[estadoEnvioVisible(envio).texto, estadoEnvioVisible(envio).detalle].filter(Boolean).join(". ")}</p> : resultado?.estado === "error" ? <p role="alert">No se envió el pedido.</p> : <p>Pendiente</p>}
                                    {cotizacion?.observacion && <p>{cotizacion.observacion}</p>}
                                    {envio?.estadoBorrador === "pendiente" && <div className="cotizacion-botones-borrador">
                                      <form action={aprobarEnvioCotizacion}><input type="hidden" name="envioId" value={envio.id} /><button className="boton boton-primario">Aprobar borrador</button></form>
                                      <form action={omitirBorradorCotizacion}><input type="hidden" name="envioId" value={envio.id} /><button className="boton">Omitir</button></form>
                                    </div>}
                                    {estaCerrada(solicitud) ? <p>Solicitud cerrada.</p> : (
                                      <form action={cargarResultadoCotizacion}>
                                        <input type="hidden" name="solicitudId" value={solicitud.id} />
                                        <input type="hidden" name="compania" value={compania} />
                                        <input type="hidden" name="filtroEstado" value={estado} />
                                        <input type="hidden" name="filtroQ" value={q} />
                                        <input type="hidden" name="filtroRamo" value={ramo} />
                                        <input type="hidden" name="filtroOrigen" value={origen} />
                                        <label><span>Prima anual</span><input name="precio" type="number" min="0.01" step="0.01" required defaultValue={cotizacion?.precio ?? ""} /></label>
                                        <label><span>Observación</span><input name="observacion" type="text" maxLength={500} defaultValue={cotizacion?.observacion ?? ""} /></label>
                                        <button type="submit" className="boton">{cotizacion ? "Actualizar respuesta" : "Guardar respuesta"}</button>
                                      </form>
                                    )}
                                  </section>
                                );
                              })}
                              <p className="texto-suave">La aprobación registra una salida simulada; no contacta a la compañía. Cargá acá la respuesta que recibiste.</p>
                            </div>
                          </details>
                        </td>
                        <td className="numero">{solicitud.mejor ? <><strong>{pesos(solicitud.mejor.precio)}</strong><span className="cotizacion-relacion">{solicitud.mejor.compania}</span></> : "—"}</td>
                        <td>
                          <span className={`pastilla cotizacion-estado ${visible}`}>{estadoSolicitud?.texto ?? visible}</span>
                          {solicitud.nota && <span className="cotizacion-relacion">{solicitud.nota}</span>}
                          <details className="cotizacion-actualizar">
                            <summary>Actualizar</summary>
                            <form action={actualizarSolicitud}>
                              <input type="hidden" name="id" value={solicitud.id} />
                              <input type="hidden" name="filtroEstado" value={estado} />
                              <input type="hidden" name="filtroQ" value={q} />
                              <input type="hidden" name="filtroRamo" value={ramo} />
                              <input type="hidden" name="filtroOrigen" value={origen} />
                              <label><span>Estado</span><select name="estado" defaultValue={solicitud.estado}>{estados.map((e) => <option key={e.id} value={e.id}>{e.texto}</option>)}</select></label>
                              <label><span>Nota</span><input name="nota" type="text" defaultValue={solicitud.nota ?? ""} maxLength={500} /></label>
                              <button type="submit" className="boton boton-primario">Guardar cambio</button>
                            </form>
                          </details>
                        </td>
                        <td>{fechaActualizada(solicitud.actualizadoEl)}</td>
                      </tr>
                    );
                  })}
                  {!filtradas.length && <tr><td colSpan={8} className="cotizacion-vacia">No hay solicitudes con estos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "bitacora" && <Bitacora actividad={actividad} />}

      {tab === "desempeno" && (
        <div className="cotizacion-metricas">
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Desempeño por aseguradora</h2><div className="tabla-scroll"><table className="tabla"><thead><tr><th>Aseguradora</th><th>Intentos</th><th>Cotizadas</th><th>Rechazos</th><th>Respuesta promedio</th><th>Seguimientos</th><th>Prima neta promedio</th></tr></thead><tbody>
            {metricasAseguradoras.map((item) => <tr key={item.compania}><td>{item.compania}</td><td>{item.intentos}</td><td>{Math.round(item.tasaCotizacion * 100)} %</td><td>{Math.round(item.tasaRechazo * 100)} %</td><td>{item.tiempoPromedioHoras == null ? "—" : `${item.tiempoPromedioHoras.toFixed(1)} h`}</td><td>{item.seguimientosPromedio.toFixed(1)}</td><td>{item.primaNetaPromedio == null ? "—" : pesos(item.primaNetaPromedio)}</td></tr>)}
            {!metricasAseguradoras.length && <tr><td colSpan={7}>Todavía no hay envíos registrados.</td></tr>}
          </tbody></table></div></section>
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Ranking de productores</h2><div className="tabla-scroll"><table className="tabla"><thead><tr><th>Productor</th><th>Solicitudes</th><th>Cerradas</th><th>Activas</th><th>Tasa de cotización</th><th>Pendientes</th></tr></thead><tbody>
            {ranking.map((item) => <tr key={item.productor}><td>{item.productor}</td><td>{item.solicitudes}</td><td>{item.cerradas}</td><td>{item.activas}</td><td>{Math.round(item.tasaCotizacion * 100)} %</td><td>{item.pendientes}</td></tr>)}
            {!ranking.length && <tr><td colSpan={6}>Todavía no hay actividad para medir.</td></tr>}
          </tbody></table></div></section>
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Solicitudes detenidas</h2>{detenidas.length ? <ul>{detenidas.slice(0, 10).map((item) => <li key={item.id}><Link href={`/agentes/cotizacion/${item.id}`}>Solicitud {item.id}</Link> · {item.estado} · desde {fechaActualizada(item.actualizadoEl)}</li>)}</ul> : <p>No hay solicitudes activas detenidas.</p>}</section>
          <div className="cotizacion-desempeno"><article className="tarjeta"><span>Tasa de cierre ganada</span><strong>{tasaGanada === null ? "—" : `${kpis.ganadas} de ${kpis.cerradas} · ${tasaGanada} %`}</strong></article><article className="tarjeta"><span>Compañía con más primeros puestos</span><strong>{primeraCompania ? `${primeraCompania[0]} · ${primeraCompania[1]}` : "Todavía no hay comparativas"}</strong></article></div>
        </div>
      )}
    </>
  );
}
