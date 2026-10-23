import { FormCartera } from "./FormCartera";

// Pantalla privada: se arma en cada pedido.
export const instant = false;

export default function Cartera() {
  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Mi cartera</h1>
          <p className="subtitulo">
            Subí la planilla de clientes para ver qué vence en los próximos 60 días y a quién ofrecerle otro ramo.
          </p>
        </div>
      </header>
      <FormCartera />
    </>
  );
}
