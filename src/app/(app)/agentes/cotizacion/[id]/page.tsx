import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerDetalleCotizacion } from "@/lib/datos-agentes";
import { pesos } from "@/lib/formato";
import { mejorResultadoConfirmado, porcentajeCerrados, validarCotizacionContraSolicitud } from "@/lib/cotizacion";
import { estadoIACotizacion, lecturasDePdfs, obtenerBorradoresIA } from "@/agentes/cotizacion/ia";
import { aprobarEnvioCotizacion, aprobarPropuestaCotizacion, cargarArchivoCotizacion, cargarResultadoCotizacion, confirmarResultadoCotizacionAccion, generarPropuestaCotizacion, marcarSolicitudCompletada, omitirBorradorCotizacion, simularRespuestaCotizacion, chatearCotizacionIA, redactarCorreoConIA, extraerPdfConIA } from "../actions";
import { ActualizarMientrasLee } from "./ActualizarMientrasLee";
import "../../agentes.css";

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
};

export default async function DetalleCotizacion({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; aviso?: string; ia?: string }>;
}) {
  const [{ id: textoId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(textoId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detalle = await obtenerDetalleCotizacion(id);
  if (!detalle) notFound();
  const { solicitud, asegurado, lead, envios, archivos, propuestas, eventos, resultados, paquetes } = detalle;
  const pdfsDeCompanias = archivos.filter((archivo) => archivo.mime === "application/pdf" && archivo.envioId);
  const [estadoIA, borradoresIA, lecturas] = await Promise.all([estadoIACotizacion(), obtenerBorradoresIA(id), lecturasDePdfs(pdfsDeCompanias.map((archivo) => archivo.id))]);
  const leyendo = [...lecturas.values()].some((lectura) => lectura.estado === "pendiente" || lectura.estado === "procesando");
  const cliente = asegurado?.nombre ?? lead?.empresa ?? solicitud.cliente;
  const tab = TABS.some(([valor]) => valor === sp.tab) ? sp.tab! : "contactos";
  const nombrePaquete = new Map(paquetes.map((paquete) => [paquete.id, paquete.nombre]));
  const mejor = mejorResultadoConfirmado(resultados);
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
      <nav aria-label="Secciones de la solicitud" className="pestanas">
        {TABS.map(([valor, etiqueta]) => <Link key={valor} href={`/agentes/cotizacion/${id}?tab=${valor}`} className="pestana" aria-current={tab === valor ? "page" : undefined}>{etiqueta}</Link>)}
      </nav>

      <div className="cotizacion-detalle-cuerpo">
        <section className="cotizacion-detalle-principal">
          {tab === "contactos" && <section className="tarjeta cotizacion-ajuste-seccion">
            <h2>Contactos de las aseguradoras</h2>
            <div className="tabla-scroll"><table className="tabla"><thead><tr><th>Aseguradora</th><th>Paquete</th><th>Folio</th><th>Estado</th><th>Seguimientos</th><th>Última actividad</th><th>Borrador</th></tr></thead><tbody>
              {envios.map((envio) => <tr key={envio.id}>
                <td>{envio.compania}</td><td>{envio.paqueteId == null ? "Sin paquete" : nombrePaquete.get(envio.paqueteId) ?? "Sin paquete"}</td><td>{envio.folio ?? "—"}</td><td>{envio.estado.replaceAll("_", " ")}{envio.preguntasPendientes && <small><br />{envio.preguntasPendientes}</small>}</td><td>{envio.cantidadSeguimientos}</td><td>{envio.ultimaActividad.toLocaleString("es-AR")}</td>
                <td>{envio.estadoBorrador === "pendiente" ? <div className="cotizacion-botones-borrador"><form action={aprobarEnvioCotizacion}><input type="hidden" name="envioId" value={envio.id} /><button className="boton boton-primario">Aprobar</button></form><form action={omitirBorradorCotizacion}><input type="hidden" name="envioId" value={envio.id} /><button className="boton">Omitir</button></form>{estadoIA.habilitada && <form action={redactarCorreoConIA}><input type="hidden" name="envioId" value={envio.id} /><button className="boton">Mejorar con IA</button></form>}</div> : envio.estadoBorrador === "aprobado" ? "Aprobado · simulado" : "Omitido"}</td>
              </tr>)}
            </tbody></table></div>
            {process.env.NODE_ENV !== "production" && solicitud.esEjemplo && <div className="cotizacion-ajuste-seccion"><h3>Simulador de respuestas (solo ejemplos)</h3>{envios.map((envio) => <form key={`simular-${envio.id}`} action={simularRespuestaCotizacion} className="cotizacion-botones-borrador"><input type="hidden" name="envioId" value={envio.id} /><label>Respuesta para {envio.compania}<select name="escenario"><option value="cotizado">Cotizado</option><option value="pregunta">Pregunta</option><option value="rechazado">Rechazo</option><option value="error">Error de portal</option></select></label><button className="boton">Simular</button></form>)}</div>}
          </section>}

          {tab === "cotizaciones" && <section className="tarjeta cotizacion-ajuste-seccion">
            <div className="cotizacion-comparativa-cabecera"><div><h2>Comparativa</h2><p>Las respuestas que cargás a mano quedan confirmadas. Las que lee la IA cuentan recién cuando las confirmás.</p></div><div className="cotizacion-botones-borrador"><Link className="boton" href={`/agentes/cotizacion/exportar/${id}`}>Descargar CSV</Link><Link className="boton" href={`/agentes/cotizacion/exportar/${id}?formato=xlsx`}>Descargar Excel</Link><Link className="boton" href={`/agentes/cotizacion/exportar/${id}?formato=pdf`}>Descargar PDF</Link></div></div>
            <div className="tabla-scroll"><table className="tabla"><thead><tr><th>Concepto</th>{envios.map((envio) => <th key={envio.id}>{envio.compania}{mejor?.envioId === envio.id && <span className="cotizacion-mejor-precio">Mejor precio</span>}</th>)}</tr></thead><tbody>
              <tr><th>Prima neta</th>{envios.map((envio) => <td key={envio.id}>{resultadoPorEnvio.get(envio.id)?.primaNeta != null ? pesos(resultadoPorEnvio.get(envio.id)!.primaNeta!) : "—"}</td>)}</tr>
              <tr><th>Prima total</th>{envios.map((envio) => <td key={envio.id}>{resultadoPorEnvio.has(envio.id) ? <>{pesos(resultadoPorEnvio.get(envio.id)!.primaTotal)}{!resultadoPorEnvio.get(envio.id)!.confirmado && <small> · falta tu confirmación</small>}</> : "Pendiente"}</td>)}</tr>
              <tr><th>Tu revisión</th>{envios.map((envio) => {
                const resultado = resultadoPorEnvio.get(envio.id);
                if (!resultado) return <td key={envio.id}>—</td>;
                if (resultado.confirmado) return <td key={envio.id}>Confirmada</td>;
                return <td key={envio.id}><form action={confirmarResultadoCotizacionAccion}><input type="hidden" name="resultadoId" value={resultado.id} /><input type="hidden" name="solicitudId" value={id} /><button className="boton boton-primario" aria-label={`Confirmar la respuesta de ${envio.compania}`}>Confirmar</button></form></td>;
              })}</tr>
              <tr><th>Franquicia</th>{envios.map((envio) => <td key={envio.id}>{resultadoPorEnvio.get(envio.id)?.franquicia ?? "—"}</td>)}</tr>
              <tr><th>Suma asegurada</th>{envios.map((envio) => <td key={envio.id}>{resultadoPorEnvio.get(envio.id)?.sumaAsegurada != null ? pesos(resultadoPorEnvio.get(envio.id)!.sumaAsegurada!) : "—"}</td>)}</tr>
              <tr><th>Condiciones</th>{envios.map((envio) => <td key={envio.id}>{resultadoPorEnvio.get(envio.id)?.condiciones ?? "—"}</td>)}</tr>
              <tr><th>Coberturas</th>{envios.map((envio) => <td key={envio.id}>{resultadoPorEnvio.get(envio.id)?.coberturas.map((c) => `${c.nombre}${c.valor ? `: ${c.valor}` : ""}`).join(", ") || "—"}</td>)}</tr>
            </tbody></table></div>
            <h3>Cargar una cotización recibida</h3>
            {envios.map((envio) => {
              const actual = resultadoPorEnvio.get(envio.id);
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
                  <label>Observación<textarea name="observacion" rows={2} defaultValue={solicitud.cotizaciones.find((cotizacion) => cotizacion.compania === envio.compania)?.observacion ?? ""} /></label>
                  <button className="boton boton-primario">Guardar y confirmar</button>
                </form>
                <form action={cargarArchivoCotizacion} className="cotizacion-ajuste-form"><input type="hidden" name="solicitudId" value={id} /><input type="hidden" name="envioId" value={envio.id} /><label>Adjuntar PDF recibido<input type="file" name="archivo" accept=".pdf" required /></label><button className="boton">Guardar PDF</button></form>
              </section>;
            })}
            <form action={generarPropuestaCotizacion}><input type="hidden" name="solicitudId" value={id} /><button className="boton boton-primario">Generar propuesta PDF</button></form>
            <p className="texto-suave">La propuesta incluye respuestas confirmadas y queda guardada como borrador. La aprobación habilita su descarga; compartirla queda a tu cargo.</p>
            {propuestas.map((propuesta) => <article key={propuesta.id} className="cotizacion-propuesta"><strong>{propuesta.nombre}</strong><span>{propuesta.estado === "aprobada" ? "Aprobada" : "Borrador · requiere aprobación"}</span><div className="cotizacion-botones-borrador"><Link className="boton" href={`/agentes/cotizacion/propuestas/${propuesta.id}`} aria-disabled={propuesta.estado !== "aprobada"}>Descargar PDF</Link>{propuesta.estado === "borrador" && <form action={aprobarPropuestaCotizacion}><input type="hidden" name="propuestaId" value={propuesta.id} /><button className="boton boton-primario">Aprobar propuesta</button></form>}</div></article>)}
            {leyendo && <ActualizarMientrasLee />}
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
            <dl className="cotizacion-datos-riesgo">{Object.entries(solicitud.datosRiesgo).map(([campo, valor]) => <div key={campo}><dt>{campo}</dt><dd>{String(valor ?? "—")}</dd></div>)}</dl>
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
            <h2>Actividad del agente</h2><ol className="cotizacion-eventos">{eventos.map((evento) => <li key={evento.id}><strong>{evento.tipo.replaceAll("_", " ")}</strong><span>{evento.detalle}</span><time>{evento.fecha.toLocaleString("es-AR")}</time></li>)}</ol>
            {estadoIA.habilitada ? <><h3>Escribile al agente</h3><form action={chatearCotizacionIA} className="cotizacion-ajuste-form"><input type="hidden" name="solicitudId" value={id} /><label>¿Qué necesitás revisar?<textarea name="mensaje" rows={3} maxLength={3000} required placeholder="Resumime qué falta para comparar estas coberturas…" /></label><button className="boton boton-primario">Preguntar al agente</button></form></> : <p className="texto-suave">{estadoIA.motivo === "sin_cuota" ? "El chat vuelve el mes que viene: se llegó al tope de gasto de IA de este mes." : "El chat aparece cuando activás la IA en la Configuración de Cotización."}</p>}
            {borradoresIA.map((borrador) => <article key={borrador.id} className="cotizacion-borrador-ia"><h3>{borrador.tipo === "chat" ? "Respuesta del agente" : borrador.tipo === "correo" ? "Correo propuesto por IA" : "Lo que leyó la IA de un PDF"} · Borrador</h3><pre>{borrador.contenido}</pre><small>Costo estimado: US$ {borrador.costoUsd.toFixed(4)}</small></article>)}
            <h3>Adjuntar ficha, correo o cotización</h3>
            <form action={cargarArchivoCotizacion} className="cotizacion-ajuste-form"><input type="hidden" name="solicitudId" value={id} /><label>Archivo<input type="file" name="archivo" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" required /></label><button className="boton">Guardar archivo</button></form>
            <p className="texto-suave">PDF, Word, Excel o imágenes · hasta 25 MB.</p>
          </section>}
        </section>

        <aside className="cotizacion-detalle-lateral">
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Estado</h2><strong>{porcentajeCerrados(envios)} % completado · {envios.length} aseguradoras</strong><p>{solicitud.nota ?? "Sin novedades"}</p></section>
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Persona del agente</h2><p>Verónica · borradores a la espera de tu aprobación</p></section>
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Archivos</h2>{archivos.length ? archivos.map((archivo) => <p key={archivo.id}><Link href={`/agentes/cotizacion/archivos/${archivo.id}`}>{archivo.nombre}</Link> · {(archivo.tamano / 1024 / 1024).toFixed(1)} MB</p>) : <p>Sin archivos adjuntos.</p>}</section>
          <section className="tarjeta cotizacion-ajuste-seccion"><h2>Actividad reciente</h2>{eventos.slice(0, 6).map((evento) => <p key={evento.id}><strong>{evento.tipo.replaceAll("_", " ")}</strong><br />{evento.fecha.toLocaleString("es-AR")}</p>)}</section>
        </aside>
      </div>
    </main>
  );
}
