import Link from "next/link";
import { notFound } from "next/navigation";
import { IconoAtras, IconoDocumento, IconoEstrella, IconoTelefono } from "@/components/iconos";
import { ESTADOS, RAMOS, URL_CONSULTA_ART } from "@/lib/catalogos";
import { obtenerLead } from "@/lib/datos";
import { DIAS_CAUCION_URGENTE, etiquetaEvento, type TipoEvento } from "@/lib/evento";
import { haceCuanto } from "@/lib/fechas";
import { puntuarLead } from "@/lib/filtros";
import { BotonCopiar } from "@/components/BotonCopiar";
import { MOTIVOS_DESCARTE, nombreMotivo } from "@/lib/cierre";
import { guionContacto } from "@/lib/guion";
import { pesos } from "@/lib/formato";
import { busquedaManual, dominioDe, enlaceTelefono, enlaceWhatsApp } from "@/lib/contacto";
import { contactoDeLugar, type ContactoGoogle } from "@/fuentes/enriquecimiento/places";
import { cambiarEstado, cerrarLead, descartarLead, guardarSeguimiento } from "../../actions";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const COLOR_SCORE = {
  alto: { background: "var(--acento)", color: "#fff" },
  medio: { background: "var(--acento-suave)", color: "var(--acento-texto)" },
  bajo: { background: "var(--gris-suave)", color: "#3f4757" },
};

export default async function FichaLead({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const datos = await obtenerLead(id);
  if (!datos) notFound();
  const { lead, sector } = datos;
  const guardado = (await searchParams).guardado === "1";

  const { score, nivel, tipoEvento, diasEvento, ramosOrdenados, sinContacto } = puntuarLead(lead, sector);
  const google = await contactoGoogle(lead.placeId);
  const caucionAlFinal = ramosOrdenados.length > 1 && ramosOrdenados.at(-1) === "Caución";
  const guion = guionContacto({
    empresa: lead.empresa,
    tipoEvento,
    sectorId: lead.sectorId,
    rubro: lead.rubro,
    localidad: lead.localidad,
    motivo: lead.motivo,
    diasEvento,
    productor: process.env.NOMBRE_PRODUCTOR,
  });
  // Teléfono: el de Google Maps (en vivo) o el que la empresa publica en su web.
  const telefono = google?.telefono ?? lead.telefono;
  const whatsapp = enlaceWhatsApp(google?.telefonoInternacional ?? lead.telefono ?? "", guion);

  return (
    <>
      <Link href="/" className="volver">
        <IconoAtras />
        Volver a leads del día
      </Link>

      <header className="tarjeta ficha-encabezado">
        <div className="ficha-identidad">
          <div className="score-grande" style={COLOR_SCORE[nivel]} aria-label={`Score ${score} de 100`}>
            <span className="score-grande-numero">{score}</span>
            <span className="score-grande-texto" aria-hidden="true">
              SCORE
            </span>
          </div>
          <div className="encabezado-texto">
            <h1 className="titulo">{lead.empresa}</h1>
            <div className="titulo-fila subtitulo">
              <span className="pastilla pastilla-azul">
                {sector.principal && <IconoEstrella size={12} />}
                {sector.nombre}
              </span>
              <span>
                {lead.rubro} · {lead.localidad}
              </span>
              {lead.esEjemplo && <span className="pastilla pastilla-ambar">Ejemplo</span>}
            </div>
          </div>
        </div>
        <div className="fila-acciones">
          {telefono ? (
            <a href={enlaceTelefono(telefono)} className="boton boton-primario">
              <IconoTelefono />
              Llamar
            </a>
          ) : (
            <a
              href={busquedaManual(lead.empresa, lead.localidad)}
              target="_blank"
              rel="noopener noreferrer"
              className="boton"
            >
              <IconoTelefono />
              Buscar teléfono en Google
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="boton">
              WhatsApp
            </a>
          )}
        </div>
      </header>

      <div className="columnas">
        <div className="columna-principal">
          <section className="tarjeta tarjeta-padding" aria-labelledby="t-motivo">
            <h2 id="t-motivo" className="titulo-seccion">Por qué aparece</h2>
            <div className="motivo">
              <span className="motivo-icono">
                <IconoDocumento />
              </span>
              <div>
                <p className="motivo-titulo">{lead.motivo}</p>
                <p className="motivo-texto">
                  {lead.descripcion ?? `Detectado en ${lead.fuente}.`}{" "}
                  {lead.fechaEvento && `${etiquetaEvento(tipoEvento, lead.fechaEvento)} · `}
                  Detectado: {haceCuanto(lead.detectadoEl).toLowerCase()}.
                </p>
                {lead.fuenteUrl && (
                  <a href={lead.fuenteUrl} target="_blank" rel="noopener noreferrer">
                    {textoEnlaceFuente(tipoEvento, lead.fuenteUrl)}
                  </a>
                )}
                {lead.fuenteReferencia && <p className="nota-info">{lead.fuenteReferencia}</p>}
              </div>
            </div>
          </section>

          <section className="tarjeta tarjeta-padding" aria-labelledby="t-guion">
            <h2 id="t-guion" className="titulo-seccion">Cómo arrancar la conversación</h2>
            <p className="guion">{guion}</p>
            <div className="fila-acciones">
              <BotonCopiar texto={guion} />
            </div>
          </section>

          <section className="tarjeta tarjeta-padding" aria-labelledby="t-ramos">
            <h2 id="t-ramos" className="titulo-seccion">Ramos sugeridos</h2>
            {caucionAlFinal && (
              <p className="nota-info">
                Se adjudicó hace {diasEvento} días: la garantía ya se presentó. Pasados {DIAS_CAUCION_URGENTE} días
                la caución deja de ser lo primero que ofrecer.
              </p>
            )}
            <div className="ramos-grilla">
              {ramosOrdenados.map((r) => (
                <div key={r} className="ramo-tarjeta">
                  <span className="ramo-nombre">{r}</span>
                  {RAMOS[r] && <span className="ramo-texto">{RAMOS[r]}</span>}
                </div>
              ))}
            </div>
          </section>

          <section className="tarjeta tarjeta-padding" aria-labelledby="t-seguimiento">
            <h2 id="t-seguimiento" className="titulo-seccion">Seguimiento</h2>
            <form action={cambiarEstado}>
              <input type="hidden" name="id" value={lead.id} />
              <fieldset className="estados">
                <legend className="visualmente-oculto">Estado del lead</legend>
                {ESTADOS.filter((e) => e.id !== "cerrado" && e.id !== "descartado").map((e) => (
                  <button
                    key={e.id}
                    type="submit"
                    name="estado"
                    value={e.id}
                    className="boton boton-estado"
                    aria-pressed={lead.estado === e.id}
                  >
                    {e.nombre}
                  </button>
                ))}
              </fieldset>
            </form>

            <div className="estados">
              <details className="desplegable">
                <summary className="boton boton-estado" aria-pressed={lead.estado === "cerrado"}>
                  Cerrado
                </summary>
                <form action={cerrarLead} className="form-columna panel-desplegable">
                  <input type="hidden" name="id" value={lead.id} />
                  <fieldset className="opciones-en-linea">
                    <legend className="etiqueta">Qué se vendió (opcional)</legend>
                    {[...new Set([...ramosOrdenados, ...(lead.cierreRamos ?? [])])].map((r) => (
                      <label key={r} className="opcion-chica">
                        <input type="checkbox" name="ramo" value={r} defaultChecked={lead.cierreRamos?.includes(r)} />
                        {r}
                      </label>
                    ))}
                  </fieldset>
                  <div className="form-fila">
                    <label className="form-columna">
                      <span className="etiqueta">Prima anual aprox. ($)</span>
                      <input
                        name="prima"
                        inputMode="numeric"
                        className="campo"
                        defaultValue={lead.cierrePrima ?? ""}
                        placeholder="Ej.: 1.200.000"
                      />
                    </label>
                    <label className="form-columna">
                      <span className="etiqueta">Comisión aprox. ($)</span>
                      <input
                        name="comision"
                        inputMode="numeric"
                        className="campo"
                        defaultValue={lead.cierreComision ?? ""}
                        placeholder="Ej.: 180.000"
                      />
                    </label>
                  </div>
                  <button type="submit" className="boton boton-primario">
                    Marcar como cerrado
                  </button>
                </form>
              </details>

              <details className="desplegable">
                <summary className="boton boton-estado" aria-pressed={lead.estado === "descartado"}>
                  Descartado
                </summary>
                <form action={descartarLead} className="form-columna panel-desplegable">
                  <input type="hidden" name="id" value={lead.id} />
                  <label className="form-columna">
                    <span className="etiqueta">Motivo</span>
                    <select name="motivo" className="campo" required defaultValue={lead.motivoDescarte ?? ""}>
                      <option value="" disabled>
                        Elegí un motivo
                      </option>
                      {MOTIVOS_DESCARTE.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="boton boton-primario">
                    Descartar
                  </button>
                </form>
              </details>
            </div>

            {lead.estado === "cerrado" && Boolean(lead.cierreRamos?.length || lead.cierreComision || lead.cierrePrima) && (
              <p className="nota-info">
                Cerrado{lead.cierreRamos?.length ? `: ${lead.cierreRamos.join(", ")}` : ""}
                {lead.cierrePrima ? ` · prima ${pesos(lead.cierrePrima)}` : ""}
                {lead.cierreComision ? ` · comisión ${pesos(lead.cierreComision)}` : ""}.
              </p>
            )}
            {lead.estado === "descartado" && lead.motivoDescarte && (
              <p className="nota-info">Descartado: {nombreMotivo(lead.motivoDescarte)}.</p>
            )}

            <form action={guardarSeguimiento} className="form-columna">
              <input type="hidden" name="id" value={lead.id} />
              <label htmlFor="nota" className="etiqueta">
                Notas
              </label>
              <textarea
                id="nota"
                name="nota"
                rows={4}
                defaultValue={lead.nota ?? ""}
                placeholder="Ej.: habló el socio gerente, tienen 3 camiones, piden cotización la semana que viene"
                className="campo"
              />
              <div className="form-fila">
                <div className="form-columna">
                  <label htmlFor="recordatorio" className="etiqueta">
                    Recordarme el
                  </label>
                  <input
                    id="recordatorio"
                    name="recordatorio"
                    type="date"
                    defaultValue={lead.recordatorio ?? ""}
                    className="campo"
                  />
                </div>
                <button type="submit" className="boton boton-primario">
                  Guardar
                </button>
              </div>
              {guardado && (
                <p className="mensaje-ok" role="status">
                  Seguimiento guardado.
                </p>
              )}
            </form>
          </section>
        </div>

        <aside className="columna-lateral">
          <section className="tarjeta tarjeta-padding" aria-labelledby="t-empresa">
            <h2 id="t-empresa" className="titulo-seccion">Datos de la empresa</h2>
            <dl className="datos">
              <dt>Razón social</dt>
              <dd>{lead.empresa}</dd>
              <dt>CUIT</dt>
              <dd>{lead.cuit ?? <SinDato />}</dd>
              <dt>Domicilio</dt>
              <dd>{lead.domicilio ?? <SinDato />}</dd>
              <dt>Teléfono</dt>
              <dd>
                {lead.telefono ? (
                  <>
                    {lead.telefono}
                    {lead.telefonoFuente && (
                      <>
                        {" · "}
                        <a href={lead.telefonoFuente} target="_blank" rel="noopener noreferrer">
                          dónde figura
                        </a>
                      </>
                    )}
                  </>
                ) : lead.telefonoBuscadoEl ? (
                  <span className="sin-dato">La empresa no lo publica</span>
                ) : (
                  <SinDato />
                )}
              </dd>
              <dt>Fuente</dt>
              <dd>{lead.fuente}</dd>
            </dl>
            {sinContacto && (
              <p className="nota-info">
                Sin contacto encontrado.{" "}
                <a href={busquedaManual(lead.empresa, lead.localidad)} target="_blank" rel="noopener noreferrer">
                  Buscarlo en Google
                </a>
              </p>
            )}
          </section>

          {google && (
            <section className="tarjeta tarjeta-padding contenido-google" aria-labelledby="t-google">
              <h2 id="t-google" className="titulo-seccion">
                Contacto{" "}
                <span className={`pastilla ${lead.contactoEstado === "verificado" ? "pastilla-verde" : "pastilla-ambar"}`}>
                  {lead.contactoEstado === "verificado" ? "Contacto verificado" : "Posible coincidencia"}
                </span>
              </h2>
              <dl className="datos">
                {google.nombre && (
                  <>
                    <dt>Nombre</dt>
                    <dd>{google.nombre}</dd>
                  </>
                )}
                <dt>Teléfono</dt>
                <dd>{google.telefono ? <a href={enlaceTelefono(google.telefono)}>{google.telefono}</a> : <SinDato />}</dd>
                <dt>Web</dt>
                <dd>
                  {google.web ? (
                    <a href={google.web} target="_blank" rel="noopener noreferrer">
                      {dominioDe(google.web)}
                    </a>
                  ) : (
                    <SinDato />
                  )}
                </dd>
                <dt>Dirección</dt>
                <dd>{google.direccion ?? <SinDato />}</dd>
                <dt>Reseñas</dt>
                <dd>{google.resenas ?? 0}</dd>
              </dl>
              <p className="fila-acciones atribucion-google">
                {google.mapa && (
                  <a href={google.mapa} target="_blank" rel="noopener noreferrer">
                    Ver en el mapa
                  </a>
                )}
                <span className="GMP-attribution" translate="no">
                  Google Maps
                </span>
              </p>
            </section>
          )}

          <section className="tarjeta tarjeta-padding" aria-labelledby="t-cobertura">
            <h2 id="t-cobertura" className="titulo-seccion">Cobertura y riesgo</h2>
            <div>
              <div className="fila-dato">
                <span className="etiqueta">ART actual</span>
                <span className={`pastilla ${lead.artActual ? "pastilla-azul" : "pastilla-gris"}`}>
                  {lead.artActual ?? "Sin consultar"}
                </span>
              </div>
              <div className="fila-dato">
                <span className="etiqueta">Deudas BCRA</span>
                <span className={`pastilla ${lead.deudaBcra === "Sin registros" ? "pastilla-verde" : "pastilla-gris"}`}>
                  {lead.deudaBcra ?? "Sin consultar"}
                </span>
              </div>
            </div>
            <a href={URL_CONSULTA_ART} target="_blank" rel="noopener noreferrer" className="boton">
              Consultar ART en SRT
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}

function textoEnlaceFuente(tipo: TipoEvento, url: string): string {
  if (tipo === "licitacion" && url.includes("comprar.gob.ar")) return "Abrir el buscador de COMPR.AR";
  const pagina = /#page=(\d+)/.exec(url);
  return pagina ? `Ver el edicto (página ${pagina[1]})` : "Ver publicación original";
}

/**
 * Contacto de Google Maps, pedido cada vez que se abre la ficha: los términos
 * de Places no permiten guardarlo. Sin key o si Google falla, no se muestra.
 */
async function contactoGoogle(placeId: string | null): Promise<ContactoGoogle | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placeId || !apiKey) return null;
  try {
    return await contactoDeLugar(placeId, { apiKey });
  } catch (err) {
    console.error("Google Maps:", err);
    return null;
  }
}

function SinDato() {
  return <span className="sin-dato">Sin dato</span>;
}
