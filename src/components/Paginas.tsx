import Link from "next/link";
import { IconoAtras, IconoSiguiente } from "@/components/iconos";
import { numerosDePagina } from "@/lib/asegurados";

/** Anterior, los números de página (con "…" en los saltos) y siguiente. Con una sola página no muestra nada. */
export function Paginas({ pagina, paginas, href }: { pagina: number; paginas: number; href: (pagina: number) => string }) {
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Páginas" className="paginas">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} scroll={false} className="pagina-flecha" aria-label="Página anterior">
          <IconoAtras />
        </Link>
      ) : (
        <span className="pagina-flecha" aria-hidden="true">
          <IconoAtras />
        </span>
      )}
      {numerosDePagina(pagina, paginas).map((n, i) =>
        n === "…" ? (
          <span key={`salto-${i}`} className="pagina-salto" aria-hidden="true">
            …
          </span>
        ) : (
          <Link key={n} href={href(n)} scroll={false} className="pagina-numero" aria-label={`Página ${n}`} aria-current={n === pagina ? "page" : undefined}>
            {n}
          </Link>
        ),
      )}
      {pagina < paginas ? (
        <Link href={href(pagina + 1)} scroll={false} className="pagina-flecha" aria-label="Página siguiente">
          <IconoSiguiente />
        </Link>
      ) : (
        <span className="pagina-flecha" aria-hidden="true">
          <IconoSiguiente />
        </span>
      )}
    </nav>
  );
}
