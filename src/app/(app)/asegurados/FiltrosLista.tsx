"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { IconoBuscar, IconoChevron } from "@/components/iconos";
import { urlAsegurados, type FiltrosAsegurados } from "@/lib/asegurados";
import { RAMOS_CARTERA } from "@/lib/ramos";

/** Búsqueda y filtros de la lista. Cada cambio actualiza la URL (se puede compartir y volver). */
export function FiltrosLista({
  filtros,
  companias,
  localidades,
}: {
  filtros: FiltrosAsegurados;
  companias: string[];
  localidades: string[];
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [mas, setMas] = useState(Boolean(filtros.loc || filtros.tipo));
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  const ir = (cambios: Partial<FiltrosAsegurados>) =>
    iniciar(() => router.replace(urlAsegurados(filtros, cambios), { scroll: false }));

  return (
    <form
      className="filtros-lista"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        ir({ q: String(q ?? "").trim() });
      }}
    >
      <div className="filtros-grilla">
        <div className="campo-con-icono">
          <IconoBuscar />
          <input
            type="search"
            name="q"
            aria-label="Buscar por nombre, DNI, CUIT o número de póliza"
            placeholder="Nombre, DNI, CUIT o póliza"
            defaultValue={filtros.q}
            className="campo"
            onChange={(e) => {
              const valor = e.target.value.trim();
              clearTimeout(espera.current);
              espera.current = setTimeout(() => ir({ q: valor }), 350);
            }}
          />
        </div>
        <select aria-label="Ramo" className="campo" value={filtros.ramo} onChange={(e) => ir({ ramo: e.target.value })}>
          <option value="">Ramo: todos</option>
          {RAMOS_CARTERA.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Compañía" className="campo" value={filtros.cia} onChange={(e) => ir({ cia: e.target.value })}>
          <option value="">Compañía: todas</option>
          {companias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Vencimiento"
          className="campo"
          value={filtros.venc}
          onChange={(e) => ir({ venc: e.target.value as FiltrosAsegurados["venc"] })}
        >
          <option value="">Vencimiento: cualquiera</option>
          <option value="7">Próximos 7 días</option>
          <option value="30">Próximos 30 días</option>
          <option value="90">Próximos 90 días</option>
        </select>
        {mas && (
          <>
            <select aria-label="Localidad" className="campo" value={filtros.loc} onChange={(e) => ir({ loc: e.target.value })}>
              <option value="">Localidad: todas</option>
              {localidades.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              aria-label="Tipo de asegurado"
              className="campo"
              value={filtros.tipo}
              onChange={(e) => ir({ tipo: e.target.value as FiltrosAsegurados["tipo"] })}
            >
              <option value="">Tipo: todos</option>
              <option value="persona">Personas</option>
              <option value="empresa">Empresas</option>
            </select>
          </>
        )}
      </div>
      <button type="button" className="boton-texto" aria-expanded={mas} onClick={() => setMas((m) => !m)}>
        <span className={mas ? "chevron chevron-arriba" : "chevron"}>
          <IconoChevron size={14} />
        </span>
        {mas ? "Mostrar menos filtros" : "Mostrar más filtros (2)"}
      </button>
    </form>
  );
}
