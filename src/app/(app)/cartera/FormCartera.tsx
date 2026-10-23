"use client";

import { useActionState } from "react";
import { guardarCartera, type EstadoCartera } from "./actions";

/** Subir la planilla: reemplaza la cartera guardada. El análisis lo muestra la página. */
export function FormCartera({ hayCartera }: { hayCartera: boolean }) {
  const [estado, subir, subiendo] = useActionState<EstadoCartera, FormData>(guardarCartera, {});

  return (
    <form action={subir} className="tarjeta tarjeta-padding form-columna">
      <label htmlFor="archivo" className="etiqueta">
        {hayCartera ? "Actualizar la cartera (CSV)" : "Archivo de la cartera (CSV)"}
      </label>
      <input id="archivo" name="archivo" type="file" accept=".csv,.txt,text/csv" className="campo" required />
      <p className="nota-info">
        Columnas que reconoce: Cliente, CUIT, Ramo (uno o varios separados por coma), Compañía y Vencimiento.
        Desde Excel: Archivo → Guardar como → CSV.
        {hayCartera && " La planilla nueva reemplaza a la anterior."}
      </p>
      <button type="submit" className="boton boton-primario" disabled={subiendo}>
        {subiendo ? "Guardando…" : hayCartera ? "Reemplazar cartera" : "Guardar cartera"}
      </button>
      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}
      {estado.guardadas !== undefined && (
        <p className="mensaje-ok" role="status">
          Cartera guardada: {estado.guardadas} pólizas.
        </p>
      )}
      {estado.avisos?.map((aviso) => (
        <p key={aviso} className="nota-info">
          {aviso}
        </p>
      ))}
    </form>
  );
}
