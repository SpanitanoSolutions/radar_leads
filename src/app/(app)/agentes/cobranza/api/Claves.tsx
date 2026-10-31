"use client";

import { useActionState } from "react";
import { BotonCopiar } from "@/components/BotonCopiar";
import { generarClave } from "./actions";

/** Genera una clave y la muestra una sola vez. */
export function GenerarClave() {
  const [estado, accion, pendiente] = useActionState(generarClave, null);
  return (
    <div className="form-columna">
      <form action={accion} className="titulo-fila">
        <label className="visualmente-oculto" htmlFor="clave-nombre">
          Nombre de la clave
        </label>
        <input id="clave-nombre" name="nombre" className="campo" placeholder="Para qué es (ej.: n8n, planilla)" maxLength={80} />
        <button type="submit" className="boton boton-primario boton-mediano" disabled={pendiente}>
          {pendiente ? "Generando…" : "Generar API key"}
        </button>
      </form>
      {estado?.clave && (
        <div className="cob-clave" role="status">
          <span className="celda-fuerte">Copiala ahora: no se vuelve a mostrar.</span>
          <code>{estado.clave}</code>
          <BotonCopiar texto={estado.clave} etiqueta="Copiar clave" />
        </div>
      )}
    </div>
  );
}

export function Imprimir() {
  return (
    <button type="button" className="boton boton-mediano cob-no-imprimir" onClick={() => window.print()}>
      Imprimir / Guardar PDF
    </button>
  );
}
