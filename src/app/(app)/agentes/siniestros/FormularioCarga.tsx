"use client";

import { useState } from "react";
import { TIPOS_SINIESTRO } from "@/lib/siniestros";
import { cargarSiniestro } from "./actions";

type PolizaDisponible = {
  id: number;
  ramo: string;
  compania: string | null;
  numero: string | null;
  bien: string | null;
  asegurado: string;
};

export function FormularioCarga({ polizas }: { polizas: PolizaDisponible[] }) {
  const companias = [...new Set(polizas.flatMap((poliza) => poliza.compania?.trim() ? [poliza.compania.trim()] : []))].sort((a, b) => a.localeCompare(b, "es-AR"));
  const [compania, setCompania] = useState("");
  const polizasDeCompania = polizas.filter((poliza) => poliza.compania?.trim() === compania);

  return (
    <>
      <div className="panel-cabecera">
        <h2 id="panel-cargar-siniestro-titulo" className="panel-titulo">Cargar siniestro</h2>
        <p className="texto-suave">Elegí la compañía y la póliza a la que corresponde el siniestro.</p>
      </div>
      <div className="panel-cuerpo">
        {companias.length ? (
          <form action={cargarSiniestro} className="siniestro-form siniestro-form-carga">
            <label>
              <span>Empresa aseguradora</span>
              <select name="compania" value={compania} onChange={(evento) => setCompania(evento.target.value)} required>
                <option value="" disabled>Elegí una empresa</option>
                {companias.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
              </select>
            </label>
            <label>
              <span>Póliza</span>
              <select key={compania} name="polizaId" required defaultValue="" disabled={!compania}>
                <option value="" disabled>Elegí una póliza</option>
                {polizasDeCompania.map((poliza) => (
                  <option key={poliza.id} value={poliza.id}>
                    {poliza.asegurado} · {poliza.ramo} · {poliza.numero ?? "Sin número"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo de siniestro</span>
              <select name="tipo" required defaultValue="otro">
                {TIPOS_SINIESTRO.map((tipo) => <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>)}
              </select>
            </label>
            <label>
              <span>Descripción</span>
              <input name="descripcion" type="text" maxLength={250} required />
            </label>
            <label>
              <span>Fecha y hora del hecho</span>
              <input name="fecha" type="datetime-local" required />
            </label>
            <label>
              <span>Lugar</span>
              <input name="lugar" type="text" maxLength={250} />
            </label>
            <label>
              <span>Quién avisó y por qué medio</span>
              <input name="avisoDe" type="text" placeholder="Ej.: Carolina por WhatsApp" maxLength={160} />
            </label>
            <label className="siniestro-campo-ancho">
              <span>Relato del hecho</span>
              <textarea name="relato" rows={4} maxLength={4000} />
            </label>
            <button type="submit" className="boton boton-primario" disabled={!compania}>Guardar siniestro</button>
          </form>
        ) : (
          <p className="texto-suave" role="status">No hay pólizas vigentes con una empresa aseguradora cargada.</p>
        )}
      </div>
    </>
  );
}
