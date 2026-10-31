import Link from "next/link";
import { IconoRadar } from "./iconos";

// Todavía no hay una casilla de UNIQO para consultas legales y de privacidad.
// Cuando exista, va acá y aparece en la política de privacidad y en los
// términos. Google la pide para verificar la app.
export const CONTACTO_LEGAL: string | null = null;

export type SeccionLegal = { readonly id: string; readonly titulo: string };

/**
 * Hoja de un documento legal público (privacidad, términos): marca, título,
 * fecha, introducción, índice y pie con los otros documentos. Queda fuera del
 * marco de la app porque se lee sin sesión.
 */
export function DocumentoLegal({
  titulo,
  actualizada,
  intro,
  secciones,
  children,
}: {
  titulo: string;
  actualizada: string;
  intro: React.ReactNode;
  secciones: readonly SeccionLegal[];
  children: React.ReactNode;
}) {
  return (
    <main className="legal">
      <article className="legal-hoja">
        <header className="legal-encabezado">
          <Link href="/" className="marca legal-marca" aria-label="UNIQO, ir al inicio">
            <span className="marca-icono" aria-hidden="true">
              <IconoRadar />
            </span>
            <span className="marca-nombre">UNIQO</span>
            <span className="barra-producto">Tecnología aplicada a seguros</span>
          </Link>
          <h1 className="legal-titulo">{titulo}</h1>
          <p className="legal-fecha">Última actualización: {actualizada}</p>
        </header>

        {intro}

        <nav className="legal-indice" aria-label="Contenido">
          <h2>Contenido</h2>
          <ol>
            {secciones.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.titulo}</a>
              </li>
            ))}
          </ol>
        </nav>

        {children}

        <footer className="legal-pie">
          <Link href="/">Volver a UNIQO</Link>
          <span className="legal-pie-enlaces">
            <Link href="/terminos">Términos y condiciones</Link>
            <Link href="/privacidad">Política de privacidad</Link>
          </span>
        </footer>
      </article>
    </main>
  );
}

/** Sección numerada según su lugar en el índice del documento. */
export function SeccionNumerada({
  secciones,
  id,
  children,
}: {
  secciones: readonly SeccionLegal[];
  id: string;
  children: React.ReactNode;
}) {
  const indice = secciones.findIndex((s) => s.id === id);
  return (
    <section id={id} className="legal-seccion" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}>
        {indice + 1}. {secciones[indice].titulo}
      </h2>
      {children}
    </section>
  );
}
