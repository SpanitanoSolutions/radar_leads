"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { COOKIE_POR_PAGINA, OPCIONES_POR_PAGINA, urlAsegurados, type FiltrosAsegurados, type PorPagina } from "@/lib/asegurados";

/** Elegir cuántos asegurados ver por página. Queda guardado para la próxima vez. */
export function FilasPorPagina({ filtros, primeraFila }: { filtros: FiltrosAsegurados; primeraFila: number }) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  return (
    <label className="por-pagina">
      <span>Filas por página</span>
      <select
        className="campo campo-chico"
        value={filtros.por}
        onChange={(e) => {
          const por = Number(e.target.value) as PorPagina;
          document.cookie = `${COOKIE_POR_PAGINA}=${por}; path=/; max-age=31536000; samesite=lax`;
          // Sigue mostrando el asegurado que estaba primero.
          const pagina = Math.floor(Math.max(primeraFila - 1, 0) / por) + 1;
          iniciar(() => router.replace(urlAsegurados(filtros, { por, pagina }), { scroll: false }));
        }}
      >
        {OPCIONES_POR_PAGINA.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
