"use client";

import { createContext, startTransition, useActionState, useContext } from "react";
import { useFormStatus } from "react-dom";

// Formularios que comparten varias pantallas: el botón que se deshabilita
// mientras envía, el formulario que muestra el error de la acción al lado y
// el botón que pide confirmación antes de borrar.

/** Lo que devuelve una acción de FormConError: si sale bien, redirige y no vuelve. */
export type EstadoForm = { error?: string };

/** Si el formulario se está enviando, cuando lo envía FormConError (ahí useFormStatus no se entera). */
const Enviando = createContext<boolean | null>(null);

/** El botón de un formulario, deshabilitado mientras se envía. */
export function BotonEnviar({ texto, enviando, className = "boton boton-primario boton-mediano" }: { texto: string; enviando: string; className?: string }) {
  const { pending } = useFormStatus();
  const ocupado = useContext(Enviando) ?? pending;
  return (
    <button type="submit" className={className} disabled={ocupado}>
      {ocupado ? enviando : texto}
    </button>
  );
}

/**
 * Un formulario cuya acción devuelve el error para mostrarlo al lado; si sale
 * bien, la acción redirige. Se envía desde onSubmit y no con `action`: con
 * `action`, React vacía los campos al terminar aunque haya error, y se pierde
 * lo que cargó el productor.
 */
export function FormConError({
  accion,
  className,
  children,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  className?: string;
  children: React.ReactNode;
}) {
  const [estado, enviar, ocupado] = useActionState(accion, {});
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => enviar(datos));
      }}
    >
      <Enviando value={ocupado}>{children}</Enviando>
      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}
    </form>
  );
}

/** Un botón que manda su formulario solo si el productor lo confirma (para borrar). */
export function BotonConfirmar({
  accion,
  campos,
  texto,
  pregunta,
  className = "boton-texto boton-texto-peligro",
}: {
  accion: (formData: FormData) => Promise<void>;
  campos: Record<string, string | number>;
  texto: string;
  pregunta: string;
  className?: string;
}) {
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!window.confirm(pregunta)) e.preventDefault();
      }}
    >
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <button type="submit" className={className}>
        {texto}
      </button>
    </form>
  );
}
