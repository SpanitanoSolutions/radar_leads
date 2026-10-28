import Link from "next/link";
import { PanelLateral } from "@/components/PanelLateral";
import { EncabezadoAgente } from "@/components/agentes/Agente";
import { agenteConfigurado, obtenerAseguradosParaSiniestro, obtenerConfiguracionSiniestros, obtenerPolizasParaSiniestro, obtenerSiniestros } from "@/lib/datos-agentes";
import { diaEnArgentina, diaYMes, fechaCorta } from "@/lib/fechas";
import {
  ahoraDe,
  esNuevo,
  indiceEtapa,
  kpisSiniestros,
  nombreEtapa,
  DIAS_SIN_NOVEDADES,
  PLAZO_DENUNCIA_DIAS,
  requiereAtencion,
  textoReclamo,
  ETAPAS,
} from "@/lib/siniestros";
import {
  actualizarTramite,
  enviarDenuncia,
  enviarReclamo,
  guardarDenuncia,
  mandarRecordatorio,
  marcarDocumento,
  archivarSiniestro as archivarSiniestroAction,
  crearInformeSiniestro,
  registrarGastoSiniestro,
} from "./actions";
import { FormularioCarga as PanelFormularioCarga } from "./FormularioCarga";
import "../agentes.css";

export const instant = false;

type Registro = Awaited<ReturnType<typeof obtenerSiniestros>>[number];
type Accion = ReturnType<typeof ahoraDe>;

const PESTANAS = [
  { id: "abiertos", texto: "Abiertos" },
  { id: "cerrados", texto: "Cerrados" },
  { id: "archivados", texto: "Archivados" },
] as const;

const AVISOS: Record<string, string> = {
  "denuncia-enviada": "La denuncia se envió a la compañía.",
  "recordatorio-enviado": "El recordatorio se envió al asegurado.",
  "reclamo-enviado": "El reclamo se envió a la compañía.",
  "denuncia-guardada": "Guardaste los cambios de la denuncia.",
  "documento-recibido": "Marcaste el documento como recibido.",
  "documento-actualizado": "Actualizaste el estado del documento.",
  "tramite-actualizado": "Actualizaste el trámite.",
  "siniestro-cargado": "Cargaste el siniestro.",
  "siniestro-archivado": "Archivaste el siniestro.",
  "siniestro-restaurado": "Restauraste el siniestro.",
  "gasto-registrado": "Registraste el gasto del siniestro.",
  "informe-creado": "Creaste un borrador de informe.",
  "archivo-invalido": "Revisá el formato y el tamaño de los archivos adjuntos.",
  "sin-contacto": "No hay teléfono ni email para contactar al asegurado.",
  "sin-compania": "Seleccioná una compañía antes de enviar una denuncia o un reclamo.",
  "envio-error": "No se pudo enviar. Revisá la conexión y volvé a intentar.",
  "error-operacion": "No pudimos completar la operación por un problema inesperado. Revisá el estado antes de volver a intentarlo.",
};

function formatoFechaHora(fecha: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

function accionesPara(registro: Registro, ahora: Accion) {
  return ahora.acciones.map((accion) => {
    switch (accion) {
      case "enviarDenuncia":
        return (
          <form action={enviarDenuncia} key={accion}>
            <input type="hidden" name="id" value={registro.siniestro.id} />
            <button type="submit" className="boton boton-primario">Aprobar y enviar denuncia</button>
          </form>
        );
      case "editarDenuncia":
        return (
          <details className="siniestro-editar" key={accion}>
            <summary className="boton">Editar denuncia</summary>
            <form action={guardarDenuncia} className="siniestro-form siniestro-form-edicion">
              <input type="hidden" name="id" value={registro.siniestro.id} />
              {(registro.siniestro.denuncia ?? []).map((campo) => (
                <label key={campo.campo}>
                  <span>{campo.campo}</span>
                  <input name="campo" type="hidden" value={campo.campo} />
                  <input name="valor" type="text" defaultValue={campo.valor} maxLength={500} />
                </label>
              ))}
              <label>
                <span>Relato</span>
                <textarea name="relato" defaultValue={registro.siniestro.relato ?? ""} rows={4} maxLength={4000} />
              </label>
              <button type="submit" className="boton boton-primario">Guardar denuncia</button>
            </form>
          </details>
        );
      case "recordar":
        return (
          <form action={mandarRecordatorio} key={accion}>
            <input type="hidden" name="id" value={registro.siniestro.id} />
            <button type="submit" className="boton boton-primario">Mandar recordatorio</button>
          </form>
        );
      case "llamar": {
        const asegurado = registro.asegurado;
        const telefono = !asegurado ? null : asegurado.tipo === "empresa" ? asegurado.contactoTelefono : asegurado.telefono;
        return telefono ? <a className="boton" href={`tel:${telefono}`} key={accion}>Llamar al asegurado</a> : <span className="texto-suave" key={accion}>No hay teléfono cargado</span>;
      }
      case "enviarReclamo":
        return (
          <form action={enviarReclamo} key={accion}>
            <input type="hidden" name="id" value={registro.siniestro.id} />
            <button type="submit" className="boton boton-primario">Enviar reclamo</button>
          </form>
        );
      case "verReclamo":
        return (
          <details className="siniestro-ver-reclamo" key={accion}>
            <summary className="boton">Ver reclamo</summary>
            <pre>{textoReclamo(registro.siniestro, registro.asegurado?.nombre ?? registro.siniestro.afectado ?? "Asegurado")}</pre>
          </details>
        );
      case "cerrar":
        return (
          <details className="siniestro-editar" key={accion}>
            <summary className="boton">Cerrar siniestro</summary>
            <form action={actualizarTramite} className="siniestro-form">
              <input type="hidden" name="id" value={registro.siniestro.id} />
              <input type="hidden" name="etapa" value="pago" />
              <label>
                <span>Cómo se resolvió</span>
                <input name="resolucion" type="text" defaultValue={registro.siniestro.resolucion ?? ""} maxLength={250} required />
              </label>
              <button type="submit" name="cerrar" value="on" className="boton boton-primario">Confirmar cierre</button>
            </form>
          </details>
        );
    }
  });
}

function Detalle({ registro, ahora }: { registro: Registro; ahora: Accion }) {
  const { siniestro, poliza, asegurado, documentos, eventos, gastos, informes } = registro;
  const nombreAsegurado = asegurado?.nombre ?? siniestro.afectado ?? "Asegurado sin vincular";
  const ramo = siniestro.ramo ?? poliza?.ramo ?? "Ramo sin definir";
  const compania = siniestro.compania ?? poliza?.compania ?? "Sin compañía";
  const etapaActual = indiceEtapa(siniestro.etapa);
  const recibidos = documentos.filter((doc) => doc.recibido).length;
  const dossierCompleto = documentos.every((doc) => !doc.bloqueante || doc.recibido);

  return (
    <article className="tarjeta siniestro-detalle" aria-label="Detalle del siniestro">
      <header className="siniestro-detalle-cabecera">
        <div>
          <h2>{nombreAsegurado}</h2>
          <p>{ramo} · {siniestro.descripcion}</p>
          <p className="texto-suave">
            {compania} · Póliza {poliza?.numero ?? "sin póliza asociada"} · Siniestro {siniestro.numeroCompania ?? "sin número"}
          </p>
          <p className="texto-suave">{fechaCorta(diaEnArgentina(siniestro.fecha))} · {siniestro.lugar ?? "Lugar no informado"}</p>
        </div>
        <div className="siniestro-detalle-acciones">
          {asegurado && <Link href={`/asegurados/${asegurado.id}`} className="siniestro-ficha">Ver ficha del asegurado</Link>}
          {dossierCompleto && <Link href={`/agentes/siniestros/${siniestro.id}/dossier`} className="boton">Preparar dossier PDF</Link>}
          <form action={archivarSiniestroAction}>
            <input type="hidden" name="id" value={siniestro.id} />
            <input type="hidden" name="archivado" value={siniestro.archivado ? "false" : "true"} />
            <button type="submit" className="boton">{siniestro.archivado ? "Restaurar expediente" : "Archivar expediente"}</button>
          </form>
        </div>
      </header>

      <ol className="siniestro-etapas" aria-label="Etapas del trámite">
        {ETAPAS.map((etapa, indice) => {
          const cerrada = siniestro.cerrado || indice < etapaActual;
          const actual = !siniestro.cerrado && indice === etapaActual;
          return (
            <li key={etapa.id} aria-current={actual ? "step" : undefined}>
              <span className={`siniestro-etapa-barra${cerrada ? " hecha" : actual ? ` actual tono-${ahora.tono}` : ""}`} aria-hidden="true" />
              <span>{etapa.nombre}</span>
            </li>
          );
        })}
      </ol>

      <div className="siniestro-detalle-cuerpo">
        <section className={`siniestro-ahora tono-${ahora.tono}`} aria-labelledby="siniestro-ahora-titulo">
          <span className="siniestro-ahora-etiqueta">Ahora</span>
          <h3 id="siniestro-ahora-titulo">{ahora.titulo}</h3>
          <p>{ahora.texto}</p>
          {ahora.acciones.length > 0 && <div className="siniestro-acciones">{accionesPara(registro, ahora)}</div>}
        </section>

        {siniestro.denuncia && siniestro.denuncia.length > 0 && (
          <section className="siniestro-seccion">
            <h3>Denuncia armada por el agente</h3>
            <dl className="siniestro-denuncia">
              {siniestro.denuncia.map((campo) => (
                <div key={campo.campo}><dt>{campo.campo}</dt><dd>{campo.valor}</dd></div>
              ))}
              <div><dt>Relato</dt><dd>{siniestro.relato ?? "Sin relato cargado"}</dd></div>
            </dl>
          </section>
        )}

        {registro.archivos.length > 0 && (
          <section className="siniestro-seccion">
            <h3>Archivos del expediente <span className="texto-suave">· {registro.archivos.length}</span></h3>
            <ul className="siniestro-documentos siniestro-archivos-lista">
              {registro.archivos.map((archivo) => (
                <li key={archivo.id}>
                  <a href={`/api/agentes/siniestros/archivos/${archivo.id}`} className="siniestro-archivo-enlace">{archivo.nombre}</a>
                  <span className="siniestro-archivo-estado">
                    {archivo.estadoAnalisis === "pendiente_configuracion" ? "IA pendiente de configurar" : archivo.clasificacion ?? "Revisión manual"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="texto-suave">El análisis automático queda pendiente hasta definir proveedor, modelos y ejecución de tareas.</p>
          </section>
        )}

        <div className="siniestro-columnas">
          <section className="siniestro-seccion">
            <h3>Documentación <span className="texto-suave">· {recibidos} de {documentos.length}</span></h3>
            {documentos.length ? (
              <ul className="siniestro-documentos">
                {documentos.map((doc) => (
                  <li key={doc.id}>
                    <form action={marcarDocumento}>
                      <input type="hidden" name="siniestroId" value={siniestro.id} />
                      <input type="hidden" name="documentoId" value={doc.id} />
                      <input type="hidden" name="recibido" value={doc.recibido ? "false" : "true"} />
                      <button type="submit" className={`siniestro-doc-estado${doc.recibido ? " recibido" : " faltante"}`} aria-label={`${doc.recibido ? "Marcar como faltante" : "Marcar como recibido"}: ${doc.nombre}`}>
                        {doc.recibido ? "✓" : "!"}
                      </button>
                    </form>
                    <span>{doc.nombre}{doc.cantidad ? ` (${doc.cantidad})` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="texto-suave">Todavía no hay documentos cargados.</p>
            )}
          </section>

          <section className="siniestro-seccion">
            <h3>Historial</h3>
            {eventos.length ? (
              <ol className="siniestro-historial">
                {eventos.map((evento) => (
                  <li key={evento.id}>
                    <span>{formatoFechaHora(evento.fecha)} · {evento.quien}</span>
                    <p>{evento.texto}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="texto-suave">Todavía no hay movimientos.</p>
            )}
          </section>
        </div>

        <section className="siniestro-seccion siniestro-finanzas">
          <h3>Resumen financiero</h3>
          <div className="siniestro-finanzas-kpis">
            <div><span>Reclamado en gastos</span><strong>$ {gastos.reduce((total, gasto) => total + gasto.monto, 0).toLocaleString("es-AR")}</strong></div>
            <div><span>Indemnización aprobada</span><strong>$ {(siniestro.montoAprobado ?? 0).toLocaleString("es-AR")}</strong></div>
            <div><span>Indemnización pagada</span><strong>$ {(siniestro.montoPagado ?? 0).toLocaleString("es-AR")}</strong></div>
          </div>
          {gastos.length > 0 && (
            <ul className="siniestro-gastos-lista">
              {gastos.map((gasto) => <li key={gasto.id}><span>{gasto.fecha} · {gasto.tipo} · {gasto.descripcion}</span><strong>{gasto.moneda} {gasto.monto.toLocaleString("es-AR")}</strong></li>)}
            </ul>
          )}
          <details className="siniestro-editar">
            <summary className="boton">Registrar gasto reclamado</summary>
            <form action={registrarGastoSiniestro} className="siniestro-form siniestro-form-carga">
              <input type="hidden" name="id" value={siniestro.id} />
              <label><span>Tipo</span><input name="tipo" maxLength={80} required placeholder="Reparación, traslado…" /></label>
              <label><span>Fecha</span><input name="fecha" type="date" defaultValue={diaEnArgentina(new Date())} required /></label>
              <label><span>Monto en pesos</span><input name="monto" type="number" min="0.01" step="0.01" required /></label>
              <label><span>Detalle</span><input name="descripcion" maxLength={250} required /></label>
              <button type="submit" className="boton boton-primario">Guardar gasto</button>
            </form>
          </details>
        </section>

        <section className="siniestro-seccion siniestro-informes">
          <h3>Informes y constancias</h3>
          <div className="siniestro-informes-acciones">
            {([ ["resumen", "Preparar resumen"], ["constancia", "Preparar constancia"], ["denuncia", "Preparar denuncia"] ] as const).map(([tipo, texto]) => (
              <form action={crearInformeSiniestro} key={tipo}>
                <input type="hidden" name="id" value={siniestro.id} />
                <input type="hidden" name="tipo" value={tipo} />
                <button type="submit" className="boton">{texto}</button>
              </form>
            ))}
          </div>
          {informes.length > 0 ? informes.map((informe) => (
            <details key={informe.id} className="siniestro-informe-borrador">
              <summary>Borrador de {informe.tipo} · {formatoFechaHora(informe.creadoEl)}</summary>
              <pre>{JSON.stringify(informe.contenido, null, 2)}</pre>
            </details>
          )) : <p className="texto-suave">Todavía no preparaste informes para este expediente.</p>}
        </section>

        {!siniestro.cerrado && (
          <details className="siniestro-editar">
            <summary className="boton">Registrar novedad del trámite</summary>
            <form action={actualizarTramite} className="siniestro-form siniestro-form-carga">
              <input type="hidden" name="id" value={siniestro.id} />
              <label>
                <span>Etapa</span>
                <select name="etapa" defaultValue={siniestro.etapa}>
                  {ETAPAS.map((etapa) => <option key={etapa.id} value={etapa.id}>{etapa.nombre}</option>)}
                </select>
              </label>
              <label>
                <span>Número en la compañía</span>
                <input name="numeroCompania" type="text" defaultValue={siniestro.numeroCompania ?? ""} maxLength={100} />
              </label>
              <label>
                <span>Inspección</span>
                <input name="inspeccionEl" type="datetime-local" />
              </label>
              <label>
                <span>Indemnización aprobada</span>
                <input name="montoAprobado" type="number" min="0" step="0.01" defaultValue={siniestro.montoAprobado ?? ""} />
              </label>
              <label>
                <span>Indemnización pagada</span>
                <input name="montoPagado" type="number" min="0" step="0.01" defaultValue={siniestro.montoPagado ?? ""} />
              </label>
              <label className="siniestro-campo-ancho">
                <span>Novedad</span>
                <textarea name="novedad" rows={3} maxLength={1000} placeholder="Qué informó la compañía o qué pasó" />
              </label>
              {siniestro.etapa === "pago" && (
                <label className="siniestro-campo-ancho">
                  <span>Resolución</span>
                  <input name="resolucion" type="text" defaultValue={siniestro.resolucion ?? ""} maxLength={250} />
                </label>
              )}
              <button type="submit" className="boton boton-primario">Guardar novedad</button>
            </form>
          </details>
        )}
      </div>
    </article>
  );
}

export default async function Siniestros({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pestaña = sp.tab === "cerrados" || sp.tab === "archivados" ? sp.tab : "abiertos";
  const ahora = new Date();
  const [registros, polizas, asegurados, configuraciones, activo] = await Promise.all([
    obtenerSiniestros(),
    obtenerPolizasParaSiniestro(),
    obtenerAseguradosParaSiniestro(),
    obtenerConfiguracionSiniestros(),
    agenteConfigurado("siniestros"),
  ]);
  if (sp.panel === "cargar") {
    return <PanelLateral tituloId="panel-cargar-siniestro-titulo" cerrarHref={`/agentes/siniestros?tab=${pestaña}`} ancho={1040}>
      <PanelFormularioCarga polizas={polizas} asegurados={asegurados} />
    </PanelLateral>;
  }
  const todos = registros.map((registro) => {
    const { siniestro, poliza, asegurado, documentos } = registro;
    const nombre = asegurado?.nombre ?? siniestro.afectado ?? "Asegurado sin vincular";
    const contacto = asegurado?.tipo === "empresa" ? asegurado.contactoNombre ?? nombre : nombre;
    const configuracion = configuraciones.find((item) => item.compania === (siniestro.compania ?? poliza?.compania) && item.ramo === (siniestro.ramo ?? poliza?.ramo) && item.tipo === siniestro.tipo);
    const faltan = documentos.filter((doc) => !doc.recibido).map((doc) => doc.nombre);
    const siguienteCalculado = ahoraDe(
      {
        etapa: siniestro.etapa,
        fecha: siniestro.fecha,
        creadoEl: siniestro.creadoEl,
        avisoDe: siniestro.avisoDe,
        denuncia: siniestro.denuncia,
        denunciaEnviadaEl: siniestro.denunciaEnviadaEl,
        ultimaNovedadCompaniaEl: siniestro.ultimaNovedadCompaniaEl,
        reclamoEnviadoEl: siniestro.reclamoEnviadoEl,
        recordatorioEnviadoEl: siniestro.recordatorioEnviadoEl,
        inspeccionEl: siniestro.inspeccionEl,
        montoAprobado: siniestro.montoAprobado,
        montoPagado: siniestro.montoPagado,
        pagadoEl: siniestro.pagadoEl,
        cerrado: siniestro.cerrado,
        cerradoEl: siniestro.cerradoEl,
        resolucion: siniestro.resolucion,
      },
      faltan,
      {
        ahora,
        compania: siniestro.compania ?? poliza?.compania ?? "la compañía",
        contacto,
        plazoDenunciaDias: configuracion?.plazoAvisoDias ?? PLAZO_DENUNCIA_DIAS,
        diasSinNovedades: configuracion?.diasSinNovedades ?? DIAS_SIN_NOVEDADES,
      },
    );
    const siguiente = siniestro.compania || poliza?.compania
      ? siguienteCalculado
      : {
          ...siguienteCalculado,
          tono: "accion" as const,
          titulo: "Completá la compañía del siniestro",
          texto: "Asigná una compañía para preparar el envío de la denuncia y aplicar sus reglas de documentación.",
          acciones: siguienteCalculado.acciones.filter((accion) => accion === "editarDenuncia"),
        };
    return { ...registro, nombre, ramo: siniestro.ramo ?? poliza?.ramo ?? "Ramo sin definir", compania: siniestro.compania ?? poliza?.compania ?? "Sin compañía", ahora: siguiente, requiereAtencion: requiereAtencion(siguiente), nuevo: esNuevo(siniestro, ahora) };
  });
  const noArchivados = todos.filter((registro) => !registro.siniestro.archivado);
  const abiertos = noArchivados.filter((registro) => !registro.siniestro.cerrado);
  const cerrados = noArchivados.filter((registro) => registro.siniestro.cerrado);
  const archivados = todos.filter((registro) => registro.siniestro.archivado);
  const baseVisibles = pestaña === "abiertos" ? abiertos : pestaña === "cerrados" ? cerrados : archivados;
  const q = typeof sp.q === "string" ? sp.q.trim().toLocaleLowerCase("es-AR") : "";
  const companiaFiltro = typeof sp.compania === "string" ? sp.compania : "";
  const desde = typeof sp.desde === "string" && sp.desde ? new Date(`${sp.desde}T00:00:00-03:00`) : null;
  const hasta = typeof sp.hasta === "string" && sp.hasta ? new Date(`${sp.hasta}T23:59:59.999-03:00`) : null;
  const visibles = baseVisibles.filter(({ siniestro, asegurado, poliza, nombre, ramo, compania }) => {
    const texto = [siniestro.folio, nombre, siniestro.afectado, siniestro.descripcion, ramo, compania, poliza?.numero, poliza?.bien, asegurado?.documento]
      .filter(Boolean).join(" ").toLocaleLowerCase("es-AR");
    return (!q || texto.includes(q))
      && (!companiaFiltro || compania === companiaFiltro)
      && (!desde || siniestro.fecha >= desde)
      && (!hasta || siniestro.fecha <= hasta);
  });
  const idSeleccionado = typeof sp.id === "string" ? Number(sp.id) : NaN;
  const seleccionado = visibles.find((registro) => registro.siniestro.id === idSeleccionado) ?? visibles[0];
  const kpis = kpisSiniestros(
    noArchivados.map(({ siniestro, asegurado, requiereAtencion: atencion }) => ({
      cerrado: siniestro.cerrado,
      etapa: siniestro.etapa,
      aseguradoId: asegurado?.id ?? -siniestro.id,
      atencion,
      fecha: siniestro.fecha,
      cerradoEl: siniestro.cerradoEl,
    })),
    ahora,
  );
  const buscandoDocumentacion = abiertos.filter((registro) => indiceEtapa(registro.siniestro.etapa) <= 1).length;
  const companias = [...new Set(todos.map((registro) => registro.compania).filter((nombre) => nombre !== "Sin compañía"))].sort((a, b) => a.localeCompare(b, "es-AR"));

  return (
    <>
      <EncabezadoAgente
        agente="siniestros"
        titulo="Agente de siniestros"
        activo={activo}
        descripcion="Organizá expedientes, documentación y próximos pasos. Los mensajes a asegurados y compañías quedan para tu aprobación."
      >
        <Link href="/agentes/siniestros/informes" className="boton">Informes y constancias</Link>
        <Link href="/agentes/siniestros/configuracion" className="boton">Reglas del agente</Link>
        <Link href="/configuracion" className="boton">Configuración general</Link>
        <Link href={`/agentes/siniestros?tab=${pestaña}&panel=cargar`} scroll={false} className="boton boton-primario">
          Cargar siniestro
        </Link>
      </EncabezadoAgente>

      {typeof sp.aviso === "string" && AVISOS[sp.aviso] && (
        <p role={sp.aviso === "envio-error" || sp.aviso === "sin-contacto" || sp.aviso === "sin-compania" || sp.aviso === "error-operacion" ? "alert" : "status"} className={`siniestro-aviso${sp.aviso === "envio-error" || sp.aviso === "sin-contacto" || sp.aviso === "sin-compania" || sp.aviso === "error-operacion" ? " error" : ""}`}>
          {AVISOS[sp.aviso]}
        </p>
      )}

      <section aria-label="Resumen" className="kpis-agente siniestro-kpis">
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Siniestros abiertos</span>
          <span className="kpi-agente-valor">{kpis.abiertos}</span>
          <span className="kpi-agente-detalle">en seguimiento</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Requieren tu atención</span>
          <span className={`kpi-agente-valor${kpis.atencion ? " texto-rojo" : ""}`}>{kpis.atencion}</span>
          <span className="kpi-agente-detalle">aprobar, recordar o reclamar</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Juntando documentación</span>
          <span className="kpi-agente-valor">{buscandoDocumentacion}</span>
          <span className="kpi-agente-detalle">el agente se la pide al asegurado</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Tiempo promedio de cierre</span>
          <span className="kpi-agente-valor">{kpis.promedioCierre === null ? "—" : `${kpis.promedioCierre} días`}</span>
          <span className="kpi-agente-detalle">últimos 6 meses</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Archivados</span>
          <span className="kpi-agente-valor">{archivados.length}</span>
          <span className="kpi-agente-detalle">expedientes guardados</span>
        </div>
      </section>

      <nav aria-label="Estado de los siniestros" className="pestanas">
        {PESTANAS.map((pestana) => {
          const cantidad = pestana.id === "abiertos" ? abiertos.length : pestana.id === "cerrados" ? cerrados.length : archivados.length;
          return (
            <Link
              key={pestana.id}
              href={`/agentes/siniestros?tab=${pestana.id}`}
              scroll={false}
              aria-current={pestaña === pestana.id ? "page" : undefined}
              className="pestana"
            >
              {pestana.texto}<span className="contador-gris">{cantidad}</span>
            </Link>
          );
        })}
      </nav>

      <form action="/agentes/siniestros" method="get" className="siniestro-filtros">
        <input type="hidden" name="tab" value={pestaña} />
        <label>
          <span>Buscar expediente</span>
          <input type="search" name="q" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="Folio, asegurado, póliza o bien" />
        </label>
        <label>
          <span>Compañía</span>
          <select name="compania" defaultValue={companiaFiltro}>
            <option value="">Todas</option>
            {companias.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
          </select>
        </label>
        <label>
          <span>Desde</span>
          <input type="date" name="desde" defaultValue={typeof sp.desde === "string" ? sp.desde : ""} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" name="hasta" defaultValue={typeof sp.hasta === "string" ? sp.hasta : ""} />
        </label>
        <button type="submit" className="boton">Filtrar</button>
        {(q || companiaFiltro || desde || hasta) && <Link href={`/agentes/siniestros?tab=${pestaña}`} className="siniestro-filtros-limpiar">Limpiar</Link>}
      </form>

      <div className="siniestros-layout">
        <ul className="siniestros-lista" aria-label="Siniestros">
          {visibles.map((registro) => {
            const { siniestro } = registro;
            const seleccionadoActual = seleccionado?.siniestro.id === siniestro.id;
            const estado = siniestro.cerrado ? "Cerrado" : nombreEtapa(siniestro.etapa);
            const estilo = siniestro.cerrado ? "cerrado" : registro.requiereAtencion ? "atencion" : indiceEtapa(siniestro.etapa) >= 4 ? "ok" : "normal";
            return (
              <li key={siniestro.id}>
                <Link
                  href={`/agentes/siniestros?tab=${pestaña}&id=${siniestro.id}`}
                  scroll={false}
                  aria-current={seleccionadoActual ? "page" : undefined}
                  className={`siniestro-fila${seleccionadoActual ? " seleccionada" : ""}`}
                >
                  <span className="siniestro-fila-cabecera">
                    <strong>{registro.nombre}</strong>
                    {registro.nuevo && <span className="siniestro-nuevo">Nuevo</span>}
                    {registro.requiereAtencion && <span className="siniestro-punto" aria-label="Requiere tu atención" />}
                  </span>
                  <span>{registro.ramo} · {siniestro.descripcion}</span>
                  <span className="siniestro-fila-pie">
                    <span className={`siniestro-estado ${estilo}`}>{estado}</span>
                    <span>{registro.compania} · {siniestro.folio ?? `SIN-${String(siniestro.id).padStart(6, "0")}`} · {diaYMes(diaEnArgentina(siniestro.fecha))}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {visibles.length === 0 && (
            <li className="tarjeta siniestro-vacio">
              <strong>{pestaña === "abiertos" ? "No hay siniestros abiertos" : pestaña === "cerrados" ? "Todavía no hay siniestros cerrados" : "No hay expedientes archivados"}</strong>
              <p className="texto-suave">Los siniestros que cargues aparecen acá.</p>
            </li>
          )}
        </ul>
        {seleccionado ? (
          <Detalle registro={seleccionado} ahora={seleccionado.ahora} />
        ) : (
          <section className="tarjeta siniestro-sin-seleccion">
            <p className="texto-suave">Elegí un siniestro de la lista o cargá uno nuevo.</p>
          </section>
        )}
      </div>
    </>
  );
}
