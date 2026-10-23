import { analizarCartera } from "@/lib/cartera";
import { obtenerCartera } from "@/lib/datos";
import { diaEnArgentina, haceCuanto } from "@/lib/fechas";
import { borrarCartera } from "./actions";
import { FormCartera } from "./FormCartera";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

function fecha(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export default async function Cartera() {
  const polizas = await obtenerCartera();
  const a = analizarCartera(polizas, diaEnArgentina(new Date()));
  const cargada = polizas[0]?.cargadoEl;

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Mi cartera</h1>
          <p className="subtitulo">
            {cargada
              ? `${a.clientes} clientes y ${polizas.length} pólizas · cargada ${haceCuanto(cargada).toLowerCase()}`
              : "Subí la planilla de clientes para ver qué vence y a quién ofrecerle otro ramo."}
          </p>
        </div>
      </header>

      <FormCartera hayCartera={polizas.length > 0} />

      {polizas.length > 0 && (
        <>
          <section className="tarjeta" aria-labelledby="t-vencimientos">
            <h2 id="t-vencimientos" className="titulo-seccion tarjeta-padding">
              Vencimientos de los próximos 60 días
            </h2>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Vence</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Ramos</th>
                    <th scope="col">Compañía</th>
                  </tr>
                </thead>
                <tbody>
                  {a.vencimientos.map((p, i) => (
                    <tr key={`${p.cliente}-${i}`}>
                      <td>
                        <div className="celda-principal">{fecha(p.vencimiento!)}</div>
                        <div className="celda-secundaria">{p.dias === 0 ? "Hoy" : `En ${p.dias} días`}</div>
                      </td>
                      <td>{p.cliente}</td>
                      <td>{p.ramos.join(", ")}</td>
                      <td>{p.compania}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.vencimientos.length === 0 && <p className="vacio">No hay vencimientos en los próximos 60 días.</p>}
            </div>
          </section>

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

          <details className="desplegable">
            <summary className="boton">Borrar la cartera guardada</summary>
            <form action={borrarCartera} className="form-columna panel-desplegable">
              <p className="nota-info">Se borran todas las pólizas cargadas. No se puede deshacer.</p>
              <button type="submit" className="boton boton-primario">
                Sí, borrar la cartera
              </button>
            </form>
          </details>
        </>
      )}
    </>
  );
}
