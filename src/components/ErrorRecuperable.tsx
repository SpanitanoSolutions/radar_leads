"use client";

import { useEffect } from "react";
import Link from "next/link";

type ErrorDePagina = Error & { digest?: string };

export function ErrorRecuperable({
  error,
  retry,
  area = "la aplicación",
}: {
  error: ErrorDePagina;
  retry: () => void;
  area?: string;
}) {
  useEffect(() => {
    console.error(`Error no controlado en ${area}:`, error);
  }, [area, error]);

  return (
    <section className="error-recuperable" role="alert" aria-labelledby="error-recuperable-titulo">
      <div className="error-recuperable-tarjeta">
        <span className="error-recuperable-icono" aria-hidden="true">!</span>
        <p className="error-recuperable-etiqueta">Se interrumpió la operación</p>
        <h1 id="error-recuperable-titulo">No pudimos completar esta acción</h1>
        <p className="error-recuperable-detalle">
          Revisá si el cambio quedó aplicado antes de intentarlo de nuevo. Podés volver a cargar esta pantalla o regresar al inicio.
        </p>
        {error.digest && <p className="error-recuperable-referencia">Referencia: {error.digest}</p>}
        <div className="error-recuperable-acciones">
          <button type="button" className="boton boton-primario" onClick={retry}>
            Volver a cargar
          </button>
          <Link className="boton" href="/inicio">
            Volver al inicio
          </Link>
        </div>
      </div>
    </section>
  );
}
