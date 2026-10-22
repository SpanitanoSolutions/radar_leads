"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";

export function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  return (
    <form action={accion} className="form-columna">
      <label htmlFor="clave" className="etiqueta">
        Contraseña
      </label>
      <input
        id="clave"
        name="clave"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className="campo"
        aria-describedby={estado.error ? "error-clave" : undefined}
      />
      {estado.error && (
        <p id="error-clave" role="alert" className="mensaje-error">
          {estado.error}
        </p>
      )}
      <button type="submit" className="boton boton-primario" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
