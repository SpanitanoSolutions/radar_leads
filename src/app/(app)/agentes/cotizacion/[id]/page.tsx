import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { BotonCopiar } from "@/components/BotonCopiar";
import { obtenerDetalleCotizacion } from "@/lib/datos-agentes";
import { diaYHora } from "@/lib/fechas";
import { porcentajeCerrados, validarCotizacionContraSolicitud } from "@/lib/cotizacion";
import { estadoIACotizacion, lecturasDePdfs, obtenerBorradoresIA } from "@/agentes/cotizacion/ia";
import { contextoDeEnvios } from "@/agentes/cotizacion/detalle";
import { borradorEjecutivo, resumenesAprobados } from "@/agentes/cotizacion/ejecutivo";
import { archivosPorCompania, atencionDeLaSolicitud, borradorVisible, estadoContacto, nombrePaqueteDe, pasosDeLaSolicitud, proximoSeguimiento, seguimientosActivos, tablaContactos, textoProximo, textoTabulado } from "@/lib/cotizacion/detalle";
import { etiquetaRiesgo } from "@/lib/cotizacion/ejecutivo";
import { coberturasManuales, envioConMejorPrecio, FILAS_COBERTURA, filasComparativo, precioComparativo, type VistaComparativo } from "@/lib/cotizacion/comparativo";
import { nombreEvento } from "@/lib/cotizacion/eventos";
import { datoPedido, elegibleParaCotizar, EVENTO_AUTORIZACION } from "@/lib/cotizacion/orquestador";
import { aprobarEnvioCotizacion, aprobarPropuestaCotizacion, aprobarResumenEjecutivoAccion, aprobarYCotizarSolicitud, cargarArchivoCotizacion, reenviarCorreoCotizacionAccion, reenviarResumenEjecutivoAccion, cargarResultadoCotizacion, confirmarResultadoCotizacionAccion, generarPropuestaCotizacion, marcarSolicitudCompletada, omitirBorradorCotizacion, responderDatoCotizacion, simularRespuestaCotizacion, chatearCotizacionIA, redactarCorreoConIA, extraerPdfConIA } from "../actions";
import { ActualizarMientrasLee } from "./ActualizarMientrasLee";
import "../../agentes.css";

export const instant = false;

const ACTIVIDAD_VISIBLE = 6;
const ESTADO_PASO = { hecho: "Hecho", en_curso: "En curso", pendiente: "Pendiente" } as const;

const TABS = [
  ["contactos", "Contactos"], ["cotizaciones", "Cotizaciones"], ["validacion", "Validación"], ["agente", "Agente"],
] as const;

const AVISOS: Record<string, { texto: string; error?: boolean }> = {
  "completada": { texto: "Marcaste la solicitud como completada." },
  "archivo-guardado": { texto: "Guardamos el archivo adjunto." },
  "ia-generada": { texto: "La IA preparó el texto del borrador. Sigue pendiente de tu aprobación." },
  "ia-no-disponible": { texto: "La IA no está activa para Cotización. Podés seguir a mano: las plantillas y la carga de respuestas funcionan igual.", error: true },
  "ia-sin-cuota": { texto: "Se llegó al tope de gasto de IA de este mes. Podés seguir a mano; la IA vuelve el mes que viene.", error: true },
  "ia-sin-resultado": { texto: "La IA no pudo responder esta vez. Probá de nuevo en un rato o seguí a mano.", error: true },
  "ia-leyendo": { texto: "La IA está leyendo el PDF. Cuando termine, la respuesta aparece en el comparativo para que la revises y la confirmes." },
  "borrador-no-disponible": { texto: "Ese borrador ya no está pendiente de aprobación.", error: true },
  "archivo-invalido": { texto: "Ese archivo no es el PDF de una compañía de esta solicitud.", error: true },
  "resultado-confirmado": { texto: "Confirmaste la respuesta. Ya cuenta en el comparativo y en la lista." },
  "error-confirmar-resultado": { texto: "No pudimos confirmar esa respuesta. Revisá si la solicitud sigue abierta.", error: true },
  "cotizando": { texto: "Aprobaste la solicitud. El agente está pidiendo la cotización a las compañías conectadas; lo que respondan aparece en Cotizaciones para que lo confirmes. Los correos siguen esperando tu aprobación." },
  "nada-para-cotizar": { texto: "Aprobaste la solicitud. No quedaban compañías por cotizar: todas tienen su pedido en curso o ya respondieron." },
  "solicitud-cerrada": { texto: "La solicitud ya está cerrada: no se cotizó nada.", error: true },
  "error-cotizar": { texto: "No pudimos aprobar la solicitud. Probá de nuevo en un rato.", error: true },
  "dato-respondido": { texto: "Guardamos tu respuesta en los datos del riesgo. El agente vuelve a cotizar con esa compañía." },
  "dato-vacio": { texto: "Escribí la respuesta para la compañía.", error: true },
  "dato-no-disponible": { texto: "Esa compañía ya no está esperando un dato.", error: true },
  "error-dato": { texto: "No pudimos guardar tu respuesta. Probá de nuevo.", error: true },
  "envio-aprobado": { texto: "Aprobaste el correo y salió desde tu correo conectado." },
  "correo-enviado": { texto: "Salió el correo que habías aprobado." },
  "envio-aprobado-sin-enviar": { texto: "Aprobaste el correo, pero no salió. En la tabla está el motivo; cuando lo resuelvas, tocá “Enviar ahora”.", error: true },
  "borrador-omitido": { texto: "Omitiste el borrador; no se envió nada." },
  "propuesta-generada": { texto: "Generaste la propuesta con tu logo. Queda como borrador hasta que la apruebes." },
  "propuesta-sin-logo": { texto: "Generaste la propuesta. No lleva logo: cargalo en Mi equipo para que salga en las próximas. Queda como borrador hasta que la apruebes." },
  "propuesta-sin-logo-webp": { texto: "Generaste la propuesta sin tu logo: está en WebP y el PDF solo acepta PNG o JPG. Subilo en uno de esos formatos en Mi equipo.", error: true },
  "propuesta-sin-logo-invalido": { texto: "Generaste la propuesta sin tu logo: no lo pudimos leer. Volvé a subirlo en PNG o JPG en Mi equipo.", error: true },
  "propuesta-aprobada": { texto: "Aprobaste la propuesta. Ya podés descargarla; compartirla con el cliente queda a tu cargo." },
  "sin-resultados-confirmados": { texto: "Para generar la propuesta, confirmá al menos una respuesta en el comparativo.", error: true },
  "resumen-enviado": { texto: "Aprobaste el resumen y salió a tu correo." },
  "resumen-sin-enviar": { texto: "Aprobaste el resumen, pero no salió. Abajo está el motivo y el botón “Enviar ahora”.", error: true },
  "resumen-cambio": { texto: "El resumen cambió mientras lo mirabas (llegó algo nuevo). Revisalo de nuevo antes de aprobarlo.", error: true },
  "error-resumen": { texto: "No pudimos aprobar el resumen. Probá de nuevo en un rato.", error: true },
};

export default async function DetalleCotizacion({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; aviso?: string; ia?: string; vista?: string }>;
}) {
  const [{ id: textoId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(textoId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detalle = await obtenerDetalleCotizacion(id);
  if (!detalle) notFound();
  const { solicitud, asegurado, lead, envios, archivos, propuestas, eventos, resultados, paquetes } = detalle;
  const pdfsDeCompanias = archivos.filter((archivo) => archivo.mime === "application/pdf" && archivo.envioId);
  const tab = TABS.some(([valor]) => valor === sp.tab) ? sp.tab! : "contactos";
  const [estadoIA, borradoresIA, lecturas, ctx, [config], ejecutivo, resumenes, [marca]] = await Promise.all([
    estadoIACotizacion(), obtenerBorradoresIA(id), lecturasDePdfs(pdfsDeCompanias.map((archivo) => archivo.id)),
    contextoDeEnvios(envios, resultados, paquetes),
    db.select({ persona: schema.cotizacionConfig.persona, nombreAgente: schema.cotizacionConfig.nombreAgente, personalidad: schema.cotizacionConfig.personalidad, maxSeguimientos: schema.cotizacionConfig.maxSeguimientos })
      .from(schema.cotizacionConfig).where(eq(schema.cotizacionConfig.id, 1)),
    tab === "agente" ? borradorEjecutivo(id) : Promise.resolve(null),
    tab === "agente" ? resumenesAprobados(id) : Promise.resolve([]),
    // Solo el comienzo del logo (data URI): alcanza para saber si hay y en qué formato.
    db.select({ logo: sql<string | null>`left(${schema.ajustes.productorLogo}, 30)` }).from(schema.ajustes).where(eq(schema.ajustes.id, 1)),
  ]);
  const { cotizando, sinEnviar } = ctx;
  const leyendo = [...lecturas.values()].some((lectura) => lectura.estado === "pendiente" || lectura.estado === "procesando");
  const cerrada = Boolean(solicitud.completadoEl) || ["ganada", "perdida"].includes(solicitud.estado);
  const autorizada = eventos.some((evento) => evento.tipo === EVENTO_AUTORIZACION);
  const porCotizar = envios.filter((envio) => elegibleParaCotizar(envio) && !cotizando.has(envio.id)).length;
  const cliente = asegurado?.nombre ?? lead?.empresa ?? solicitud.cliente;
  const vista: VistaComparativo = sp.vista === "compacta" ? "compacta" : "detallada";
  const mejorId = envioConMejorPrecio(envios.map((envio) => resultados.find((resultado) => resultado.envioId === envio.id)));
  const maximoSeguimientos = config?.maxSeguimientos ?? 3;
  const atencion = cerrada ? [] : atencionDeLaSolicitud(envios, ctx);
  const seguimientos = cerrada ? [] : seguimientosActivos(envios, ctx, maximoSeguimientos);
  const gruposArchivos = archivosPorCompania(archivos, envios, ctx.nombrePaquete);
  const porcentaje = porcentajeCerrados(envios);
  const ultimoResumen = resumenes[0];
  const pendientesDeAprobar = envios.filter((envio) => envio.estadoBorrador === "pendiente" && !cotizando.has(envio.id) && envio.asuntoBorrador);
  const resultadoPorEnvio = new Map(resultados.map((resultado) => [resultado.envioId, resultado]));
  const aviso = sp.aviso ? AVISOS[sp.aviso] : undefined;
  return (
    <main className="agente-pagina cotizacion-detalle">
      <header className="encabezado-pagina cotizacion-detalle-cabecera">
        <div><Link href="/agentes/cotizacion">← Solicitudes</Link><p className="cotizacion-relacion">Solicitud {solicitud.numero} · {solicitud.ramo} · {new Date(solicitud.creadoEl).toLocaleDateString("es-AR")}</p><h1>{cliente}</h1><p>{solicitud.tipo === "negocio_nuevo" ? "Negocio nuevo" : "Renovación"}{solicitud.bien ? ` · ${solicitud.bien}` : ""}</p></div>
        <form action={marcarSolicitudCompletada}><input type="hidden" name="solicitudId" value={id} /><button className="boton boton-primario" disabled={Boolean(solicitud.completadoEl)}>{solicitud.completadoEl ? "Completada" : "Marcar completada"}</button></form>
      </header>
      {aviso && <p role={aviso.error ? "alert" : "status"} className={`cotizacion-aviso${aviso.error ? " error" : ""}`}>{aviso.texto}</p>}
      {sp.ia && <p role="status" className="cotizacion-aviso">La IA dejó una propuesta para revisar en esta página.</p>}
      {(leyendo || cotizando.size > 0) && <ActualizarMientrasLee />}
      <nav aria-label="Secciones de la solicitud" className="pestanas">
        {TABS.map(([valor, etiqueta]) => <Link key={valor} href={`/agentes/cotizacion/${id}?tab=${valor}`} className="pestana" aria-current={tab === valor ? "page" : undefined}>{etiqueta}</Link>)}
      </nav>

      <div className="cotizacion-detalle-cuerpo">
        <section className="cotizacion-detalle-principal">
          {tab === "contactos" && <section className="tarjeta cotizacion-ajuste-seccion">
            <div className="cotizacion-comparativa-cabecera">
              <div><h2>Contactos de las aseguradoras</h2>
                {autorizada
                  ? <p>Aprobaste la solicitud: el agente cotiza solo con las compañías conectadas. Los correos siguen esperando tu aprobación, uno por uno.</p>
                  : <p>Al aprobar la solicitud, el agente pide la cotización por conexión directa o portal a las compañías conectadas. Con las demás queda el correo para aprobar.</p>}
              </div>
              <div className="cotizacion-botones-borrador">
                {!autorizada && !cerrada && porCotizar > 0 && <form action={aprobarYCotizarSolicitud}><input type="hidden" name="solicitudId" value={id} /><button className="boton boton-primario">Aprobar y cotizar</button></form>}
                <BotonCopiar texto={textoTabulado(tablaContactos(envios, ctx))} etiqueta="Copiar" />
                <Link className="boton" href={`/agentes/cotizacion/exportar/${id}?vista=contactos&formato=xlsx`}>Excel</Link>
              </div>
            </div>
            <div className="tabla-scroll"><table className="tabla cotizacion-tabla-contactos"><thead><tr><th>Aseguradora</th><th>Estado</th><th>Borrador</th><th>Folio</th><th>Paquete</th><th>Próximo seguimiento</th><th>Seguimientos</th><th>Preguntas</th><th>Última actividad</th></tr></thead><tbody>
              {envios.map((envio) => {
                const visible = estadoContacto(envio, ctx);
                const dato = cerrada ? null : datoPedido(envio);
                return <tr key={envio.id}>
                  <td>{envio.compania}</td>
                  <td>{visible.texto}{visible.detalle && <small><br />{visible.detalle}</small>}
                    {dato && <form action={responderDatoCotizacion} className="cotizacion-dato"><input type="hidden" name="envioId" value={envio.id} /><input type="hidden" name="solicitudId" value={id} /><label>Tu respuesta para {envio.compania}<input name="respuesta" required maxLength={200} /></label><button className="boton boton-primario">Responder y volver a cotizar</button></form>}
                  </td>
                  <td>{cotizando.has(envio.id) ? <span className="texto-suave">{borradorVisible(envio, ctx)}</span>
                    : envio.estadoBorrador === "pendiente" ? <div className="cotizacion-botones-borrador"><form action={aprobarEnvioCotizacion}><input type="hidden" name="envioId" value={envio.id} /><input type="hidden" name="volverDetalle" value="on" /><button className="boton boton-primario">Aprobar</button></form><form action={omitirBorradorCotizacion}><input type="hidden" name="envioId" value={envio.id} /><input type="hidden" name="volverDetalle" value="on" /><button className="boton">Omitir</button></form>{estadoIA.habilitada && <form action={redactarCorreoConIA}><input type="hidden" name="envioId" value={envio.id} /><button className="boton">Mejorar con IA</button></form>}</div>
                    : envio.estadoBorrador === "aprobado" && sinEnviar.has(envio.id) ? <div className="cotizacion-botones-borrador"><span>Aprobado · sin enviar</span><form action={reenviarCorreoCotizacionAccion}><input type="hidden" name="envioId" value={envio.id} /><input type="hidden" name="volverDetalle" value="on" /><button className="boton">Enviar ahora</button></form></div>
                    : borradorVisible(envio, ctx)}</td>
                  <td>{envio.folio ?? envio.numeroCompania ?? "—"}</td><td>{nombrePaqueteDe(envio, ctx)}</td>
                  <td>{textoProximo(proximoSeguimiento(envio, ctx))}</td>
                  <td>{envio.cantidadSeguimientos} de {maximoSeguimientos}</td>
                  <td>{envio.preguntasPendientes ?? "—"}</td>
                  <td>{diaYHora(envio.ultimaActividad)}</td>
                </tr>;
              })}
            </tbody></table></div>
            {process.env.NODE_ENV !== "production" && solicitud.esEjemplo && <div className="cotizacion-ajuste-seccion"><h3>Simulador de respuestas (solo ejemplos)</h3>{envios.map((envio) => <form key={`simular-${envio.id}`} action={simularRespuestaCotizacion} className="cotizacion-botones-borrador"><input type="hidden" name="envioId" value={envio.id} /><label>Respuesta para {envio.compania}<select name="escenario"><option value="cotizado">Cotizado</option><option value="pregunta">Pregunta</option><option value="rechazado">Rechazo</option><option value="error">Error de portal</option></select></label><button className="boton">Simular</button></form>)}</div>}
          </section>}

          {tab === "cotizaciones" && <section className="tarjeta cotizacion-ajuste-seccion">
            <div className="cotizacion-comparativa-cabecera"><div><h2>Comparativa</h2><p>Las respuestas que cargás a mano quedan confirmadas. Las que lee la IA o manda la compañía por conexión directa o portal cuentan recién cuando las confirmás.</p></div><div className="cotizacion-botones-borrador"><Link className="boton" href={`/agentes/cotizacion/exportar/${id}`}>Descargar CSV</Link><Link className="boton" href={`/agentes/cotizacion/exportar/${id}?formato=xlsx`}>Descargar Excel</Link><Link className="boton" href={`/agentes/cotizacion/exportar/${id}?formato=pdf`}>Descargar PDF</Link></div></div>
            <nav aria-label="Vista del comparativo" className="cotizacion-vistas">
              {(["compacta", "detallada"] as const).map((opcion) => <Link key={opcion} href={`/agentes/cotizacion/${id}?tab=cotizaciones&vista=${opcion}`} aria-current={vista === opcion ? "page" : undefined}>{opcion === "compacta" ? "Compacta" : "Detallada"}</Link>)}
              <span className="texto-suave">{vista === "compacta" ? "Precio, prima neta y franquicia." : "Todas las filas: gastos, impuestos, límite, vigencia y coberturas."}</span>
            </nav>
            <div className="tabla-scroll"><table className="tabla cotizacion-comparativo"><thead><tr><th>Concepto</th>{envios.map((envio) => <th key={envio.id}>{envio.compania}{mejorId === envio.id && <span className="cotizacion-mejor-precio">Mejor precio</span>}</th>)}</tr></thead><tbody>
              <tr className="cotizacion-fila-precio"><th>Prima total</th>{envios.map((envio) => {
                const resultado = resultadoPorEnvio.get(envio.id);
                return <td key={envio.id} className={mejorId === envio.id ? "cotizacion-celda-mejor" : undefined}>{resultado ? <>{precioComparativo(resultado)}{!resultado.confirmado && <small> · falta tu confirmación</small>}</> : "Pendiente"}</td>;
              })}</tr>
              <tr><th>Tu revisión</th>{envios.map((envio) => {
                const resultado = resultadoPorEnvio.get(envio.id);
                if (!resultado) return <td key={envio.id}>—</td>;
                if (resultado.confirmado) return <td key={envio.id}>Confirmada</td>;
                return <td key={envio.id}><form action={confirmarResultadoCotizacionAccion}><input type="hidden" name="resultadoId" value={resultado.id} /><input type="hidden" name="solicitudId" value={id} /><button className="boton boton-primario" aria-label={`Confirmar la respuesta de ${envio.compania}`}>Confirmar</button></form></td>;
              })}</tr>
              {filasComparativo(envios.map((envio) => resultadoPorEnvio.get(envio.id)), vista).map((fila) => (
                <tr key={fila.id}><th>{fila.etiqueta}</th>{fila.celdas.map((celda, indice) => <td key={envios[indice].id}>{celda ?? "—"}</td>)}</tr>
              ))}
            </tbody></table></div>
            {mejorId === null && resultados.length > 0 && <p className="texto-suave">“Mejor precio” aparece cuando confirmás al menos una respuesta.</p>}
            <h3>Cargar una cotización recibida</h3>
            {envios.map((envio) => {
              const actual = resultadoPorEnvio.get(envio.id);
              const manuales = coberturasManuales(actual?.coberturas ?? []);
              return <section key={`resultado-${envio.id}`} className="cotizacion-resultado-manual">
                <h4>{envio.compania}</h4>
                <form action={cargarResultadoCotizacion} className="cotizacion-ajuste-form">
                  <input type="hidden" name="solicitudId" value={id} /><input type="hidden" name="compania" value={envio.compania} /><input type="hidden" name="volverDetalle" value="on" />
                  <label>Prima neta<input name="primaNeta" type="number" min="0" step="0.01" defaultValue={actual?.primaNeta ?? ""} /></label>
                  <label>Prima total<input name="precio" type="number" min="0.01" step="0.01" required defaultValue={actual?.primaTotal ?? ""} /></label>
                  <label>Gastos<input name="gastos" type="number" min="0" step="0.01" defaultValue={actual?.gastos ?? 0} /></label>
                  <label>Impuestos<input name="impuestos" type="number" min="0" step="0.01" defaultValue={actual?.impuestos ?? 0} /></label>
                  <label>Franquicia<input name="franquicia" defaultValue={actual?.franquicia ?? ""} /></label>
                  <label>Suma asegurada<input name="sumaAsegurada" type="number" min="0" step="0.01" defaultValue={actual?.sumaAsegurada ?? ""} /></label>
                  <label>CUIT/CUIL cotizado<input name="cuitCuilCotizado" defaultValue={actual?.riesgoCotizado.cuitCuil ?? ""} /></label>
                  <label>Marca cotizada<input name="marcaCotizado" defaultValue={actual?.riesgoCotizado.marca ?? ""} /></label>
                  <label>Modelo cotizado<input name="modeloCotizado" defaultValue={actual?.riesgoCotizado.modelo ?? ""} /></label>
                  <label>Año cotizado<input name="anioCotizado" defaultValue={actual?.riesgoCotizado.anio ?? ""} /></label>
                  <label>Código postal cotizado<input name="codigoPostalCotizado" defaultValue={actual?.riesgoCotizado.codigoPostal ?? ""} /></label>
                  <label>Vigencia<input name="vigencia" defaultValue={actual?.vigencia ?? ""} /></label>
                  <label>Condiciones<textarea name="condiciones" rows={2} defaultValue={actual?.condiciones ?? ""} /></label>
                  {FILAS_COBERTURA.map((fila) => <label key={fila.id}>{fila.etiqueta}<input name={`cobertura_${fila.id}`} maxLength={200} defaultValue={manuales[fila.id]} placeholder={fila.id === "servicios" ? "Ej.: grúa 300 km, auto sustituto" : "Ej.: incluida, hasta $ 300.000"} /></label>)}
                  <label>Observación<textarea name="observacion" rows={2} defaultValue={solicitud.cotizaciones.find((cotizacion) => cotizacion.compania === envio.compania)?.observacion ?? ""} /></label>
                  <button className="boton boton-primario">Guardar y confirmar</button>
                </form>
                <form action={cargarArchivoCotizacion} className="cotizacion-ajuste-form"><input type="hidden" name="solicitudId" value={id} /><input type="hidden" name="envioId" value={envio.id} /><label>Adjuntar PDF recibido<input type="file" name="archivo" accept=".pdf" required /></label><button className="boton">Guardar PDF</button></form>
              </section>;
            })}
            <div className="cotizacion-botones-borrador">
              <form action={generarPropuestaCotizacion}><input type="hidden" name="solicitudId" value={id} /><button className="boton boton-primario">Generar propuesta PDF</button></form>
              <span className="texto-suave">{!marca?.logo ? <>Sin logo: cargalo en <Link href="/configuracion?tab=equipo">Mi equipo</Link> (PNG o JPG) para que salga en la propuesta.</> : marca.logo.startsWith("data:image/webp") ? <>Tu logo está en WebP: para que salga en la propuesta, subilo en PNG o JPG en <Link href="/configuracion?tab=equipo">Mi equipo</Link>.</> : "Va con el logo de Mi equipo y los datos de Mi cuenta."}</span>
            </div>
            <p className="texto-suave">La propuesta incluye respuestas confirmadas y queda guardada como borrador. La aprobación habilita su descarga; compartirla queda a tu cargo.</p>
            {propuestas.map((propuesta) => <article key={propuesta.id} className="cotizacion-propuesta"><strong>{propuesta.nombre}</strong><span>{propuesta.estado === "aprobada" ? "Aprobada" : "Borrador · requiere aprobación"}</span><div className="cotizacion-botones-borrador"><Link className="boton" href={`/agentes/cotizacion/propuestas/${propuesta.id}`} aria-disabled={propuesta.estado !== "aprobada"}>Descargar PDF</Link>{propuesta.estado === "borrador" && <form action={aprobarPropuestaCotizacion}><input type="hidden" name="propuestaId" value={propuesta.id} /><button className="boton boton-primario">Aprobar propuesta</button></form>}</div></article>)}
            {pdfsDeCompanias.filter((archivo) => estadoIA.habilitada || lecturas.has(archivo.id)).map((archivo) => {
              const lectura = lecturas.get(archivo.id);
              const enCurso = lectura?.estado === "pendiente" || lectura?.estado === "procesando";
              const compania = envios.find((envio) => envio.id === archivo.envioId)?.compania;
              return <div key={`leer-${archivo.id}`} className="cotizacion-botones-borrador">
                <span>{archivo.nombre}{compania ? ` · ${compania}` : ""}</span>
                {enCurso ? <span role="status">La IA está leyendo el PDF…</span> : <>
                  {lectura?.estado === "error" && <span className="texto-suave">{lectura.error}</span>}
                  {estadoIA.habilitada && <form action={extraerPdfConIA}><input type="hidden" name="archivoId" value={archivo.id} /><input type="hidden" name="solicitudId" value={id} /><button className="boton">{lectura ? "Volver a leer con IA" : "Leer con IA"}</button></form>}
                </>}
              </div>;
            })}
          </section>}

          {tab === "validacion" && <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Validación del pedido</h2><p>Datos del riesgo enviados a cotizar:</p>
            <dl className="cotizacion-datos-riesgo">{Object.entries(solicitud.datosRiesgo).map(([campo, valor]) => <div key={campo}><dt>{etiquetaRiesgo(campo)}</dt><dd>{String(valor ?? "—")}</dd></div>)}</dl>
            <h3>Comparación automática</h3>
            {resultados.map((resultado) => {
              const envio = envios.find((item) => item.id === resultado.envioId);
              const controles = validarCotizacionContraSolicitud(solicitud.datosRiesgo, resultado);
              return <section key={`validacion-${resultado.id}`} className="cotizacion-validacion-resultado">
                <h4>{envio?.compania ?? "Aseguradora"}</h4>
                {controles.length ? <ul>{controles.map((control) => <li key={control.campo} className={`cotizacion-validacion-${control.estado}`}><strong>{control.campo}: {control.estado === "coincide" ? "coincide" : control.estado === "diferencia" ? "revisar diferencia" : "sin dato en la respuesta"}</strong><span>Pedido: {control.esperado}{control.recibido ? ` · Cotizado: ${control.recibido}` : ""}</span></li>)}</ul> : <p>No hay campos del pedido que se puedan comparar con esta respuesta.</p>}
              </section>;
            })}
          </section>}

          {tab === "agente" && <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Pasos de la solicitud</h2>
            <ol className="cotizacion-pasos" aria-label="Línea de tiempo de la solicitud">
              {pasosDeLaSolicitud({ solicitud, envios, eventos, propuestas, ctx }).map((paso) => (
                <li key={paso.titulo} className={`cotizacion-paso-${paso.estado}`}>
                  <span className="cotizacion-paso-marca" aria-hidden="true">{paso.estado === "hecho" ? "✓" : paso.estado === "en_curso" ? "…" : ""}</span>
                  <div>
                    <strong>{paso.titulo}</strong> <span className="cotizacion-paso-estado">{ESTADO_PASO[paso.estado]}</span>
                    <p>{paso.detalle}</p>
                    {paso.fecha && <time>{diaYHora(paso.fecha)}</time>}
                  </div>
                </li>
              ))}
            </ol>

            <h3>Borradores para aprobar</h3>
            {pendientesDeAprobar.length ? pendientesDeAprobar.map((envio) => (
              <details key={`borrador-${envio.id}`} className="cotizacion-borrador-correo">
                <summary><strong>Correo a {envio.compania}</strong> · {envio.asuntoBorrador}</summary>
                <pre>{envio.cuerpoBorrador}</pre>
                <div className="cotizacion-botones-borrador">
                  <form action={aprobarEnvioCotizacion}><input type="hidden" name="envioId" value={envio.id} /><input type="hidden" name="volverDetalle" value="on" /><input type="hidden" name="volverTab" value="agente" /><button className="boton boton-primario" aria-label={`Aprobar el correo a ${envio.compania}`}>Aprobar</button></form>
                  <form action={omitirBorradorCotizacion}><input type="hidden" name="envioId" value={envio.id} /><input type="hidden" name="volverDetalle" value="on" /><input type="hidden" name="volverTab" value="agente" /><button className="boton" aria-label={`Omitir el correo a ${envio.compania}`}>Omitir</button></form>
                </div>
              </details>
            )) : <p className="texto-suave">No hay correos a las compañías esperando tu aprobación.</p>}

            {ejecutivo && <section className="cotizacion-ejecutivo" aria-labelledby="cotizacion-ejecutivo-titulo">
              <h3 id="cotizacion-ejecutivo-titulo">Correo al ejecutivo</h3>
              <p className="texto-suave">El resumen de la solicitud, armado con lo que hay ahora. Va a tu correo de Mi cuenta y sale recién cuando lo aprobás.</p>
              <dl className="cotizacion-ejecutivo-datos">
                <div><dt>Para</dt><dd>{ejecutivo.para ?? <>Falta tu correo: cargalo en <Link href="/configuracion?tab=cuenta">Mi cuenta</Link>.</>}</dd></div>
                <div><dt>Asunto</dt><dd>{ejecutivo.asunto}</dd></div>
              </dl>
              <pre>{ejecutivo.cuerpo}</pre>
              <div className="cotizacion-botones-borrador">
                <form action={aprobarResumenEjecutivoAccion}><input type="hidden" name="solicitudId" value={id} /><input type="hidden" name="huella" value={ejecutivo.huella} /><button className="boton boton-primario">Aprobar y enviar el resumen</button></form>
                <BotonCopiar texto={`${ejecutivo.asunto}\n\n${ejecutivo.cuerpo}`} etiqueta="Copiar el resumen" />
              </div>
              {ultimoResumen && <div role={ultimoResumen.estado === "aprobado" ? "alert" : undefined} className={ultimoResumen.estado === "aprobado" ? "cotizacion-ejecutivo-ultimo error" : "cotizacion-ejecutivo-ultimo"}>
                <span>{ultimoResumen.estado === "enviado" && ultimoResumen.enviadoEl
                  ? <>El último resumen salió el {diaYHora(ultimoResumen.enviadoEl)}.</>
                  : <>El resumen que aprobaste el {diaYHora(ultimoResumen.creadoEl)} no salió: {ultimoResumen.destinatario ? "tu correo no está conectado (conectalo en Configuración → Conexiones)" : "falta tu correo en Mi cuenta"}. Después tocá “Enviar ahora”.</>}</span>
                {ultimoResumen.estado === "aprobado" && <form action={reenviarResumenEjecutivoAccion}><input type="hidden" name="solicitudId" value={id} /><button className="boton">Enviar ahora</button></form>}
              </div>}
            </section>}

            <h3>Actividad del agente</h3><ol className="cotizacion-eventos">{eventos.map((evento) => <li key={evento.id}><strong>{nombreEvento(evento.tipo)}</strong><span>{evento.detalle}</span><time>{diaYHora(evento.fecha)}</time></li>)}</ol>
            {estadoIA.habilitada ? <><h3>Escribile al agente</h3><form action={chatearCotizacionIA} className="cotizacion-ajuste-form"><input type="hidden" name="solicitudId" value={id} /><label>¿Qué necesitás revisar?<textarea name="mensaje" rows={3} maxLength={3000} required placeholder="Resumime qué falta para comparar estas coberturas…" /></label><button className="boton boton-primario">Preguntar al agente</button></form></> : <p className="texto-suave">{estadoIA.motivo === "sin_cuota" ? "El chat vuelve el mes que viene: se llegó al tope de gasto de IA de este mes." : "El chat aparece cuando activás la IA en la Configuración de Cotización."}</p>}
            {borradoresIA.map((borrador) => <article key={borrador.id} className="cotizacion-borrador-ia"><h3>{borrador.tipo === "chat" ? "Respuesta del agente" : borrador.tipo === "correo" ? "Correo propuesto por IA" : "Lo que leyó la IA de un PDF"} · Borrador</h3><pre>{borrador.contenido}</pre><small>Costo estimado: US$ {borrador.costoUsd.toFixed(4)}</small></article>)}
            <h3>Adjuntar ficha, correo o cotización</h3>
            <form action={cargarArchivoCotizacion} className="cotizacion-ajuste-form"><input type="hidden" name="solicitudId" value={id} /><label>Archivo<input type="file" name="archivo" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" required /></label><button className="boton">Guardar archivo</button></form>
            <p className="texto-suave">PDF, Word, Excel o imágenes · hasta 25 MB.</p>
          </section>}
        </section>

        <aside className="cotizacion-detalle-lateral">
          <section className="tarjeta cotizacion-ajuste-seccion" aria-labelledby="panel-estado">
            <h2 id="panel-estado">Estado</h2>
            <strong>{porcentaje} % completado · {envios.length === 1 ? "1 aseguradora" : `${envios.length} aseguradoras`}</strong>
            <span className="cotizacion-progreso" aria-hidden="true"><span style={{ width: `${porcentaje}%` }} /></span>
            <p>{solicitud.nota ?? "Sin novedades"}</p>
            {atencion.length > 0 && <div className="cotizacion-atencion">
              <h3>Requiere atención</h3>
              <ul>{atencion.map((item) => <li key={`${item.compania ?? "todas"}-${item.motivo}`}>
                {item.compania && <strong>{item.compania}: </strong>}{item.motivo}{" "}
                <Link href={`/agentes/cotizacion/${id}?tab=${item.pestana}`}>{item.pestana === "cotizaciones" ? "Revisar" : "Ver"}</Link>
              </li>)}</ul>
            </div>}
          </section>
          <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Persona del agente</h2>
            <p><strong>{config?.nombreAgente ?? "Verónica"}</strong>{config && config.persona !== config.nombreAgente ? ` · ${config.persona}` : ""}</p>
            <p className="texto-suave">{config?.personalidad || "Profesional, cortés y meticulosa."} Firma los borradores; ninguno sale sin tu aprobación.</p>
          </section>
          <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Seguimientos activos</h2>
            {seguimientos.length ? <ul className="cotizacion-lista-panel">{seguimientos.map((item) => <li key={item.compania}>
              <strong>{item.compania}</strong>
              <span>{item.proximo.tipo === "consulta" ? `Consulta a la compañía: ${textoProximo(item.proximo).split(" · ")[0]}` : `Próximo: ${textoProximo(item.proximo)} · ${item.cantidad} de ${item.maximo} seguimientos`}</span>
            </li>)}</ul> : <p className="texto-suave">No hay seguimientos programados.</p>}
          </section>
          <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Archivos</h2>
            {gruposArchivos.length ? gruposArchivos.map((grupo) => <div key={grupo.titulo} className="cotizacion-grupo-archivos">
              <h3>{grupo.titulo}</h3>
              {grupo.archivos.map((archivo) => <p key={archivo.id}><Link href={`/agentes/cotizacion/archivos/${archivo.id}`}>{archivo.nombre}</Link> · {(archivo.tamano / 1024 / 1024).toFixed(1)} MB</p>)}
            </div>) : <p>Sin archivos adjuntos.</p>}
          </section>
          <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Actividad reciente</h2>
            {eventos.length ? <>
              <ul className="cotizacion-lista-panel">{eventos.slice(0, ACTIVIDAD_VISIBLE).map((evento) => <li key={evento.id}><strong>{nombreEvento(evento.tipo)}</strong><span>{diaYHora(evento.fecha)}</span></li>)}</ul>
              {eventos.length > ACTIVIDAD_VISIBLE && <details className="cotizacion-mostrar-mas">
                <summary>Mostrar más ({eventos.length - ACTIVIDAD_VISIBLE})</summary>
                <ul className="cotizacion-lista-panel">{eventos.slice(ACTIVIDAD_VISIBLE).map((evento) => <li key={evento.id}><strong>{nombreEvento(evento.tipo)}</strong><span>{diaYHora(evento.fecha)}</span></li>)}</ul>
              </details>}
            </> : <p className="texto-suave">Todavía no hay actividad.</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
