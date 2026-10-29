"use client";

import { useState } from "react";
import { CampoLiquidacion, CAMPOS_LIQUIDACION } from "@/lib/conciliacion";
import { leerArchivoTabla, obligatoriosSinColumna, sugerirMapeo, type Tabla } from "@/lib/importacion";
import { TablaMapeo, VistaPrevia } from "@/components/importacion/Asistente";
import { subirLiquidacion } from "./actions";

export function AsistenteLiquidacion({ periodo }: { periodo: string }) {
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [mapeo, setMapeo] = useState<(CampoLiquidacion | "")[]>([]);
  const [error, setError] = useState<string | null>(null);
  const faltan = obligatoriosSinColumna(mapeo, CAMPOS_LIQUIDACION);

  async function leer(archivo: File | undefined) {
    setError(null);
    setTabla(null);
    setMapeo([]);
    if (!archivo) return;
    if (archivo.size > 4 * 1024 * 1024) {
      setError("El archivo supera el límite de 4 MB.");
      return;
    }
    try {
      const datos = await leerArchivoTabla(archivo);
      if (!datos.encabezados.length || !datos.filas.length) {
        setError("El archivo está vacío o no tiene filas debajo de los encabezados.");
        return;
      }
      setTabla(datos);
      setMapeo(sugerirMapeo(datos.encabezados, CAMPOS_LIQUIDACION));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }

  return (
    <form action={subirLiquidacion} className="conciliacion-subir-form">
      <input type="hidden" name="periodo" value={periodo} />
      <label htmlFor="archivo-liquidacion">Archivo CSV o XLSX</label>
      <input
        id="archivo-liquidacion"
        type="file"
        name="archivo"
        accept=".csv,.xlsx"
        required
        onChange={(event) => leer(event.currentTarget.files?.[0])}
      />
      <p>Elegí una compañía y un período por archivo. Podés incluir cuota, porcentaje, depósito y retenciones.</p>
      {error && <p className="mensaje-error" role="alert">{error}</p>}
      {tabla && (
        <>
          <input type="hidden" name="mapeo" value={JSON.stringify(mapeo)} />
          <p className="texto-suave">Relacioná cada columna con el dato correspondiente. {tabla.filas.filter((f) => f.some((c) => c.trim())).length} filas en el archivo.</p>
          <TablaMapeo
            tabla={tabla}
            campos={CAMPOS_LIQUIDACION}
            mapeo={mapeo}
            alCambiar={(indice, campo) => setMapeo((actual) => actual.map((valor, i) => (i === indice ? campo : valor === campo && campo ? "" : valor)))}
          />
          <details className="vista-previa">
            <summary className="boton-texto">Ver las primeras filas</summary>
            <VistaPrevia tabla={tabla} />
          </details>
        </>
      )}
      <button type="submit" className="boton boton-primario" disabled={!tabla || faltan.length > 0}>
        Cargar liquidación
      </button>
    </form>
  );
}