"use client";

import { useActionState, useMemo, useState } from "react";
import { bajarCsv, PasosAsistente, TablaMapeo, VistaPrevia, ZonaArchivo } from "@/components/importacion/Asistente";
import { aCsv } from "@/lib/csv";
import {
  CAMPOS_CARTERA,
  COMPANIAS,
  companiaMencionada,
  companiasDelArchivo,
  conOtrosDatos,
  faltanEnCartera,
  filasParaCorregir,
  leerArchivoTabla,
  resumirCartera,
  sugerirMapeo,
  TAMANO_MAXIMO_ARCHIVO,
  validarCartera,
  type CampoCartera,
  type Tabla,
} from "@/lib/importacion";
import { detectarFormato, FORMATOS_CARTERA, mapeoDeFormato, motivosDeFormato, type FormatoCartera } from "@/lib/formatos-cartera";
import { unirConY } from "@/lib/asegurados";
import { RAMOS_CARTERA } from "@/lib/ramos";
import { importarCartera, type EstadoImportacion } from "./actions";

const PASOS = ["Subir archivo", "Relacionar columnas", "Revisar e importar"];
const PROBLEMAS_VISIBLES = 12;
const OBLIGATORIOS = CAMPOS_CARTERA.filter((c) => c.obligatorio).length;

function descripcionSeparador(s: string | null) {
  if (s === ";") return "separado por punto y coma";
  if (s === ",") return "separado por coma";
  if (s === "\t") return "separado por tabulaciones";
  return "planilla de Excel";
}

export function AsistenteImportar({
  hoy,
  cargados,
  polizasCargadas,
  hayEjemplos,
}: {
  hoy: string;
  /** Los asegurados ya cargados (`claveDeAsegurado`), para saber quién es nuevo. */
  cargados: string[];
  /** Las pólizas ya cargadas (`claveDePoliza`), para reconocer a quien se le corrigió el documento. */
  polizasCargadas: string[];
  hayEjemplos: boolean;
}) {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [formato, setFormato] = useState<FormatoCartera | null>(null);
  const [mapeo, setMapeo] = useState<(CampoCartera | "")[]>([]);
  /** La compañía de todo el archivo, si no viene en una columna. */
  const [compania, setCompania] = useState("");
  const [ramos, setRamos] = useState<Record<string, string>>({});
  const [modo, setModo] = useState<"combinar" | "reemplazar">("combinar");
  const [quitarEjemplos, setQuitarEjemplos] = useState(hayEjemplos);
  const [todosLosProblemas, setTodosLosProblemas] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [estado, importar, importando] = useActionState<EstadoImportacion, FormData>(importarCartera, {});

  const existentes = useMemo(() => new Set(cargados), [cargados]);
  const polizasExistentes = useMemo(() => new Set(polizasCargadas), [polizasCargadas]);
  const conColumnaCompania = mapeo.includes("compania");
  const companiaArchivo = conColumnaCompania ? null : compania.trim() || null;
  const validacion = useMemo(
    () => (tabla && paso === 3 ? validarCartera(tabla, mapeo, { ramos, compania: companiaArchivo, formato }) : null),
    [tabla, mapeo, ramos, companiaArchivo, formato, paso],
  );
  const motivos = tabla && formato ? motivosDeFormato(tabla.encabezados, formato) : [];
  const resumen = validacion ? resumirCartera(validacion, existentes, hoy, polizasExistentes) : null;
  const faltan = faltanEnCartera(mapeo, companiaArchivo);
  const companias = validacion ? companiasDelArchivo(validacion.filas) : [];
  // Los códigos de ramo que trae el formato también se muestran, para revisarlos.
  const columnaRamo = mapeo.indexOf("ramo");
  const codigosDelFormato =
    formato?.ramos && tabla && columnaRamo >= 0
      ? [...new Set(tabla.filas.map((f) => (f[columnaRamo] ?? "").trim()))].filter((r) => r in formato.ramos!)
      : [];
  const ramosParaElegir = validacion ? [...new Set([...validacion.ramosDesconocidos, ...codigosDelFormato])] : [];

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
      const reconocido = detectarFormato(leida.encabezados);
      const sugerido = reconocido ? mapeoDeFormato(leida.encabezados, reconocido) : sugerirMapeo(leida.encabezados, CAMPOS_CARTERA);
      const omitidas = reconocido ? motivosDeFormato(leida.encabezados, reconocido) : [];
      setArchivo(nuevo);
      setTabla(leida);
      setFormato(reconocido);
      setMapeo(conOtrosDatos(leida, sugerido, (col) => Boolean(omitidas[col])));
      setCompania(reconocido?.compania ?? companiaMencionada(nuevo.name) ?? "");
      setRamos(reconocido?.ramos ?? {});
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
    datos.set("compania", companiaArchivo ?? "");
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
              Podés importar un archivo por compañía, uno detrás de otro. UNIQO junta las pólizas de cada asegurado. Los
              listados de {unirConY(FORMATOS_CARTERA.map((f) => f.compania))} se reconocen solos.
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
              <span className="pastilla pastilla-verde">Los {OBLIGATORIOS} datos obligatorios están relacionados</span>
            ) : (
              <span className="pastilla pastilla-ambar">Falta relacionar: {faltan.join(", ")}</span>
            )}
          </div>
          <p className="texto-suave texto-con-margen">
            {formato
              ? `Reconocimos el ${formato.nombre}: las columnas ya están relacionadas. Revisalas si querés cambiar alguna.`
              : "Revisá a qué dato de UNIQO corresponde cada columna. UNIQO sugirió las que reconoció por el nombre; cambiá las que no estén bien."}{" "}
            Las que no tienen un dato propio se guardan como “Otro dato” y se ven en cada póliza: elegí “No importar” en
            la que no te sirva.
          </p>
          {!conColumnaCompania && (
            <div className="compania-archivo">
              <label htmlFor="compania-archivo" className="etiqueta">
                ¿De qué compañía es este archivo?
              </label>
              <input
                id="compania-archivo"
                className="campo campo-angosto"
                list="companias-conocidas"
                value={compania}
                maxLength={100}
                placeholder="Mapfre, Sancor…"
                onChange={(e) => setCompania(e.target.value)}
              />
              <datalist id="companias-conocidas">
                {COMPANIAS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="nota-pie">
                {compania.trim()
                  ? "El archivo no trae la compañía en una columna: se la ponemos a todas sus pólizas."
                  : "Elegila para seguir: UNIQO la necesita para conciliar las comisiones."}
              </p>
            </div>
          )}
          <TablaMapeo
            tabla={tabla}
            campos={CAMPOS_CARTERA}
            mapeo={mapeo}
            motivos={motivos}
            alCambiar={(i, campo) =>
              setMapeo((m) => m.map((x, j) => (j === i ? campo : x === campo && campo && campo !== "otro" ? "" : x)))
            }
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
              {/* Las cuentas cuadran: cada fila del archivo está en una póliza o se dice por qué no. */}
              <div className="nota-pie">
                {validacion.totalFilas} {validacion.totalFilas === 1 ? "fila" : "filas"} del archivo
                {validacion.unidas > 0 &&
                  ` · ${validacion.unidas} ${validacion.unidas === 1 ? "es certificado o repetición" : "son certificados o repeticiones"} de otra póliza`}
                {validacion.noSonPolizas > 0 &&
                  ` · ${validacion.noSonPolizas} no ${validacion.noSonPolizas === 1 ? "es una póliza" : "son pólizas"} (totales o notas)`}
              </div>
            </div>
            <div className="tarjeta tarjeta-cifra">
              <div className="stat-titulo">Vencen en 30 días</div>
              <div className="cifra texto-ambar">{resumen.vencen30}</div>
              <div className="nota-pie">aparecerán en Vencimientos</div>
            </div>
            <div className="tarjeta tarjeta-cifra">
              <div className="stat-titulo">Pólizas con datos a corregir</div>
              <div className={`cifra ${resumen.filasConErrores ? "texto-rojo" : ""}`}>{resumen.filasConErrores}</div>
              <div className="nota-pie">se importan igual: corregilas en la ficha</div>
            </div>
          </section>

          <section className="tarjeta tarjeta-padding" aria-labelledby="t-problemas">
            <div className="titulo-con-contador entre">
              <h2 id="t-problemas" className="titulo-tarjeta">
                {problemas.length ? "Para revisar" : "Todo en orden"}
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
            {problemas.length === 0 && <p className="texto-suave">Todas las filas tienen sus datos completos.</p>}
            {problemas.length > 0 && (
              <p className="texto-suave">Todas las pólizas se importan. Lo que falta o vino mal queda anotado para corregirlo.</p>
            )}
            <ul className="lista-problemas">
              {(todosLosProblemas ? problemas : problemas.slice(0, PROBLEMAS_VISIBLES)).map((p, i) => (
                <li key={`${p.fila}-${i}`} className={p.tipo === "error" ? undefined : "problema-advertencia"}>
                  <span className="texto-gris">Fila {p.fila}</span>
                  <span>
                    {p.mensaje}
                    {p.tipo === "omitida" && <span className="texto-gris"> (no es una póliza)</span>}
                  </span>
                </li>
              ))}
            </ul>
            {problemas.length > PROBLEMAS_VISIBLES && (
              <button type="button" className="boton-texto alinear-inicio" onClick={() => setTodosLosProblemas((t) => !t)}>
                {todosLosProblemas ? "Ver menos" : `Ver los ${problemas.length}`}
              </button>
            )}

            {ramosParaElegir.length > 0 && (
              <fieldset className="opciones ramos-desconocidos">
                <legend className="titulo-tarjeta">Elegí a qué ramo corresponde</legend>
                {codigosDelFormato.length > 0 && formato && (
                  <p className="texto-suave">
                    Los códigos de ramo de {formato.compania} ya vienen elegidos: cambiá el que no corresponda.
                  </p>
                )}
                {ramosParaElegir.map((r) => (
                  <label key={r} className="fila-dato">
                    <span className="columna-archivo">{r}</span>
                    <select
                      className="campo campo-angosto"
                      value={ramos[r] ?? ""}
                      onChange={(e) => setRamos((x) => ({ ...x, [r]: e.target.value }))}
                    >
                      <option value="">Sin elegir (queda como vino)</option>
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
                    nuevos. Nunca borra: lo que el archivo no trae queda como estaba, y lo que corregiste en la ficha
                    no se pisa con un dato que venga mal.
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
