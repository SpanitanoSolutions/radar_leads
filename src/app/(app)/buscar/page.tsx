import Link from "next/link";
import { buscarGlobal } from "@/lib/datos-busqueda";
import "./buscar.css";

export const instant = false;

function MensajeVacio({ texto }: { texto: string }) {
  return <p className="buscar-vacio">{texto}</p>;
}

export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const consulta = typeof parametros.q === "string" ? parametros.q.trim().slice(0, 100) : "";
  const resultados = consulta.length >= 2 ? await buscarGlobal(consulta) : null;
  const cantidad = resultados
    ? resultados.asegurados.length + resultados.polizas.length + resultados.siniestros.length
    : 0;

  return (
    <>
      <header className="encabezado buscar-encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Buscar en UNIQO</h1>
          <p className="subtitulo">Encontrá clientes, pólizas y siniestros de tu cartera.</p>
        </div>
      </header>

      <form action="/buscar" method="get" className="tarjeta buscar-formulario" role="search">
        <label htmlFor="buscar-pagina">Cliente, póliza o siniestro</label>
        <div>
          <input
            id="buscar-pagina"
            type="search"
            name="q"
            defaultValue={consulta}
            autoFocus={!consulta}
            placeholder="Nombre, documento, número de póliza, compañía o folio"
            maxLength={100}
          />
          <button type="submit" className="boton boton-primario">Buscar</button>
        </div>
      </form>

      {!consulta && <section className="tarjeta buscar-instruccion"><p>Escribí al menos dos caracteres para buscar.</p></section>}
      {consulta.length === 1 && <section className="tarjeta buscar-instruccion"><p>Ingresá al menos dos caracteres.</p></section>}

      {resultados && (
        <>
          <p className="buscar-cantidad" role="status">
            {cantidad ? `${cantidad} resultados para “${consulta}”` : `No encontramos coincidencias para “${consulta}”.`}
          </p>

          <section className="tarjeta buscar-seccion" aria-labelledby="buscar-asegurados">
            <header><h2 id="buscar-asegurados">Asegurados</h2><span>{resultados.asegurados.length}</span></header>
            {resultados.asegurados.length ? (
              <ul>
                {resultados.asegurados.map((asegurado) => (
                  <li key={asegurado.id}>
                    <Link href={`/asegurados/${asegurado.id}`}>
                      <strong>{asegurado.nombre}</strong>
                      <span>{[asegurado.documento, asegurado.telefono, asegurado.bajaEl ? "Dado de baja" : null].filter(Boolean).join(" · ") || "Ver ficha"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <MensajeVacio texto="No encontramos asegurados con ese dato." />}
          </section>

          <section className="tarjeta buscar-seccion" aria-labelledby="buscar-polizas">
            <header><h2 id="buscar-polizas">Pólizas</h2><span>{resultados.polizas.length}</span></header>
            {resultados.polizas.length ? (
              <ul>
                {resultados.polizas.map((poliza) => (
                  <li key={poliza.id}>
                    <Link href={`/asegurados/${poliza.aseguradoId}`}>
                      <strong>{poliza.numero ? `Póliza ${poliza.numero}` : poliza.ramo}</strong>
                      <span>{[poliza.nombreAsegurado, poliza.compania, poliza.bien, poliza.bajaEl ? "Dada de baja" : null].filter(Boolean).join(" · ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <MensajeVacio texto="No encontramos pólizas con ese dato." />}
          </section>

          <section className="tarjeta buscar-seccion" aria-labelledby="buscar-siniestros">
            <header><h2 id="buscar-siniestros">Siniestros</h2><span>{resultados.siniestros.length}</span></header>
            {resultados.siniestros.length ? (
              <ul>
                {resultados.siniestros.map((siniestro) => (
                  <li key={siniestro.id}>
                    <Link href={`/agentes/siniestros?tab=${siniestro.archivado ? "archivados" : siniestro.cerrado ? "cerrados" : "abiertos"}&id=${siniestro.id}`}>
                      <strong>{siniestro.folio ? `Siniestro ${siniestro.folio}` : siniestro.descripcion}</strong>
                      <span>{[siniestro.nombreAsegurado, siniestro.descripcion, siniestro.numeroPoliza ? `Póliza ${siniestro.numeroPoliza}` : null, siniestro.compania, siniestro.afectado].filter(Boolean).join(" · ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <MensajeVacio texto="No encontramos siniestros con ese dato." />}
          </section>
        </>
      )}
    </>
  );
}
