"use client";

import { eliminarArchivoSiniestro } from "./actions";

export function EliminarArchivo({
  siniestroId,
  siniestroArchivoId,
  nombre,
  tab,
}: {
  siniestroId: number;
  siniestroArchivoId: number;
  nombre: string;
  tab: string;
}) {
  return (
    <form
      action={eliminarArchivoSiniestro}
      onSubmit={(evento) => {
        if (!window.confirm(`¿Eliminar “${nombre}” del expediente? Esta acción no se puede deshacer.`)) {
          evento.preventDefault();
        }
      }}
    >
      <input type="hidden" name="siniestroId" value={siniestroId} />
      <input type="hidden" name="siniestroArchivoId" value={siniestroArchivoId} />
      <input type="hidden" name="tab" value={tab} />
      <button type="submit" className="boton siniestro-archivo-eliminar" aria-label={`Eliminar ${nombre}`}>
        Eliminar
      </button>
    </form>
  );
}
