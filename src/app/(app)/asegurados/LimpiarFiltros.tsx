"use client";

import { useRouter } from "next/navigation";

/** Vuelve a la lista sin filtros y vacía también la búsqueda escrita. */
export function LimpiarFiltros() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="boton-texto"
      onClick={() => {
        const busqueda = document.querySelector<HTMLInputElement>('.filtros-lista input[name="q"]');
        if (busqueda) busqueda.value = "";
        router.replace("/asegurados", { scroll: false });
      }}
    >
      Limpiar filtros
    </button>
  );
}
