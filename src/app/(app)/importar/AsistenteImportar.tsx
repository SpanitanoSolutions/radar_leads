"use client";

import { useActionState, useMemo, useState } from "react";
import { bajarCsv, PasosAsistente, TablaMapeo, VistaPrevia, ZonaArchivo } from "@/components/importacion/Asistente";
import { aCsv } from "@/lib/csv";
import {
  CAMPOS_CARTERA,
  companiasDelArchivo,
  filasParaCorregir,
  leerArchivoTabla,
  obligatoriosSinColumna,
  resumirCartera,
  sugerirMapeo,
  TAMANO_MAXIMO_ARCHIVO,
  validarCartera,
  type CampoCartera,
  type Tabla,
} from "@/lib/importacion";
import { unirConY } from "@/lib/asegurados";
import { RAMOS_CARTERA } from "@/lib/ramos";
import { importarCartera, type EstadoImportacion } from "./actions";

const PASOS = ["Subir archivo", "Relacionar columnas", "Revisar e importar"];
const PROBLEMAS_VISIBLES = 12;

function descripcionSeparador(s: string | null) {
  if (s === ";") return "separado por punto y coma";
  if (s === ",") return "separado por coma";
  if (s === "\t") return "separado por tabulaciones";
  return "planilla de Excel";
}

export function AsistenteImportar({
  hoy,
  documentos,
  hayEjemplos,
}: {
  hoy: string;
  /** Documentos ya cargados (solo dígitos), para saber quién es nuevo. */
  documentos: string[];
  hayEjemplos: boolean;
}) {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [mapeo, setMapeo] = useState<(CampoCartera | "")[]>([]);
  const [ramos, setRamos] = useState<Record<string, string>>({});
  const [modo, setModo] = useState<"combinar" | "reemplazar">("combinar");
  const [quitarEjemplos, setQuitarEjemplos] = useState(hayEjemplos);
  const [todosLosProblemas, setTodosLosProblemas] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [estado, importar, importando] = useActionState<EstadoImportacion, FormData>(importarCartera, {});

  const existentes = useMemo(() => new Set(documentos), [documentos]);
  const validacion = useMemo(() => (tabla && paso === 3 ? validarCartera(tabla, mapeo, ramos) : null), [tabla, mapeo, ramos, paso]);
  const resumen = validacion ? resumirCartera(validacion, existentes, hoy) : null;
  const faltan = obligatoriosSinColumna(mapeo, CAMPOS_CARTERA);
  const companias = validacion ? companiasDelArchivo(validacion.filas) : [];

  async function elegir(nuevo: File) {
    setErrorArchivo(null);
    if (nuevo.size > TAMANO_MAXIMO_ARCHIVO) {
      setErrorArchivo("El archivo es muy grande (máximo 4 MB). Si es una planilla con muchas hojas, guardá solo la de la cartera.");
      return;
    }
    if (!/\.(csv|txt|xlsx)$/i.test(nuevo.name)) {
      setErrorArchivo('Subí un archivo CSV o Excel (.xlsx). Desde Excel: Archivo → Guardar como → "CSV".');
      return;
    }
    setLeyendo(true);
    try {
      const leida = await leerArchivoTabla(nuevo);
      if (!leida.encabezados.length || !leida.filas.length) {
        setErrorArchivo("El archivo está vacío o no tiene filas debajo de los encabezados.");
        return;
      }
      setArchivo(nuevo);
      setTabla(leida);
      setMapeo(sugerirMapeo(leida.encabezados, CAMPOS_CARTERA));
      setRamos({});
      setPaso(2);
    } catch (e) {
      setErrorArchivo(e instanceof Error ? e.message : "No pude leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  }

  function confirmar() {
    if (!archivo || !validacion) return;
    const datos = new FormData();
    datos.set("archivo", archivo);
    datos.set("mapeo", JSON.stringify(mapeo));
    datos.set("ramos", JSON.stringify(ramos));
    datos.set("modo", modo);
    datos.set("quitarEjemplos", quitarEjemplos ? "1" : "0");
    importar(datos);
  }

  const filasConDatos = tabla ? tabla.filas.filter((f) => f.some((c) => c.trim())).length : 0;
  const problemas = validacion?.problemas ?? [];

  return (
    <>
      <PasosAsistente pasos={PASOS} actual={paso} />

      {paso === 1 && (
        <div className="importar-paso-uno">
          <section className="tarjeta tarjeta-padding importar-principal" aria-label="Subir archivo">
            <ZonaArchivo
              titulo="Arrastrá tu archivo CSV o Excel acá"
              aclaracion=".csv separado por coma o punto y coma, o .xlsx · hasta 4 MB"
              aceptar=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              leyendo={leyendo}
              error={errorArchivo}
              alElegir={elegir}
            />
            <p className="texto-suave">
              Los asegurados que ya existen se actualizan: se reconocen por DNI o CUIT. Las notas y el seguimiento que
              cargaste no se pierden.
            </p>
          </section>
          <aside className="tarjeta tarjeta-padding importar-ayuda" aria-labelledby="t-de-donde">
            <h2 id="t-de-donde" className="titulo-tarjeta">
              ¿De dónde saco el archivo?
            </h2>
            <ol className="lista-pasos-ayuda">
              <li>Entrá al sistema de productores de cada compañía.</li>
              <li>Exportá tu cartera o el listado de pólizas vigentes.</li>
              <li>Si sale en Excel, podés subirlo así (.xlsx) o usar &quot;Guardar como&quot; → CSV.</li>
            </ol>
            <p className="texto-suave">
              Podés importar un archivo por compañía, uno detrás de otro. UNIQO junta las pólizas de cada asegurado.
            </p>
            <a href="/importar/plantilla" download className="enlace-fuerte">
              Descargar plantilla de ejemplo
            </a>
          </aside>
        </div>
      )}

      {paso === 2 && tabla && (
        <section className="tarjeta lista" aria-label="Relacionar columnas">
          <div className="lista-cabecera">
            <div className="archivo-elegido">
              <div className="archivo-icono" aria-hidden="true">
                {tabla.separador === null ? "XLSX" : "CSV"}
              </div>
              <div>
                <div className="celda-fuerte">{tabla.archivo}</div>
                <div className="texto-suave">
                  {filasConDatos} filas · {tabla.encabezados.length} columnas · {descripcionSeparador(tabla.separador)}
                </div>
              </div>
            </div>
            {faltan.length === 0 ? (
              <span className="pastilla pastilla-verde">Los 4 campos obligatorios están relacionados</span>
            ) : (
              <span className="pastilla pastilla-ambar">Falta relacionar: {faltan.join(", ")}</span>
            )}
          </div>
          <p className="texto-suave texto-con-margen">
            Revisá a qué dato de UNIQO corresponde cada columna. UNIQO sugirió las que reconoció por el nombre; cambiá las
            que no estén bien.
          </p>
          <TablaMapeo
            tabla={tabla}
            campos={CAMPOS_CARTERA}
            mapeo={mapeo}
            alCambiar={(i, campo) => setMapeo((m) => m.map((x, j) => (j === i ? campo : x === campo && campo ? "" : x)))}
          />
          <details className="vista-previa">
            <summary className="boton-texto">Ver las primeras filas del archivo</summary>
            <VistaPrevia tabla={tabla} />
          </details>
        </section>
      )}

      {paso === 3 && validacion && resumen && (
        <>
          <section aria-label="Resumen de la importación" className="resumen-importacion">
            <div className="tarjeta tarjeta-cifra">
              <div className="stat-titulo">Asegurados</div>
              <div className="cifra">{resumen.asegurados}</div>
              <div className="nota-pie">
                {resumen.nuevos} {resumen.nuevos === 1 ? "nuevo" : "nuevos"} · {resumen.actualizados} se{" "}
                {resumen.actualizados === 1 ? "actualiza" : "actualizan"}
              </div>
            </div>
            <div className="tarjeta tarjeta-cifra">
              <div className="stat-titulo">Pólizas</div>
              <div className="cifra">{resumen.polizas}</div>
              <div className="nota-pie">de {validacion.totalFilas} filas del archivo</div>
            </div>
            <div className="tarjeta tarjeta-cifra">
              <div className="stat-titulo">Vencen en 30 días</div>
              <div className="cifra texto-ambar">{resumen.vencen30}</div>
              <div className="nota-pie">aparecerán en Vencimientos</div>
            </div>
            <div className="tarjeta tarjeta-cifra">
              <div className="stat-titulo">Filas con problemas</div>
              <div className={`cifra ${resumen.filasConErrores ? "texto-rojo" : ""}`}>{resumen.filasConErrores}</div>
              <div className="nota-pie">no se importan hasta corregirlas</div>
            </div>
          </section>

          <section className="tarjeta tarjeta-padding" aria-labelledby="t-problemas">
            <div className="titulo-con-contador entre">
              <h2 id="t-problemas" className="titulo-tarjeta">
                {problemas.length ? "Filas con problemas" : "Todo en orden"}
              </h2>
              {resumen.filasConErrores > 0 && tabla && (
                <button
                  type="button"
                  className="boton-texto"
                  onClick={() => bajarCsv(aCsv(filasParaCorregir(tabla, problemas)), `para_corregir_${tabla.archivo.replace(/\.\w+$/, "")}.csv`)}
                >
                  Descargar para corregir
                </button>
              )}
            </div>
            {problemas.length === 0 && <p className="texto-suave">Todas las filas se pueden importar.</p>}
            <ul className="lista-problemas">
              {(todosLosProblemas ? problemas : problemas.slice(0, PROBLEMAS_VISIBLES)).map((p, i) => (
                <li key={`${p.fila}-${i}`} className={p.tipo === "advertencia" ? "problema-advertencia" : undefined}>
                  <span className="texto-gris">Fila {p.fila}</span>
                  <span>
                    {p.mensaje}
                    {p.tipo === "advertencia" && <span className="texto-gris"> (se importa igual)</span>}
                  </span>
                </li>
              ))}
            </ul>
            {problemas.length > PROBLEMAS_VISIBLES && (
              <button type="button" className="boton-texto alinear-inicio" onClick={() => setTodosLosProblemas((t) => !t)}>
                {todosLosProblemas ? "Ver menos" : `Ver los ${problemas.length}`}
              </button>
            )}

            {validacion.ramosDesconocidos.length > 0 && (
              <fieldset className="opciones ramos-desconocidos">
                <legend className="titulo-tarjeta">Elegí a qué ramo corresponde</legend>
                {validacion.ramosDesconocidos.map((r) => (
                  <label key={r} className="fila-dato">
                    <span className="columna-archivo">{r}</span>
                    <select
                      className="campo campo-angosto"
                      value={ramos[r] ?? ""}
                      onChange={(e) => setRamos((x) => ({ ...x, [r]: e.target.value }))}
                    >
                      <option value="">Sin elegir (no se importa)</option>
                      {RAMOS_CARTERA.map((ramo) => (
                        <option key={ramo.id} value={ramo.id}>
                          {ramo.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
            )}

            <fieldset className="opciones modo-importacion">
              <legend className="titulo-tarjeta">¿Qué hago con lo que ya tenés cargado?</legend>
              <label className="opcion">
                <input type="radio" name="modo" checked={modo === "combinar"} onChange={() => setModo("combinar")} />
                <span>
                  <span className="opcion-nombre">Combinar</span>
                  <span className="opcion-detalle">
                    Actualiza los asegurados y las pólizas que ya existen (por DNI o CUIT y número de póliza) y suma los
                    nuevos.
                  </span>
                </span>
              </label>
              <label className="opcion">
                <input type="radio" name="modo" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} />
                <span>
                  <span className="opcion-nombre">
                    Reemplazar: marcar como no vigentes las pólizas
                    {companias.length ? ` de ${unirConY(companias)}` : ""} que no estén en este archivo
                  </span>
                  <span className="opcion-detalle">
                    Usalo si el archivo es tu cartera completa de esa compañía. No se borra nada: quedan dadas de baja.
                  </span>
                </span>
              </label>
              {hayEjemplos && (
                <label className="opcion">
                  <input type="checkbox" checked={quitarEjemplos} onChange={(e) => setQuitarEjemplos(e.target.checked)} />
                  <span>
                    <span className="opcion-nombre">Quitar los datos de ejemplo</span>
                    <span className="opcion-detalle">Los asegurados, cobranzas y siniestros de muestra dejan de aparecer.</span>
                  </span>
                </label>
              )}
            </fieldset>
          </section>
        </>
      )}

      {estado.error && (
        <p className="aviso aviso-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="acciones-asistente">
        {paso > 1 && (
          <button type="button" className="boton" onClick={() => setPaso((p) => p - 1)} disabled={importando}>
            Atrás
          </button>
        )}
        {paso === 2 && (
          <button type="button" className="boton boton-primario empujar-derecha" onClick={() => setPaso(3)} disabled={faltan.length > 0}>
            Revisar importación
          </button>
        )}
        {paso === 3 && resumen && (
          <button
            type="button"
            className="boton boton-primario empujar-derecha"
            onClick={confirmar}
            disabled={importando || resumen.polizas === 0}
          >
            {importando ? "Importando…" : `Importar ${resumen.polizas === 1 ? "1 póliza" : `${resumen.polizas} pólizas`}`}
          </button>
        )}
      </div>
    </>
  );
}
