import Link from "next/link";
import { obtenerSiniestros } from "@/lib/datos-agentes";
import "../../agentes.css";

export const instant = false;

export default async function InformesSiniestros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [registros, sp] = await Promise.all([obtenerSiniestros(), searchParams]);
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const consulta = typeof sp.q === "string" ? sp.q.trim().toLocaleLowerCase("es-AR") : "";
  const informes = registros.flatMap(({ siniestro, asegurado, poliza, informes }) => informes.map((informe) => ({
    informe,
    siniestro,
    nombre: asegurado?.nombre ?? siniestro.afectado ?? "Sin vincular",
    compania: siniestro.compania ?? poliza?.compania ?? "Sin compañía",
  }))).filter(({ informe, siniestro, nombre, compania }) => {
    const texto = [informe.tipo, siniestro.folio, nombre, compania].join(" ").toLocaleLowerCase("es-AR");
    return (!tipo || informe.tipo === tipo) && (!consulta || texto.includes(consulta));
  });

  return (
    <main className="contenido-pagina siniestro-configuracion">
      <header className="siniestro-config-cabecera">
        <Link href="/agentes/siniestros" className="siniestro-config-volver">← Volver a Siniestros</Link>
        <h1>Informes y constancias</h1>
        <p className="texto-suave">Borradores preparados desde los expedientes. Revisalos antes de compartir.</p>
      </header>
      <form action="/agentes/siniestros/informes" method="get" className="siniestro-filtros">
        <label><span>Buscar</span><input type="search" name="q" defaultValue={consulta} placeholder="Folio, asegurado o compañía" /></label>
        <label>
          <span>Tipo</span>
          <select name="tipo" defaultValue={tipo}>
            <option value="">Todos los tipos</option>
            <option value="resumen">Resumen</option>
            <option value="constancia">Constancia</option>
            <option value="denuncia">Denuncia</option>
          </select>
        </label>
        <button type="submit" className="boton">Filtrar</button>
        {(tipo || consulta) && <Link href="/agentes/siniestros/informes" className="siniestro-filtros-limpiar">Limpiar</Link>}
      </form>
      <section className="siniestro-config-reglas" aria-label="Informes preparados">
        {informes.length ? informes.map(({ informe, siniestro, nombre, compania }) => (
          <article key={informe.id} className="tarjeta siniestro-informe-global">
            <header>
              <div>
                <strong>{informe.tipo === "resumen" ? "Resumen" : informe.tipo === "constancia" ? "Constancia" : "Denuncia"}</strong>
                <p>{siniestro.folio ?? `SIN-${String(siniestro.id).padStart(6, "0")}`} · {nombre} · {compania}</p>
              </div>
              <span className="siniestro-estado normal">Borrador</span>
            </header>
            <p className="texto-suave">Preparado el {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(informe.creadoEl)}</p>
            <details className="siniestro-informe-borrador">
              <summary>Ver borrador</summary>
              <pre>{JSON.stringify(informe.contenido, null, 2)}</pre>
            </details>
            <Link className="boton" href={`/agentes/siniestros/${siniestro.id}/dossier`}>Abrir expediente</Link>
          </article>
        )) : <p className="tarjeta siniestro-vacio texto-suave">No hay informes que coincidan con los filtros. Prepará un borrador desde un expediente.</p>}
      </section>
    </main>
  );
}
