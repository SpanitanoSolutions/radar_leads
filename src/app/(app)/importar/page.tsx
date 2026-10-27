import { obtenerCartera } from "@/lib/datos";
import { FormCartera } from "./FormCartera";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function Importar() {
  const polizas = await obtenerCartera();
  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Importar cartera</h1>
          <p className="subtitulo">Subí la planilla de tus asegurados y pólizas.</p>
        </div>
      </header>
      <FormCartera hayCartera={polizas.length > 0} />
    </>
  );
}
