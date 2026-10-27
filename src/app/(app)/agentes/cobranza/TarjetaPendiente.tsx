"use client";

import { useState } from "react";
import { enlaceLlamada } from "@/lib/asegurados";
import { aprobarMensaje, llameNoAtendio, omitirMensaje, posponerMensaje, registrarPromesa } from "./actions";

export type Pendiente = {
  id: number;
  cliente: string;
  poliza: string;
  monto: string;
  vence: string;
  etiqueta: { texto: string; tono: "aviso" | "vencida" | "llamada" | "problema" };
  canal: string;
  esWhatsApp: boolean;
  porque: string | null;
  texto: string;
  llamada: boolean;
  telefono: string | null;
  manana: string;
};

const CLASE_ETAPA = { aviso: "pastilla-ambar", vencida: "pastilla-rojo", llamada: "pastilla-rojo", problema: "pastilla-rojo" };

export function TarjetaPendiente({ p }: { p: Pendiente }) {
  const [editando, setEditando] = useState(false);
  const titulo = `pendiente-${p.id}`;

  return (
    <article className={p.llamada ? "pendiente pendiente-llamada" : "pendiente"} aria-labelledby={titulo}>
      <div className="pendiente-datos">
        <div className="titulo-fila">
          <span className={`pastilla ${CLASE_ETAPA[p.etiqueta.tono]}`}>{p.etiqueta.texto}</span>
          <span className="nota-pie">{p.canal}</span>
        </div>
        <h2 id={titulo} className="pendiente-cliente">
          {p.cliente}
        </h2>
        <div className="texto-gris-oscuro">{p.poliza}</div>
        <div className="texto-gris-oscuro">
          <span className="celda-fuerte tabular">{p.monto}</span> · {p.vence}
        </div>
        {p.porque && (
          <p className="texto-suave">
            <strong className="texto-gris-oscuro">Por qué ahora:</strong> {p.porque}
          </p>
        )}
      </div>

      <div className="pendiente-mensaje">
        {p.llamada ? (
          <>
            <div className="caja-llamada">
              <div className="caja-llamada-titulo">Te toca llamar a vos</div>
              <div className="texto-gris-oscuro">{p.texto}</div>
              {p.telefono && (
                <a href={enlaceLlamada(p.telefono)} className="celda-fuerte tabular">
                  {p.telefono}
                </a>
              )}
            </div>
            <div className="fila-acciones">
              <details className="desplegable">
                <summary className="boton boton-primario boton-mediano">Registrar promesa de pago</summary>
                <form action={registrarPromesa} className="form-fila panel-desplegable">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="form-columna">
                    <label htmlFor={`promesa-${p.id}`} className="etiqueta">
                      ¿Para cuándo prometió pagar?
                    </label>
                    <input id={`promesa-${p.id}`} type="date" name="fecha" className="campo" min={p.manana} required />
                  </div>
                  <button type="submit" className="boton boton-primario boton-mediano">
                    Guardar
                  </button>
                </form>
              </details>
              <form action={llameNoAtendio}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="boton boton-mediano">
                  Llamé y no atendió
                </button>
              </form>
              <form action={posponerMensaje}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="boton-terciario">
                  Posponer
                </button>
              </form>
            </div>
          </>
        ) : (
          <form action={aprobarMensaje} className="form-columna">
            <input type="hidden" name="id" value={p.id} />
            {editando ? (
              <>
                <label htmlFor={`texto-${p.id}`} className="etiqueta">
                  Mensaje
                </label>
                <textarea id={`texto-${p.id}`} name="texto" rows={6} className="campo" defaultValue={p.texto} autoFocus />
              </>
            ) : (
              <div className={p.esWhatsApp ? "burbuja burbuja-whatsapp" : "burbuja"}>{p.texto}</div>
            )}
            <div className="fila-acciones">
              <button type="submit" className="boton boton-primario boton-mediano">
                {editando ? "Guardar y enviar" : "Aprobar y enviar"}
              </button>
              {editando ? (
                <button type="button" className="boton boton-mediano" onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              ) : (
                <button type="button" className="boton boton-mediano" onClick={() => setEditando(true)}>
                  Editar
                </button>
              )}
              {!editando && (
                <button type="submit" formAction={omitirMensaje} className="boton-terciario">
                  Omitir
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
