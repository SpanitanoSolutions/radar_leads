import { calcularResultados, type FilaResultados } from "@/lib/cierre";
import { obtenerLeads, obtenerSectores } from "@/lib/datos";
import { pesos, porcentaje } from "@/lib/formato";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function Resultados() {
  const [leads, sectores] = await Promise.all([obtenerLeads(), obtenerSectores()]);
  const { total, porOrigen, porSector } = calcularResultados(
    leads,
    Object.fromEntries(sectores.map((s) => [s.id, s.nombre])),
  );

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Resultados</h1>
          <p className="subtitulo">Qué fuentes y sectores se convierten en clientes. No incluye los leads de ejemplo.</p>
        </div>
      </header>

      <section aria-label="Resumen" className="kpis">
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Contactados</span>
          <span className="kpi-valor">
            {total.contactados} <span className="kpi-detalle">de {total.leads}</span>
          </span>
        </div>
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Reuniones</span>
          <span className="kpi-valor">{total.reuniones}</span>
        </div>
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Cerrados</span>
          <span className="kpi-valor kpi-valor-acento">{total.cerrados}</span>
        </div>
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Comisión total</span>
          <span className="kpi-valor">{pesos(total.comision)}</span>
        </div>
      </section>

      <TablaResultados titulo="Por fuente" columna="Fuente" filas={porOrigen} />
      <TablaResultados titulo="Por sector" columna="Sector" filas={porSector} />

      <p className="nota-info">
        Contactado: se marcó Llamado, Reunión o Cerrado, o se descartó por un motivo que implica haber llamado.
        Conversión: cerrados sobre el total de leads y sobre los contactados.
      </p>
    </>
  );
}

function TablaResultados({ titulo, columna, filas }: { titulo: string; columna: string; filas: FilaResultados[] }) {
  return (
    <section className="tarjeta" aria-label={titulo}>
      <h2 className="titulo-seccion tarjeta-padding">{titulo}</h2>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">{columna}</th>
              <th scope="col">Leads</th>
              <th scope="col">Contactados</th>
              <th scope="col">Reuniones</th>
              <th scope="col">Cerrados</th>
              <th scope="col">Descartados</th>
              <th scope="col">Comisión</th>
              <th scope="col">Conversión</th>
              <th scope="col">Sobre contactados</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td className="celda-principal">{f.nombre}</td>
                <td>{f.leads}</td>
                <td>{f.contactados}</td>
                <td>{f.reuniones}</td>
                <td>{f.cerrados}</td>
                <td>{f.descartados}</td>
                <td>{pesos(f.comision)}</td>
                <td>{porcentaje(f.conversion)}</td>
                <td>{porcentaje(f.conversionContactados)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <p className="vacio">Todavía no hay leads reales.</p>}
      </div>
    </section>
  );
}
