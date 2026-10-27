"use client";

import { useRef, useState } from "react";
import { IconoSubir } from "@/components/iconos";
import type { CampoImportable, Tabla } from "@/lib/importacion";

/** Los pasos del asistente, con el actual marcado. */
export function PasosAsistente({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol aria-label="Pasos" className="pasos-asistente">
      {pasos.map((texto, i) => {
        const n = i + 1;
        const estado = n < actual ? "hecho" : n === actual ? "actual" : "pendiente";
        return (
          <li key={texto} className={`paso paso-${estado}`} aria-current={n === actual ? "step" : undefined}>
            <span className="paso-numero" aria-hidden={estado === "hecho" ? true : undefined}>
              {estado === "hecho" ? "✓" : n}
            </span>
            <span>
              {texto}
              {estado === "hecho" && <span className="visualmente-oculto"> (listo)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Zona para arrastrar el archivo o elegirlo desde la computadora. */
export function ZonaArchivo({
  titulo,
  aclaracion,
  aceptar,
  leyendo,
  error,
  alElegir,
}: {
  titulo: string;
  aclaracion: string;
  aceptar: string;
  leyendo: boolean;
  error?: string | null;
  alElegir: (archivo: File) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  return (
    <div
      className={encima ? "zona-archivo zona-archivo-encima" : "zona-archivo"}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const archivo = e.dataTransfer.files[0];
        if (archivo) alElegir(archivo);
      }}
    >
      <div className="zona-archivo-icono" aria-hidden="true">
        <IconoSubir size={26} />
      </div>
      <div className="zona-archivo-titulo">{titulo}</div>
      <div className="texto-suave">o elegilo desde tu computadora</div>
      <input
        ref={entrada}
        type="file"
        accept={aceptar}
        className="visualmente-oculto"
        id="archivo-importar"
        tabIndex={-1}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) alElegir(archivo);
          e.target.value = "";
        }}
      />
      <button type="button" className="boton boton-primario" onClick={() => entrada.current?.click()} disabled={leyendo}>
        {leyendo ? "Leyendo…" : "Seleccionar archivo"}
      </button>
      <div className="nota-pie">{aclaracion}</div>
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Columna del archivo → dato de UNIQO, con un ejemplo y si es obligatorio. */
export function TablaMapeo<Id extends string>({
  tabla,
  campos,
  mapeo,
  alCambiar,
}: {
  tabla: Tabla;
  campos: CampoImportable<Id>[];
  mapeo: (Id | "")[];
  alCambiar: (columna: number, campo: Id | "") => void;
}) {
  const ejemplo = (i: number) => tabla.filas.find((f) => (f[i] ?? "").trim())?.[i] ?? "";
  return (
    <div className="tabla-scroll">
      <table className="tabla tabla-mapeo">
        <thead>
          <tr>
            <th scope="col">Columna del archivo</th>
            <th scope="col">Ejemplo</th>
            <th scope="col">Dato en UNIQO</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {tabla.encabezados.map((encabezado, i) => {
            const campo = campos.find((c) => c.id === mapeo[i]);
            const repetido = Boolean(mapeo[i]) && mapeo.indexOf(mapeo[i]) !== i;
            return (
              <tr key={`${encabezado}-${i}`}>
                <td className="columna-archivo">{encabezado || `Columna ${i + 1}`}</td>
                <td className="ejemplo-columna">{ejemplo(i)}</td>
                <td>
                  <select
                    className="campo campo-angosto"
                    aria-label={`Dato en UNIQO para la columna ${encabezado || i + 1}`}
                    value={mapeo[i] ?? ""}
                    onChange={(e) => alCambiar(i, e.target.value as Id | "")}
                  >
                    <option value="">No importar</option>
                    {campos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {repetido ? (
                    <span className="pastilla pastilla-rojo">Repetida</span>
                  ) : !campo ? (
                    <span className="pastilla pastilla-gris">Se omite</span>
                  ) : campo.obligatorio ? (
                    <span className="pastilla pastilla-azul">Obligatorio</span>
                  ) : (
                    <span className="pastilla pastilla-verde">Relacionada</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Las primeras filas del archivo, tal como vienen. */
export function VistaPrevia({ tabla, cuantas = 5 }: { tabla: Tabla; cuantas?: number }) {
  const filas = tabla.filas.filter((f) => f.some((c) => c.trim())).slice(0, cuantas);
  return (
    <div className="tabla-scroll">
      <table className="tabla tabla-compacta tabla-previa">
        <caption className="visualmente-oculto">Primeras filas del archivo</caption>
        <thead>
          <tr>
            {tabla.encabezados.map((e, i) => (
              <th key={i} scope="col">
                {e || `Columna ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {tabla.encabezados.map((_, j) => (
                <td key={j}>{f[j] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Baja un CSV armado en el navegador (las filas para corregir). */
export function bajarCsv(contenido: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
