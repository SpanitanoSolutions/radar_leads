import Link from "next/link";
import { IconoSubir } from "@/components/iconos";
import { analizarCartera } from "@/lib/cartera";
import { obtenerCartera } from "@/lib/datos";
import { diaEnArgentina, haceCuanto } from "@/lib/fechas";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function Asegurados() {
  const polizas = await obtenerCartera();
  const a = analizarCartera(polizas, diaEnArgentina(new Date()));
  const cargada = polizas[0]?.cargadoEl;

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Asegurados</h1>
          <p className="subtitulo">
            {cargada
              ? `${a.clientes} clientes y ${polizas.length} pólizas · cargada ${haceCuanto(cargada).toLowerCase()}`
              : "Importá tu cartera para ver qué vence y a quién ofrecerle otro ramo."}
          </p>
        </div>
        <Link href="/importar" className="boton">
          <IconoSubir size={16} />
          Importar cartera
        </Link>
      </header>

      {polizas.length > 0 && (
        <section className="tarjeta" aria-labelledby="t-cruzada">
          <h2 id="t-cruzada" className="titulo-seccion tarjeta-padding">
            Clientes con un solo ramo: venta cruzada
          </h2>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tiene</th>
                  <th scope="col">Ofrecerle</th>
                </tr>
              </thead>
              <tbody>
                {a.unSoloRamo.map((c, i) => (
                  <tr key={`${c.cliente}-${i}`}>
                    <td>{c.cliente}</td>
                    <td>{c.ramo}</td>
                    <td>{c.sugerencias.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.unSoloRamo.length === 0 && <p className="vacio">Todos los clientes tienen más de un ramo.</p>}
          </div>
        </section>
      )}
    </>
  );
}
