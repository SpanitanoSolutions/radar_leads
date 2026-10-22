import Link from "next/link";
import { notFound } from "next/navigation";
import { IconoAtras, IconoDocumento, IconoEstrella, IconoTelefono } from "@/components/iconos";
import { ESTADOS, RAMOS, URL_CONSULTA_ART } from "@/lib/catalogos";
import { obtenerLead } from "@/lib/datos";
import { DIAS_CAUCION_URGENTE, etiquetaEvento } from "@/lib/evento";
import { haceCuanto } from "@/lib/fechas";
import { puntuarLead } from "@/lib/filtros";
import { cambiarEstado, guardarSeguimiento } from "../../actions";

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

  const { score, nivel, tipoEvento, diasEvento, ramosOrdenados } = puntuarLead(lead, sector);
  const caucionAlFinal = ramosOrdenados.length > 1 && ramosOrdenados.at(-1) === "Caución";
  const telefono = lead.telefono?.replace(/[^\d+]/g, "");

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
            <a href={`tel:${telefono}`} className="boton boton-primario">
              <IconoTelefono />
              Llamar
            </a>
          ) : (
            <span className="boton" aria-disabled="true" title="Todavía no hay teléfono cargado">
              <IconoTelefono />
              Sin teléfono
            </span>
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
                    Ver publicación original
                  </a>
                )}
              </div>
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
                {ESTADOS.map((e) => (
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
          </section>

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

function SinDato() {
  return <span className="sin-dato">Sin dato</span>;
}
