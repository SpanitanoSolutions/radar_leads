import { analizarCartera } from "@/lib/cartera";
import { obtenerCartera } from "@/lib/datos";
import { diaEnArgentina } from "@/lib/fechas";
import { fechaCorta } from "@/lib/menu";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function Vencimientos() {
  const polizas = await obtenerCartera();
  const { vencimientos } = analizarCartera(polizas, diaEnArgentina(new Date()));

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Vencimientos</h1>
          <p className="subtitulo">Pólizas que vencen en los próximos 60 días, la más cercana primero.</p>
        </div>
      </header>

      <section className="tarjeta" aria-label="Pólizas que vencen">
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
              {vencimientos.map((p, i) => (
                <tr key={`${p.cliente}-${i}`}>
                  <td>
                    <div className="celda-principal">{fechaCorta(p.vencimiento!)}</div>
                    <div className="celda-secundaria">{p.dias === 0 ? "Hoy" : `En ${p.dias} días`}</div>
                  </td>
                  <td>{p.cliente}</td>
                  <td>{p.ramos.join(", ")}</td>
                  <td>{p.compania}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {vencimientos.length === 0 && <p className="vacio">No hay vencimientos en los próximos 60 días.</p>}
        </div>
      </section>
    </>
  );
}
