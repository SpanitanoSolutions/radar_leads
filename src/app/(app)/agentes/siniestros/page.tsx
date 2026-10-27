import Link from "next/link";
import { PanelLateral } from "@/components/PanelLateral";
import { EncabezadoAgente } from "@/components/agentes/Agente";
import { agenteConfigurado, obtenerPolizasParaSiniestro, obtenerSiniestros } from "@/lib/datos-agentes";
import { diaEnArgentina, diaYMes, fechaCorta } from "@/lib/fechas";
import {
  ahoraDe,
  esNuevo,
  indiceEtapa,
  kpisSiniestros,
  nombreEtapa,
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
} from "./actions";
import { FormularioCarga as PanelFormularioCarga } from "./FormularioCarga";
import "../agentes.css";

export const instant = false;

type Registro = Awaited<ReturnType<typeof obtenerSiniestros>>[number];
type Accion = ReturnType<typeof ahoraDe>;

const PESTANAS = [
  { id: "abiertos", texto: "Abiertos" },
  { id: "cerrados", texto: "Cerrados" },
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
  "sin-contacto": "No hay teléfono ni email para contactar al asegurado.",
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
        const telefono = registro.asegurado.tipo === "empresa" ? registro.asegurado.contactoTelefono : registro.asegurado.telefono;
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
            <pre>{textoReclamo(registro.siniestro, registro.asegurado.nombre)}</pre>
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
  const { siniestro, poliza, asegurado, documentos, eventos } = registro;
  const etapaActual = indiceEtapa(siniestro.etapa);
  const recibidos = documentos.filter((doc) => doc.recibido).length;

  return (
    <article className="tarjeta siniestro-detalle" aria-label="Detalle del siniestro">
      <header className="siniestro-detalle-cabecera">
        <div>
          <h2>{asegurado.nombre}</h2>
          <p>{poliza.ramo} · {siniestro.descripcion}</p>
          <p className="texto-suave">
            {poliza.compania ?? "Sin compañía"} · Póliza {poliza.numero ?? "sin número"} · Siniestro {siniestro.numeroCompania ?? "sin número"}
          </p>
          <p className="texto-suave">{fechaCorta(diaEnArgentina(siniestro.fecha))} · {siniestro.lugar ?? "Lugar no informado"}</p>
        </div>
        <Link href={`/asegurados/${asegurado.id}`} className="siniestro-ficha">Ver ficha del asegurado</Link>
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
  const pestaña = sp.tab === "cerrados" ? "cerrados" : "abiertos";
  const ahora = new Date();
  const [registros, polizas, activo] = await Promise.all([
    obtenerSiniestros(),
    obtenerPolizasParaSiniestro(),
    agenteConfigurado("siniestros"),
  ]);
  if (sp.panel === "cargar") {
    return (
      <PanelLateral tituloId="panel-cargar-siniestro-titulo" cerrarHref={`/agentes/siniestros?tab=${pestaña}`} ancho={600}>
        <PanelFormularioCarga polizas={polizas} />
      </PanelLateral>
    );
  }
  const todos = registros.map((registro) => {
    const { siniestro, poliza, asegurado, documentos } = registro;
    const contacto = asegurado.tipo === "empresa" ? asegurado.contactoNombre ?? asegurado.nombre : asegurado.nombre;
    const faltan = documentos.filter((doc) => !doc.recibido).map((doc) => doc.nombre);
    const siguiente = ahoraDe(
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
      { ahora, compania: poliza.compania ?? "la compañía", contacto },
    );
    return { ...registro, ahora: siguiente, requiereAtencion: requiereAtencion(siguiente), nuevo: esNuevo(siniestro, ahora) };
  });
  const abiertos = todos.filter((registro) => !registro.siniestro.cerrado);
  const cerrados = todos.filter((registro) => registro.siniestro.cerrado);
  const visibles = pestaña === "abiertos" ? abiertos : cerrados;
  const idSeleccionado = typeof sp.id === "string" ? Number(sp.id) : NaN;
  const seleccionado = visibles.find((registro) => registro.siniestro.id === idSeleccionado) ?? visibles[0];
  const kpis = kpisSiniestros(
    todos.map(({ siniestro, asegurado, requiereAtencion: atencion }) => ({
      cerrado: siniestro.cerrado,
      etapa: siniestro.etapa,
      aseguradoId: asegurado.id,
      atencion,
      fecha: siniestro.fecha,
      cerradoEl: siniestro.cerradoEl,
    })),
    ahora,
  );
  const buscandoDocumentacion = abiertos.filter((registro) => indiceEtapa(registro.siniestro.etapa) <= 1).length;

  return (
    <>
      <EncabezadoAgente
        agente="siniestros"
        titulo="Agente de siniestros"
        activo={activo}
        descripcion="Cuando un asegurado te avisa de un siniestro, el agente arma la denuncia, pide lo que falta y sigue el trámite hasta el pago."
      >
        <Link href="/configuracion" className="boton">Configuración</Link>
        <Link href={`/agentes/siniestros?tab=${pestaña}&panel=cargar`} scroll={false} className="boton boton-primario">
          Cargar siniestro
        </Link>
      </EncabezadoAgente>

      {typeof sp.aviso === "string" && AVISOS[sp.aviso] && (
        <p role={sp.aviso === "envio-error" || sp.aviso === "sin-contacto" || sp.aviso === "error-operacion" ? "alert" : "status"} className={`siniestro-aviso${sp.aviso === "envio-error" || sp.aviso === "sin-contacto" || sp.aviso === "error-operacion" ? " error" : ""}`}>
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
      </section>

      <nav aria-label="Estado de los siniestros" className="pestanas">
        {PESTANAS.map((pestana) => {
          const cantidad = pestana.id === "abiertos" ? abiertos.length : cerrados.length;
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

      <div className="siniestros-layout">
        <ul className="siniestros-lista" aria-label="Siniestros">
          {visibles.map((registro) => {
            const { siniestro, poliza, asegurado } = registro;
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
                    <strong>{asegurado.nombre}</strong>
                    {registro.nuevo && <span className="siniestro-nuevo">Nuevo</span>}
                    {registro.requiereAtencion && <span className="siniestro-punto" aria-label="Requiere tu atención" />}
                  </span>
                  <span>{poliza.ramo} · {siniestro.descripcion}</span>
                  <span className="siniestro-fila-pie">
                    <span className={`siniestro-estado ${estilo}`}>{estado}</span>
                    <span>{poliza.compania ?? "Sin compañía"} · {diaYMes(diaEnArgentina(siniestro.fecha))}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {visibles.length === 0 && (
            <li className="tarjeta siniestro-vacio">
              <strong>{pestaña === "abiertos" ? "No hay siniestros abiertos" : "Todavía no hay siniestros cerrados"}</strong>
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
