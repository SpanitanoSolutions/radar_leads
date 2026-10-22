import Link from "next/link";
import { IconoEstrella, IconoUbicacion } from "@/components/iconos";
import { nombreEstado, ZONAS } from "@/lib/catalogos";
import { obtenerAjustes, obtenerLeads, obtenerSectores } from "@/lib/datos";
import { etiquetaEvento } from "@/lib/evento";
import { MOTIVOS_DESCARTE } from "@/lib/cierre";
import { busquedaManual, enlaceTelefono } from "@/lib/contacto";
import { diaEnArgentina, diaYMes, fechaLarga, haceCuanto } from "@/lib/fechas";
import {
  aplicarFiltros,
  calcularKpis,
  contarPorSector,
  contarPorZona,
  leadsVisibles,
  estaPospuesto,
  leerFiltros,
  ordenarParaHoy,
  urlFiltros,
} from "@/lib/filtros";
import type { EstadoLead } from "@/db/schema";
import { cambiarEstado, descartarLead, posponerLead } from "./actions";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const CLASE_ESTADO: Record<EstadoLead, string> = {
  nuevo: "pastilla-azul",
  llamado: "pastilla-gris",
  reunion: "pastilla-ambar",
  cerrado: "pastilla-verde",
  descartado: "pastilla-gris",
};

export default async function LeadsDelDia({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leerFiltros(await searchParams);
  const [sectores, ajustes, todos] = await Promise.all([
    obtenerSectores(),
    obtenerAjustes(),
    obtenerLeads(),
  ]);

  const visibles = leadsVisibles(todos, sectores, ajustes);
  const hoy = diaEnArgentina(new Date());
  const lista = ordenarParaHoy(aplicarFiltros(visibles, filtros), hoy);
  const porSector = contarPorSector(visibles, filtros);
  const porZona = contarPorZona(visibles, filtros);
  const sectoresActivos = sectores.filter((s) => s.activo);
  const zonasActivas = ZONAS.filter((z) => ajustes.zonas[z.id]);
  const hayEjemplos = todos.some((l) => l.esEjemplo);

  const kpis = calcularKpis(visibles);

  const totalZona = (id: string) =>
    id === "todas"
      ? [...porZona.values()].reduce((a, b) => a + b, 0)
      : (porZona.get(id as never) ?? 0);
  const totalSector = (id: string) =>
    id === "todos"
      ? [...porSector.values()].reduce((a, b) => a + b, 0)
      : (porSector.get(id) ?? 0);

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <div className="titulo-fila">
            <h1 className="titulo">Leads del día</h1>
            {hayEjemplos && <span className="pastilla pastilla-ambar">Datos de ejemplo</span>}
          </div>
          <p className="subtitulo">
            {fechaLarga()} · Provincia de Buenos Aires · ordenados por probabilidad de cierre
          </p>
        </div>
        <form className="buscador" action="/" role="search">
          {filtros.sector !== "todos" && <input type="hidden" name="sector" value={filtros.sector} />}
          {filtros.zona !== "todas" && <input type="hidden" name="zona" value={filtros.zona} />}
          <label htmlFor="q" className="visualmente-oculto">
            Buscar empresa, localidad o CUIT
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filtros.q}
            placeholder="Empresa, localidad o CUIT"
            className="campo"
          />
          <button type="submit" className="boton boton-primario">
            Buscar
          </button>
        </form>
      </header>

      <section aria-label="Resumen" className="kpis">
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Leads nuevos (7 días)</span>
          <span className="kpi-valor">{kpis.nuevos}</span>
        </div>
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Alta prioridad sin contactar</span>
          <span className="kpi-valor kpi-valor-acento">{kpis.altaSinContactar}</span>
        </div>
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">En seguimiento</span>
          <span className="kpi-valor">{kpis.enSeguimiento}</span>
        </div>
        <div className="tarjeta kpi">
          <span className="kpi-etiqueta">Cerrados</span>
          <span className="kpi-valor">{kpis.cerrados}</span>
        </div>
      </section>

      <div className="tarjeta filtros">
        <nav className="filtro-grupo" aria-labelledby="titulo-sector">
          <h2 id="titulo-sector" className="etiqueta-seccion">Sector</h2>
          <div className="chips">
            <Chip
              href={urlFiltros(filtros, { sector: "todos" })}
              activo={filtros.sector === "todos"}
              texto="Todos"
              cantidad={totalSector("todos")}
            />
            {sectoresActivos.map((s) => (
              <Chip
                key={s.id}
                href={urlFiltros(filtros, { sector: s.id })}
                activo={filtros.sector === s.id}
                texto={s.nombre}
                cantidad={totalSector(s.id)}
                icono={s.principal ? <IconoEstrella /> : undefined}
              />
            ))}
          </div>
        </nav>
        <nav className="filtro-grupo" aria-labelledby="titulo-zona">
          <h2 id="titulo-zona" className="etiqueta-seccion">Zona</h2>
          <div className="chips">
            <Chip
              href={urlFiltros(filtros, { zona: "todas" })}
              activo={filtros.zona === "todas"}
              texto="Toda la provincia"
              cantidad={totalZona("todas")}
              icono={<IconoUbicacion />}
            />
            {zonasActivas.map((z) => (
              <Chip
                key={z.id}
                href={urlFiltros(filtros, { zona: z.id })}
                activo={filtros.zona === z.id}
                texto={z.nombre}
                cantidad={totalZona(z.id)}
                icono={<IconoUbicacion />}
              />
            ))}
          </div>
        </nav>
      </div>

      <section aria-label="Lista de leads" className="tarjeta">
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Score</th>
                <th scope="col">Empresa</th>
                <th scope="col">Por qué es un lead</th>
                <th scope="col">Ramos sugeridos</th>
                <th scope="col">Cuándo</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="visualmente-oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className={`score score-${l.nivel}`} aria-label={`Score ${l.score} de 100`}>
                      {l.score}
                    </span>
                  </td>
                  <td>
                    <div className="celda-principal">{l.empresa}</div>
                    <div className="celda-secundaria">
                      {l.rubro} · {l.localidad}
                    </div>
                    {l.telefono && (
                      <a href={enlaceTelefono(l.telefono)} className="celda-secundaria" style={{ display: "block" }}>
                        {l.telefono}
                      </a>
                    )}
                    {l.sinContacto && (
                      <a
                        href={busquedaManual(l.empresa, l.localidad)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="celda-secundaria"
                        style={{ display: "block" }}
                      >
                        Sin contacto encontrado · buscar
                      </a>
                    )}
                  </td>
                  <td>
                    <div>{l.motivo}</div>
                    <div className="celda-secundaria">Fuente: {l.fuente}</div>
                  </td>
                  <td>
                    <div className="ramos">
                      {l.ramosOrdenados.map((r) => (
                        <span key={r} className="etiqueta-ramo">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {l.fechaEvento ? (
                      <>
                        <div>{etiquetaEvento(l.tipoEvento, l.fechaEvento)}</div>
                        <div className="celda-secundaria">Detectado: {haceCuanto(l.detectadoEl).toLowerCase()}</div>
                      </>
                    ) : (
                      <>Detectado: {haceCuanto(l.detectadoEl).toLowerCase()}</>
                    )}
                  </td>
                  <td>
                    <span className={`pastilla ${CLASE_ESTADO[l.estado]}`}>{nombreEstado(l.estado)}</span>
                    {estaPospuesto(l, hoy) && (
                      <div className="celda-secundaria">Para el {diaYMes(l.recordatorio!)}</div>
                    )}
                  </td>
                  <td>
                    <div className="acciones-rapidas">
                      <Link href={`/leads/${l.id}`} className="boton boton-chico" aria-label={`Ver ${l.empresa}`}>
                        Ver
                      </Link>
                      {l.estado === "nuevo" && (
                        <form action={cambiarEstado}>
                          <input type="hidden" name="id" value={l.id} />
                          <button type="submit" name="estado" value="llamado" className="boton boton-chico">
                            Llamé
                          </button>
                        </form>
                      )}
                      {!estaPospuesto(l, hoy) && (
                        <form action={posponerLead}>
                          <input type="hidden" name="id" value={l.id} />
                          <button type="submit" className="boton boton-chico" title="Recordármelo en una semana">
                            Para después
                          </button>
                        </form>
                      )}
                      <details className="desplegable">
                        <summary className="boton boton-chico">Descartar</summary>
                        <form action={descartarLead} className="form-columna panel-desplegable">
                          <input type="hidden" name="id" value={l.id} />
                          <select name="motivo" className="campo" required defaultValue="" aria-label={`Motivo para descartar ${l.empresa}`}>
                            <option value="" disabled>
                              Motivo
                            </option>
                            {MOTIVOS_DESCARTE.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nombre}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="boton boton-primario boton-chico">
                            Descartar
                          </button>
                        </form>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length === 0 && (
            <p className="vacio">No hay leads con estos filtros. Prueba con otro sector u otra zona.</p>
          )}
        </div>
      </section>
    </>
  );
}

function Chip({
  href,
  activo,
  texto,
  cantidad,
  icono,
}: {
  href: string;
  activo: boolean;
  texto: string;
  cantidad: number;
  icono?: React.ReactNode;
}) {
  return (
    <Link href={href} className="chip" aria-current={activo ? "true" : undefined} scroll={false}>
      {icono}
      <span>{texto}</span>
      <span className="chip-contador">{cantidad}</span>
    </Link>
  );
}
