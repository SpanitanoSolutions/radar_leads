"use client";

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
