import { Bitacora } from "@/components/agentes/Agente";
import type { ValidadorCorrida } from "@/db/schema";
import { diaYHora } from "@/lib/fechas";

const ESTADO: Record<string, { texto: string; tono: string }> = {
  en_curso: { texto: "En curso", tono: "azul" },
  ok: { texto: "OK", tono: "verde" },
  con_errores: { texto: "Con errores", tono: "rojo" },
};

const duracion = (c: ValidadorCorrida) => {
  if (!c.terminadaEl) return null;
  const segundos = Math.max(1, Math.round((c.terminadaEl.getTime() - c.iniciadaEl.getTime()) / 1000));
  return segundos < 60 ? `${segundos} s` : `${Math.round(segundos / 60)} min`;
};

/** Actividad: cada corrida (cuándo, quién la pidió, cómo terminó, qué falló) y la bitácora del agente. */
export function ActividadValidador({ corridas, actividad }: { corridas: ValidadorCorrida[]; actividad: { id: number; fecha: Date; texto: string }[] }) {
  return (
    <>
      <section aria-labelledby="t-corridas" className="tarjeta">
        <div className="lista-cabecera">
          <h2 id="t-corridas" className="lista-titulo">
            Corridas
          </h2>
          <span className="texto-suave">La validación trae y cruza; el enriquecimiento lee con IA lo pendiente y resume el día.</span>
        </div>
        {corridas.length === 0 ? (
          <p className="vacio">Todavía no hubo corridas. Tocá “Ejecutar validación” o esperá la automática.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta tabla-corridas">
              <thead>
                <tr>
                  <th scope="col">Inicio</th>
                  <th scope="col">Etapa</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="numero">
                    Compañías
                  </th>
                  <th scope="col" className="numero">
                    Cuotas actualizadas
                  </th>
                  <th scope="col">Resumen y errores</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map((c) => {
                  const estado = ESTADO[c.estado] ?? { texto: c.estado, tono: "gris" };
                  return (
                    <tr key={c.id}>
                      <td className="tabular">
                        <div>{diaYHora(c.iniciadaEl)}</div>
                        {duracion(c) && <div className="celda-secundaria">{duracion(c)}</div>}
                      </td>
                      <td>
                        <div>{c.etapa === "enriquecimiento" ? "Enriquecimiento" : "Validación"}</div>
                        <div className="celda-secundaria">{c.origen === "cron" ? "Automática" : "Pedida por vos"}</div>
                      </td>
                      <td>
                        <span className={`pastilla pastilla-${estado.tono}`}>{estado.texto}</span>
                        {c.estado === "en_curso" && <div className="celda-secundaria tabular">{c.progreso} %</div>}
                      </td>
                      <td className="numero tabular">{c.etapa === "validacion" ? c.companiasProcesadas : "—"}</td>
                      <td className="numero tabular">{c.etapa === "validacion" ? c.cuotasActualizadas : "—"}</td>
                      <td className="celda-resumen">
                        {c.resumen && <p>{c.resumen}</p>}
                        {c.errores.length > 0 && (
                          <ul className="errores-corrida">
                            {c.errores.map((e, i) => (
                              <li key={i}>
                                {e.compania && <span className="celda-fuerte">{e.compania}: </span>}
                                {e.mensaje}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Bitacora actividad={actividad} />
    </>
  );
}
