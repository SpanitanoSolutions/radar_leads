"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { IconoCerrar } from "./iconos";

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Panel que se abre desde la derecha sobre la página (el detalle de un
 * asegurado, la conexión de WhatsApp). Vive en la URL: cerrarlo es volver a
 * `cerrarHref`. Se cierra con Esc, mantiene el foco adentro y al cerrar lo
 * devuelve al elemento `volverA` (la fila desde la que se abrió).
 */
export function PanelLateral({
  tituloId,
  cerrarHref,
  volverA,
  ancho = 600,
  children,
}: {
  tituloId: string;
  cerrarHref: string;
  volverA?: string;
  ancho?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus();
    const cerrar = () => {
      router.replace(cerrarHref, { scroll: false });
      const destino = (volverA && document.getElementById(volverA)) || anterior;
      destino?.focus();
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const enfocables = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables.at(-1)!;
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    document.body.classList.add("con-panel");
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.classList.remove("con-panel");
    };
  }, [cerrarHref, router, volverA]);

  function cerrar() {
    router.replace(cerrarHref, { scroll: false });
    if (volverA) document.getElementById(volverA)?.focus();
  }

  return (
    <>
      <div className="panel-velo" aria-hidden="true" onClick={cerrar} />
      <aside
        ref={panel}
        className="panel-lateral"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        style={{ width: ancho }}
      >
        <button type="button" className="panel-cerrar" onClick={cerrar} aria-label="Cerrar">
          <IconoCerrar />
        </button>
        {children}
      </aside>
    </>
  );
}
