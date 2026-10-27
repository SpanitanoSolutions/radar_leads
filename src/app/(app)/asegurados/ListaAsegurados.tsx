"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { IconoAlerta, IconoSiguiente } from "@/components/iconos";
import type { Alerta } from "@/lib/asegurados";
import { avisarVencimientoLote } from "./actions";

export type FilaVista = {
  id: number;
  nombre: string;
  sub: string;
  documento: string;
  alertas: Alerta[];
  ramos: string[];
  ramosMas: string;
  compania: string;
  companiasMas: string;
  vence: string;
  diasTexto: string;
  diasTono: "rojo" | "ambar" | "gris";
  prima: string;
  href: string;
};

/** Tabla de asegurados con selección y acciones en lote. */
export function ListaAsegurados({ filas, abierto }: { filas: FilaVista[]; abierto: number | null }) {
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const visibles = filas.filter((f) => seleccion.has(f.id));
  const todos = filas.length > 0 && visibles.length === filas.length;

  const alternar = (id: number) =>
    setSeleccion((s) => {
      const nueva = new Set(s);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });

  function avisar() {
    const ids = visibles.map((f) => f.id);
    iniciar(async () => {
      const r = await avisarVencimientoLote(ids);
      setResultado(
        `${r.preparados === 1 ? "1 aviso preparado" : `${r.preparados} avisos preparados`}: revisalos y aprobalos en Vencimientos.` +
          (r.sinContacto ? ` ${r.sinContacto} sin teléfono ni email o sin vencimientos.` : ""),
      );
      setSeleccion(new Set());
    });
  }

  return (
    <>
      {visibles.length > 0 && (
        <div className="barra-seleccion">
          <span className="barra-seleccion-texto">
            {visibles.length === 1 ? "1 asegurado seleccionado" : `${visibles.length} asegurados seleccionados`}
          </span>
          <button type="button" className="boton boton-chico boton-borde-acento" onClick={avisar} disabled={enviando}>
            {enviando ? "Preparando…" : "Enviar aviso de vencimiento"}
          </button>
          <a
            className="boton boton-chico boton-borde-acento"
            href={`/asegurados/exportar?ids=${visibles.map((f) => f.id).join(",")}`}
            download
          >
            Exportar selección
          </a>
          <button type="button" className="boton-texto boton-texto-derecha" onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </button>
        </div>
      )}
      {resultado && (
        <p className="aviso aviso-ok aviso-en-lista" role="status">
          {resultado}
        </p>
      )}

      <div className="tabla-scroll">
        <table className="tabla tabla-asegurados">
          <thead>
            <tr>
              <th scope="col" className="celda-check">
                <label className="check">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={todos}
                    onChange={() => setSeleccion(todos ? new Set() : new Set(filas.map((f) => f.id)))}
                  />
                </label>
              </th>
              <th scope="col">Alertas</th>
              <th scope="col">Asegurado</th>
              <th scope="col">DNI / CUIT</th>
              <th scope="col">Ramos</th>
              <th scope="col">Compañías</th>
              <th scope="col">Próx. vencimiento</th>
              <th scope="col" className="numero">
                Prima anual
              </th>
              <th scope="col">
                <span className="visualmente-oculto">Ver detalle</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={f.id === abierto ? "fila-abierta" : seleccion.has(f.id) ? "fila-marcada" : undefined}>
                <td className="celda-check">
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${f.nombre}`}
                      checked={seleccion.has(f.id)}
                      onChange={() => alternar(f.id)}
                    />
                  </label>
                </td>
                <td>
                  <div className="alertas">
                    {f.alertas.map((a) => (
                      <span key={a.texto} className={`alerta alerta-${a.tono}`}>
                        <IconoAlerta tipo={a.icono} />
                        {a.texto}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <Link href={f.href} scroll={false} className="nombre-asegurado" id={`abrir-${f.id}`}>
                    {f.nombre}
                  </Link>
                  <div className="celda-secundaria">{f.sub}</div>
                </td>
                <td className="tabular">{f.documento}</td>
                <td>
                  <div className="ramos">
                    {f.ramos.map((r) => (
                      <span key={r} className="etiqueta-ramo">
                        {r}
                      </span>
                    ))}
                    {f.ramosMas && <span className="mas-items">{f.ramosMas}</span>}
                  </div>
                </td>
                <td>
                  {f.compania} {f.companiasMas && <span className="mas-items">{f.companiasMas}</span>}
                </td>
                <td>
                  <div className="tabular celda-fuerte">{f.vence}</div>
                  <div className={`dias dias-${f.diasTono}`}>{f.diasTexto}</div>
                </td>
                <td className="numero tabular">{f.prima}</td>
                <td>
                  <Link href={f.href} scroll={false} className="boton-icono" aria-label={`Ver detalle de ${f.nombre}`} tabIndex={-1}>
                    <IconoSiguiente />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <p className="vacio">Ningún asegurado coincide con estos filtros.</p>}
      </div>
    </>
  );
}
