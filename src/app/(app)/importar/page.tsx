import { obtenerClavesDeAsegurados, obtenerClavesDePolizas, obtenerHayEjemplos, obtenerImportaciones } from "@/lib/datos-cartera";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { AsistenteImportar } from "./AsistenteImportar";
import "./importar.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function Importar() {
  const [cargados, polizasCargadas, importaciones, hayEjemplos] = await Promise.all([
    obtenerClavesDeAsegurados(),
    obtenerClavesDePolizas(),
    obtenerImportaciones(),
    obtenerHayEjemplos(),
  ]);
  const hoy = diaEnArgentina(new Date());

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Importar cartera</h1>
          <p className="subtitulo">
            Subí el archivo que exportás de cada compañía. Los asegurados se actualizan por DNI o CUIT, nunca se duplican.
          </p>
        </div>
      </header>

      <AsistenteImportar hoy={hoy} cargados={cargados} polizasCargadas={polizasCargadas} hayEjemplos={hayEjemplos} />

      <section className="tarjeta" id="historial" aria-labelledby="t-importaciones">
        <div className="lista-cabecera">
          <h2 id="t-importaciones" className="lista-titulo">Historial de importaciones</h2>
        </div>
        {importaciones.length ? (
          <ul className="lista-importaciones">
            {importaciones.map((i) => (
              <li key={i.id}>
                <time dateTime={i.fecha.toISOString()} className="tabular texto-gris">{fechaCorta(diaEnArgentina(i.fecha))} · {diaYHora(i.fecha).slice(6)}</time>
                <strong className="celda-fuerte">{i.archivo}</strong>
                <span className="importacion-modo">{i.modo === "reemplazar" ? "Reemplazó la cartera" : "Combinó con la cartera"}</span>
                <span className="texto-suave">
                  {`${i.filas} filas procesadas`}
                  {i.resumen
                    ? ` · ${i.resumen.aseguradosNuevos} asegurados nuevos, ${i.resumen.aseguradosActualizados} actualizados · ${i.resumen.polizasNuevas} pólizas nuevas, ${i.resumen.polizasActualizadas} actualizadas` + (i.resumen.dadosDeBaja ? ` · ${i.resumen.dadosDeBaja} dadas de baja` : "")
                    : ""}
                  {i.errores ? ` · ${i.errores} filas con errores` : ""}
                  {i.advertencias ? ` · ${i.advertencias} advertencias` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="texto-con-margen">Todavía no hay importaciones registradas.</p>}
      </section>
    </>
  );
}
