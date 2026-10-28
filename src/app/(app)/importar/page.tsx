import { obtenerClavesDeAsegurados, obtenerClavesDePolizas, obtenerHayEjemplos, obtenerImportaciones } from "@/lib/datos-cartera";
import { diaEnArgentina, fechaCorta } from "@/lib/fechas";
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

      {importaciones.length > 0 && (
        <section className="tarjeta" aria-labelledby="t-importaciones">
          <div className="lista-cabecera">
            <h2 id="t-importaciones" className="lista-titulo">
              Últimas importaciones
            </h2>
          </div>
          <ul className="lista-importaciones">
            {importaciones.map((i) => (
              <li key={i.id}>
                <span className="tabular texto-gris">{fechaCorta(diaEnArgentina(i.fecha))}</span>
                <span className="celda-fuerte">{i.archivo}</span>
                <span className="texto-suave">
                  {i.resumen
                    ? `${i.resumen.aseguradosNuevos} asegurados nuevos, ${i.resumen.aseguradosActualizados} actualizados · ${
                        i.resumen.polizasNuevas + i.resumen.polizasActualizadas
                      } pólizas` + (i.resumen.dadosDeBaja ? ` · ${i.resumen.dadosDeBaja} dadas de baja` : "")
                    : `${i.filas} filas`}
                  {i.errores ? ` · ${i.errores} filas con problemas` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
