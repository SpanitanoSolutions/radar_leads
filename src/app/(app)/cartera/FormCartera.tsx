"use client";

import { useActionState } from "react";
import { analizarArchivoCartera, type EstadoCartera } from "./actions";

function fecha(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function FormCartera() {
  const [estado, analizar, analizando] = useActionState<EstadoCartera, FormData>(analizarArchivoCartera, {});
  const a = estado.analisis;

  return (
    <>
      <form action={analizar} className="tarjeta tarjeta-padding form-columna">
        <label htmlFor="archivo" className="etiqueta">
          Archivo de la cartera (CSV)
        </label>
        <input id="archivo" name="archivo" type="file" accept=".csv,.txt,text/csv" className="campo" required />
        <p className="nota-info">
          Columnas que reconoce: Cliente, CUIT, Ramo (uno o varios separados por coma), Compañía y Vencimiento.
          Desde Excel: Archivo → Guardar como → CSV. El archivo se analiza en el momento y no se guarda.
        </p>
        <button type="submit" className="boton boton-primario" disabled={analizando}>
          {analizando ? "Analizando…" : "Analizar cartera"}
        </button>
        {estado.error && (
          <p className="mensaje-error" role="alert">
            {estado.error}
          </p>
        )}
      </form>

      {a && (
        <>
          <p className="nota-info" role="status">
            {a.clientes} clientes · {a.vencimientos.length} pólizas vencen en los próximos 60 días · {a.unSoloRamo.length}{" "}
            clientes con un solo ramo.
          </p>
          {estado.avisos?.map((aviso) => (
            <p key={aviso} className="nota-info">
              {aviso}
            </p>
          ))}

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
        </>
      )}
    </>
  );
}
