"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { IconoBuscar } from "@/components/iconos";

export type CampoFiltro =
  | { nombre: string; tipo: "buscar"; etiqueta: string; placeholder: string }
  | { nombre: string; tipo: "elegir"; etiqueta: string; opciones: { valor: string; texto: string }[] }
  | { nombre: string; tipo: "fecha"; etiqueta: string };

/** Filtros en píldora que viven en la URL (búsqueda con espera, listas y fechas al cambiar). Cambiar uno vuelve a la primera página. */
export function Filtros({ campos, valores }: { campos: CampoFiltro[]; valores: Record<string, string> }) {
  const router = useRouter();
  const ruta = usePathname();
  const actuales = useSearchParams();
  const [, iniciar] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  const ir = (nombre: string, valor: string) => {
    const p = new URLSearchParams(actuales.toString());
    if (valor) p.set(nombre, valor);
    else p.delete(nombre);
    p.delete("aviso");
    p.delete("pagina");
    const qs = p.toString();
    iniciar(() => router.replace(qs ? `${ruta}?${qs}` : ruta, { scroll: false }));
  };

  return (
    <div className="filtros-pildora" role="search">
      {campos.map((c) =>
        c.tipo === "buscar" ? (
          <div key={c.nombre} className="campo-con-icono buscar-pildora">
            <IconoBuscar />
            <input
              type="search"
              aria-label={c.etiqueta}
              placeholder={c.placeholder}
              defaultValue={valores[c.nombre] ?? ""}
              className="campo campo-pildora"
              onChange={(e) => {
                const v = e.target.value.trim();
                clearTimeout(espera.current);
                espera.current = setTimeout(() => ir(c.nombre, v), 350);
              }}
            />
          </div>
        ) : c.tipo === "fecha" ? (
          <label key={c.nombre} className="filtro-fecha">
            <span>{c.etiqueta}</span>
            <input
              type="date"
              className="campo campo-pildora"
              defaultValue={valores[c.nombre] ?? ""}
              onChange={(e) => ir(c.nombre, e.target.value)}
            />
          </label>
        ) : (
          <select
            key={c.nombre}
            aria-label={c.etiqueta}
            className="campo campo-pildora"
            value={valores[c.nombre] ?? ""}
            onChange={(e) => ir(c.nombre, e.target.value)}
          >
            {c.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        ),
      )}
    </div>
  );
}
