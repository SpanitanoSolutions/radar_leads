import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerConfiguracionSiniestros, obtenerSiniestros } from "@/lib/datos-agentes";
import { diaEnArgentina } from "@/lib/fechas";
import { ImprimirDossier } from "../../ImprimirDossier";
import "../../../agentes.css";

export const instant = false;

export default async function DossierSiniestro({ params }: { params: Promise<{ id: string }> }) {
  const { id: idTexto } = await params;
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [registros, configuraciones] = await Promise.all([obtenerSiniestros(), obtenerConfiguracionSiniestros()]);
  const registro = registros.find((item) => item.siniestro.id === id);
  if (!registro) notFound();
  const { siniestro, poliza, asegurado, documentos, archivos, gastos } = registro;
  const faltantes = documentos.filter((documento) => documento.bloqueante && !documento.recibido);
  const configuracion = configuraciones.find((item) => item.compania === (siniestro.compania ?? poliza?.compania) && item.ramo === (siniestro.ramo ?? poliza?.ramo) && item.tipo === siniestro.tipo);
  const orden = new Map((configuracion?.ordenDossier ?? []).map((nombre, indice) => [nombre.toLocaleLowerCase("es-AR"), indice]));
  const archivosOrdenados = [...archivos].sort((a, b) => (orden.get(a.nombre.toLocaleLowerCase("es-AR")) ?? Number.MAX_SAFE_INTEGER) - (orden.get(b.nombre.toLocaleLowerCase("es-AR")) ?? Number.MAX_SAFE_INTEGER));
  const totalGastos = gastos.reduce((total, gasto) => total + gasto.monto, 0);
  const folio = siniestro.folio ?? `SIN-${String(siniestro.id).padStart(6, "0")}`;

  return (
    <main className="dossier-pagina">
      <nav className="dossier-navegacion">
        <Link href={`/agentes/siniestros?tab=${siniestro.archivado ? "archivados" : siniestro.cerrado ? "cerrados" : "abiertos"}&id=${siniestro.id}`}>← Volver al expediente</Link>
        {!faltantes.length && <ImprimirDossier />}
      </nav>
      {faltantes.length > 0 ? (
        <section className="dossier-bloqueado" role="status">
          <h1>Dossier pendiente</h1>
          <p>Completá los requisitos bloqueantes antes de preparar el dossier.</p>
          <ul>{faltantes.map((documento) => <li key={documento.id}>{documento.nombre}</li>)}</ul>
        </section>
      ) : (
        <article className="dossier-documento">
          <header className="dossier-titulo">
            <p>Expediente de siniestro</p>
            <h1>{folio}</h1>
            <span>Borrador para revisión del productor · {diaEnArgentina(new Date())}</span>
          </header>
          <section>
            <h2>Datos del caso</h2>
            <dl>
              <div><dt>Asegurado o afectado</dt><dd>{asegurado?.nombre ?? siniestro.afectado ?? "Sin vincular"}</dd></div>
              <div><dt>Compañía</dt><dd>{siniestro.compania ?? poliza?.compania ?? "Sin compañía"}</dd></div>
              <div><dt>Ramo</dt><dd>{siniestro.ramo ?? poliza?.ramo ?? "Sin ramo"}</dd></div>
              <div><dt>Póliza</dt><dd>{poliza?.numero ?? "No informada"}</dd></div>
              <div><dt>Tipo</dt><dd>{siniestro.tipo}</dd></div>
              <div><dt>Fecha del hecho</dt><dd>{new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(siniestro.fecha)}</dd></div>
              <div><dt>Lugar</dt><dd>{siniestro.lugar ?? "No informado"}</dd></div>
              <div><dt>Número en la compañía</dt><dd>{siniestro.numeroCompania ?? "Pendiente"}</dd></div>
            </dl>
          </section>
          <section>
            <h2>Relato</h2>
            <p>{siniestro.relato ?? siniestro.descripcion}</p>
          </section>
          {siniestro.denuncia?.length ? <section>
            <h2>Denuncia</h2>
            <dl>{siniestro.denuncia.map((campo) => <div key={campo.campo}><dt>{campo.campo}</dt><dd>{campo.valor}</dd></div>)}</dl>
          </section> : null}
          <section>
            <h2>Requisitos</h2>
            <ul>{documentos.map((documento) => <li key={documento.id}>{documento.recibido ? "✓" : "○"} {documento.nombre}{!documento.bloqueante ? " (opcional)" : ""}</li>)}</ul>
          </section>
          {archivosOrdenados.length > 0 && <section>
            <h2>Documentos adjuntos</h2>
            <ol>{archivosOrdenados.map((archivo) => <li key={archivo.id}>{archivo.nombre} · {archivo.clasificacion ?? "sin clasificar"}</li>)}</ol>
          </section>}
          <section>
            <h2>Resumen financiero</h2>
            <dl>
              <div><dt>Gastos reclamados</dt><dd>ARS {totalGastos.toLocaleString("es-AR")}</dd></div>
              <div><dt>Indemnización aprobada</dt><dd>ARS {(siniestro.montoAprobado ?? 0).toLocaleString("es-AR")}</dd></div>
              <div><dt>Indemnización pagada</dt><dd>ARS {(siniestro.montoPagado ?? 0).toLocaleString("es-AR")}</dd></div>
            </dl>
          </section>
          <footer>Documento de trabajo. Revisar y aprobar antes de compartir.</footer>
        </article>
      )}
    </main>
  );
}
