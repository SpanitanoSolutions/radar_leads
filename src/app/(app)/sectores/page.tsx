import { IconoEstrella } from "@/components/iconos";
import { ALCANCES, FUENTES, PRIORIDADES, ZONAS } from "@/lib/catalogos";
import { obtenerAjustes, obtenerSectores } from "@/lib/datos";
import { guardarAjustes } from "../actions";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const ESTADO_FUENTE = {
  activa: { texto: "Activa", clase: "pastilla-verde" },
  "por-configurar": { texto: "Por configurar", clase: "pastilla-ambar" },
  manual: { texto: "Manual", clase: "pastilla-gris" },
  "sin-datos": { texto: "Sin datos utilizables", clase: "pastilla-gris" },
};

export default async function MisSectores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sectores, ajustes] = await Promise.all([obtenerSectores(), obtenerAjustes()]);
  const guardado = (await searchParams).guardado === "1";

  return (
    <form action={guardarAjustes} style={{ display: "contents" }}>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Mis sectores</h1>
          <p className="subtitulo">
            Elige qué tipo de empresas quieres ver y cuánto pesa cada sector en el score.
          </p>
        </div>
        <button type="submit" className="boton boton-primario">
          Guardar cambios
        </button>
      </header>

      {guardado && (
        <p className="mensaje-ok" role="status">
          Cambios guardados. La lista de leads ya usa esta configuración.
        </p>
      )}

      <section className="tarjeta" aria-label="Sectores">
        <div className="tabla-scroll">
          <table className="tabla tabla-sectores" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th scope="col">Sector</th>
                <th scope="col">Ramos típicos</th>
                <th scope="col">Prioridad</th>
                <th scope="col">Activo</th>
              </tr>
            </thead>
            <tbody>
              {sectores.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="celda-principal titulo-fila" style={{ gap: 8 }}>
                      {s.principal && (
                        <span style={{ color: "var(--acento)", display: "inline-flex" }}>
                          <IconoEstrella />
                        </span>
                      )}
                      {s.nombre}
                    </div>
                    <div className="celda-secundaria">{s.ejemplos}</div>
                  </td>
                  <td>{s.ramosTipicos}</td>
                  <td>
                    <fieldset className="segmentado">
                      <legend className="visualmente-oculto">Prioridad de {s.nombre}</legend>
                      {PRIORIDADES.map((p) => (
                        <PrioridadOpcion
                          key={p.id}
                          sector={s.id}
                          valor={p.id}
                          texto={p.nombre}
                          marcada={s.prioridad === p.id}
                        />
                      ))}
                    </fieldset>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      role="switch"
                      name={`activo_${s.id}`}
                      defaultChecked={s.activo}
                      className="interruptor"
                      aria-label={`Mostrar ${s.nombre}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="columnas">
        <section className="tarjeta tarjeta-padding" style={{ flex: "1 1 400px", minWidth: 0 }}>
          <fieldset className="opciones">
            <legend>Zona de las empresas</legend>
            {ZONAS.map((z) => (
              <label key={z.id} className="opcion">
                <input type="checkbox" name={`zona_${z.id}`} defaultChecked={ajustes.zonas[z.id]} />
                <span>
                  <span className="opcion-nombre">{z.nombre}</span>
                  <span className="opcion-detalle">{z.detalle}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="opciones">
            <legend>Alcance de licitaciones</legend>
            {ALCANCES.map((a) => (
              <label key={a.id} className="opcion">
                <input
                  type="checkbox"
                  name={`licitacion_${a.id}`}
                  defaultChecked={ajustes.licitaciones[a.id]}
                />
                <span>
                  <span className="opcion-nombre">{a.nombre}</span>
                  <span className="opcion-detalle">{a.detalle}</span>
                </span>
              </label>
            ))}
            <p className="nota-info">
              Las licitaciones provinciales y nacionales se muestran cuando la empresa ganadora tiene
              domicilio en la zona elegida o la obra se hace dentro de ella.
            </p>
          </fieldset>
        </section>

        <section
          className="tarjeta tarjeta-padding"
          style={{ flex: "2 1 480px", minWidth: 0 }}
          aria-labelledby="t-fuentes"
        >
          <h2 id="t-fuentes" className="titulo-seccion">Fuentes de datos</h2>
          <ul className="lista-fuentes">
            {FUENTES.map((f) => (
              <li key={f.nombre}>
                <span>
                  <span className="opcion-nombre" style={{ display: "block" }}>
                    {f.nombre}
                  </span>
                  <span className="opcion-detalle">{f.detalle}</span>
                </span>
                <span className={`pastilla ${ESTADO_FUENTE[f.estado].clase}`}>
                  {ESTADO_FUENTE[f.estado].texto}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </form>
  );
}

function PrioridadOpcion({
  sector,
  valor,
  texto,
  marcada,
}: {
  sector: string;
  valor: string;
  texto: string;
  marcada: boolean;
}) {
  const id = `prioridad_${sector}_${valor}`;
  return (
    <>
      <input type="radio" id={id} name={`prioridad_${sector}`} value={valor} defaultChecked={marcada} />
      <label htmlFor={id}>{texto}</label>
    </>
  );
}
