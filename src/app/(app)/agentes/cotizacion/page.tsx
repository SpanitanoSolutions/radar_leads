import Link from "next/link";
import { EncabezadoAgente, Bitacora } from "@/components/agentes/Agente";
import { obtenerCuenta, obtenerConexiones } from "@/lib/datos";
import { agenteConfigurado, obtenerActividad, obtenerOpcionesSolicitud, obtenerSolicitudesCotizacion } from "@/lib/datos-agentes";
import { mejorCotizacion, filtrarSolicitudes, resumenCotizacion, ESTADOS_COTIZACION } from "@/lib/cotizacion";
import { diaEnArgentina } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { actualizarSolicitud, nuevaSolicitud } from "./actions";
import "../agentes.css";

export const instant = false;

const ORIGENES = [
  { id: "whatsapp", texto: "WhatsApp" },
  { id: "email", texto: "Email" },
  { id: "manual", texto: "Cargada a mano" },
];
const AVISOS: Record<string, string> = {
  "solicitud-actualizada": "Actualizaste la solicitud.",
  "configuracion-guardada": "Guardaste la configuración.",
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

function hrefSolicitudes(filtros: { q: string; estado: string; ramo: string; origen: string }): string {
  const parametros = new URLSearchParams({ tab: "solicitudes" });
  for (const [clave, valor] of Object.entries(filtros)) if (valor) parametros.set(clave, valor);
  return `/agentes/cotizacion?${parametros.toString()}`;
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
  const [registros, opciones, actividad, activo, conexiones, cuenta] = await Promise.all([
    obtenerSolicitudesCotizacion(),
    obtenerOpcionesSolicitud(),
    tab === "bitacora" ? obtenerActividad("cotizacion") : Promise.resolve([]),
    agenteConfigurado("cotizacion"),
    obtenerConexiones(),
    obtenerCuenta(),
  ]);
  const solicitudes = registros.map(({ solicitud, asegurado, lead }) => ({
    ...solicitud,
    cliente: asegurado ?? lead ?? solicitud.cliente,
    relacion: asegurado ? `Asegurado · ${solicitud.tipo}` : lead ? "Prospecto · desde Leads" : `Contacto · ${solicitud.tipo}`,
    origenTexto: nombreOrigen(solicitud.origen),
    mejor: mejorCotizacion(solicitud.cotizaciones),
    respuestas: solicitud.cotizaciones.filter((cotizacion) => cotizacion.precio !== null).length,
  }));
  const mesSolicitudes = solicitudes.filter((solicitud) => solicitud.creadoEl >= desdeInicioDeMes());
  const kpis = resumenCotizacion(mesSolicitudes);
  const filtradas = filtrarSolicitudes(solicitudes, { q, estado, ramo, origen });
  const ramos = [...new Set(solicitudes.map((solicitud) => solicitud.ramo))].sort((a, b) => a.localeCompare(b, "es"));
  const cerradas = solicitudes.filter((solicitud) => solicitud.estado === "ganada" || solicitud.estado === "perdida");
  const tasaGanada = cerradas.length ? Math.round((solicitudes.filter((solicitud) => solicitud.estado === "ganada").length / cerradas.length) * 100) : null;
  const preciosPorCompania = new Map<string, number>();
  for (const solicitud of solicitudes) {
    const precios = solicitud.cotizaciones.filter((cotizacion) => cotizacion.precio !== null);
    const menor = mejorCotizacion(precios);
    if (menor) preciosPorCompania.set(menor.compania, (preciosPorCompania.get(menor.compania) ?? 0) + 1);
  }
  const primeraCompania = [...preciosPorCompania].sort((a, b) => b[1] - a[1])[0];
  const aviso = typeof sp.aviso === "string" ? AVISOS[sp.aviso] ?? null : null;
  const estados = ESTADOS_COTIZACION;
  const portales = conexiones.filter((conexion) => conexion.tipo === "portal");
  const checklist = [
    { listo: activo, texto: "Activá el agente", href: "/agentes/cotizacion" },
    {
      listo: portales.length > 0 && portales.every((conexion) => conexion.estado === "conectado" || conexion.estado === "por_email"),
      texto: "Conectá los portales o agregá el email de tus compañías",
      href: "/configuracion",
    },
    { listo: conexiones.some((conexion) => conexion.clave === "email" && conexion.estado === "conectado"), texto: "Conectá el correo", href: "/configuracion?panel=email" },
    { listo: Boolean(cuenta.nombre), texto: "Completá el nombre del productor para la firma", href: "/configuracion?tab=cuenta" },
  ];
  const faltaConfigurar = checklist.some((paso) => !paso.listo);

  return (
    <>
      <EncabezadoAgente
        agente="cotizacion"
        titulo="Agente de cotización"
        activo={activo}
        descripcion="Recibe pedidos por WhatsApp y email, pide precios a tus compañías y te arma la comparativa para enviarle al cliente."
        extra={<span className="cotizacion-correo">Las respuestas y los precios se cargan en la app; no se envían automáticamente.</span>}
      >
        <Link href="/configuracion" className="boton">Configuración</Link>
        <details className="cotizacion-nueva">
          <summary className="boton boton-primario">Nueva solicitud</summary>
          <form action={nuevaSolicitud} className="cotizacion-form-nueva">
            <label>
              <span>Asegurado o lead</span>
              <select name="vinculo" defaultValue="" required>
                <option value="" disabled>Elegí un contacto</option>
                <optgroup label="Asegurados">{opciones.asegurados.map((a) => <option key={`a-${a.id}`} value={`asegurado:${a.id}`}>{a.nombre}</option>)}</optgroup>
                <optgroup label="Leads">{opciones.leads.map((lead) => <option key={`l-${lead.id}`} value={`lead:${lead.id}`}>{lead.nombre}</option>)}</optgroup>
              </select>
            </label>
            <div className="cotizacion-campos-dos">
              <label><span>Tipo</span><select name="tipo" defaultValue="renovacion"><option value="renovacion">Renovación</option><option value="mejora">Mejora</option><option value="nueva">Nueva</option></select></label>
              <label><span>Ramo</span><input name="ramo" type="text" maxLength={100} required placeholder="Auto, Flota, Hogar" /></label>
            </div>
            <label><span>Bien a asegurar</span><input name="bien" type="text" maxLength={250} /></label>
            <label><span>Motivo</span><input name="motivo" type="text" maxLength={500} placeholder="Vence en 12 días, mejorar cobertura…" /></label>
            <button type="submit" className="boton boton-primario">Crear solicitud</button>
          </form>
        </details>
      </EncabezadoAgente>

      {aviso && <p role="status" className="cotizacion-aviso">{aviso}</p>}

      {faltaConfigurar && (
        <section className="cotizacion-configuracion" aria-labelledby="cotizacion-checklist">
          <div>
            <h2 id="cotizacion-checklist">Termina de configurar tu agente</h2>
            <p>Las conexiones son de prueba. Los pedidos y mensajes no salen hasta que los apruebes.</p>
          </div>
          <ol>
            {checklist.map((paso) => (
              <li key={paso.texto} className={paso.listo ? "listo" : "pendiente"}>
                <span aria-hidden="true">{paso.listo ? "✓" : "○"}</span>
                {paso.listo ? <span>{paso.texto}</span> : <Link href={paso.href}>{paso.texto}</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <nav aria-label="Secciones del agente" className="pestanas">
        <Link href="/agentes/cotizacion?tab=solicitudes" aria-current={tab === "solicitudes" ? "page" : undefined} className="pestana">Solicitudes</Link>
        <Link href="/agentes/cotizacion?tab=bitacora" aria-current={tab === "bitacora" ? "page" : undefined} className="pestana">Bitácora</Link>
        <Link href="/agentes/cotizacion?tab=desempeno" aria-current={tab === "desempeno" ? "page" : undefined} className="pestana">Desempeño</Link>
      </nav>

      {tab === "solicitudes" && (
        <>
          <section aria-label="Resumen" className="kpis-agente cotizacion-kpis">
            <Link href={hrefSolicitudes({ q, estado: "", ramo, origen })} className="kpi-agente cotizacion-kpi-link">
              <span className="kpi-agente-titulo">Activas</span><span className="kpi-agente-valor">{kpis.activas}</span>
            </Link>
            <Link href={hrefSolicitudes({ q, estado: estado === "atencion" ? "" : "atencion", ramo, origen })} aria-pressed={estado === "atencion"} className="kpi-agente cotizacion-kpi-link">
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
              <select id="cotizacion-estado" name="estado" defaultValue={estado}><option value="">Todos los estados</option>{estados.map((e) => <option key={e.id} value={e.id}>{e.texto}</option>)}</select>
              <label className="visualmente-oculto" htmlFor="cotizacion-ramo">Ramo</label>
              <select id="cotizacion-ramo" name="ramo" defaultValue={ramo}><option value="">Todos los ramos</option>{ramos.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <label className="visualmente-oculto" htmlFor="cotizacion-origen">Origen</label>
              <select id="cotizacion-origen" name="origen" defaultValue={origen}><option value="">Todos los orígenes</option>{ORIGENES.map((item) => <option key={item.id} value={item.id}>{item.texto}</option>)}</select>
              <button type="submit" className="boton">Filtrar</button>
              {(q || estado || ramo || origen) && <Link href="/agentes/cotizacion?tab=solicitudes" className="cotizacion-limpiar">Limpiar</Link>}
            </form>
            <div className="tabla-scroll">
              <table className="tabla cotizacion-tabla">
                <thead><tr><th>N°</th><th>Cliente</th><th>Pedido</th><th>Origen</th><th>Compañías</th><th className="numero">Mejor precio</th><th>Estado</th><th>Actualizado</th></tr></thead>
                <tbody>
                  {filtradas.map((solicitud) => {
                    const porcentaje = solicitud.companias.length ? Math.round((solicitud.respuestas / solicitud.companias.length) * 100) : 0;
                    const estadoSolicitud = estados.find((item) => item.id === solicitud.estado);
                    return (
                      <tr key={solicitud.id}>
                        <td>{solicitud.numero}</td>
                        <td><strong>{solicitud.cliente}</strong><span className="cotizacion-relacion">{solicitud.relacion}</span></td>
                        <td><strong>{solicitud.ramo}{solicitud.bien ? ` · ${solicitud.bien}` : ""}</strong><span className="cotizacion-relacion">{solicitud.motivo ?? "Sin motivo informado"}</span></td>
                        <td>{solicitud.origenTexto}</td>
                        <td><span>{solicitud.respuestas} de {solicitud.companias.length} respondieron</span><span className="cotizacion-progreso" aria-label={`${porcentaje}% de respuestas`}><span style={{ width: `${porcentaje}%` }} /></span></td>
                        <td className="numero">{solicitud.mejor ? <><strong>{pesos(solicitud.mejor.precio)}</strong><span className="cotizacion-relacion">{solicitud.mejor.compania}</span></> : "—"}</td>
                        <td>
                          <span className={`pastilla cotizacion-estado ${solicitud.estado}`}>{estadoSolicitud?.texto ?? solicitud.estado}</span>
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
        <section aria-label="Desempeño" className="cotizacion-desempeno">
          <article className="tarjeta"><span>Solicitudes ganadas</span><strong>{tasaGanada === null ? "—" : `${kpis.ganadas} de ${kpis.cerradas} · ${tasaGanada} %`}</strong></article>
          <article className="tarjeta"><span>Compañía con más primeros puestos</span><strong>{primeraCompania ? `${primeraCompania[0]} · ${primeraCompania[1]}` : "Todavía no hay comparativas"}</strong></article>
          <article className="tarjeta"><span>Solicitudes activas</span><strong>{kpis.activas}</strong></article>
        </section>
      )}
    </>
  );
}
