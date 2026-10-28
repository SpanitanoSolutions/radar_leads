"use client";

import { useMemo, useState } from "react";
import { TIPOS_SINIESTRO } from "@/lib/siniestros";
import { cargarSiniestro } from "./actions";

type PolizaDisponible = {
  id: number;
  aseguradoId: number;
  ramo: string;
  compania: string | null;
  numero: string | null;
  bien: string | null;
  asegurado: string;
};

type AseguradoDisponible = {
  id: number;
  nombre: string;
  tipo: string;
  documento: string | null;
  documentoDigitos: string | null;
  domicilio: string | null;
};

export function FormularioCarga({
  polizas,
  asegurados,
}: {
  polizas: PolizaDisponible[];
  asegurados: AseguradoDisponible[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [aseguradoId, setAseguradoId] = useState("");
  const [polizaId, setPolizaId] = useState("");
  const [compania, setCompania] = useState("");
  const [ramo, setRamo] = useState("");
  const companias = [...new Set(polizas.flatMap((poliza) => poliza.compania?.trim() ? [poliza.compania.trim()] : []))]
    .sort((a, b) => a.localeCompare(b, "es-AR"));

  const candidatos = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es-AR");
    const coincidencias = !termino ? asegurados.slice(0, 20) : asegurados.filter((asegurado) =>
      [asegurado.nombre, asegurado.documento, asegurado.documentoDigitos]
        .some((valor) => valor?.toLocaleLowerCase("es-AR").includes(termino)),
    ).slice(0, 30);
    const seleccionado = asegurados.find((asegurado) => String(asegurado.id) === aseguradoId);
    return seleccionado && !coincidencias.some((asegurado) => asegurado.id === seleccionado.id)
      ? [seleccionado, ...coincidencias]
      : coincidencias;
  }, [asegurados, aseguradoId, busqueda]);

  const polizasVisibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es-AR");
    const coincidencias = polizas.filter((poliza) => {
      if (aseguradoId && String(poliza.aseguradoId) !== aseguradoId) return false;
      if (!termino) return true;
      return [poliza.numero, poliza.bien, poliza.asegurado, poliza.compania]
        .some((valor) => valor?.toLocaleLowerCase("es-AR").includes(termino));
    }).slice(0, 80);
    const seleccionada = polizas.find((poliza) => String(poliza.id) === polizaId);
    return seleccionada && !coincidencias.some((poliza) => poliza.id === seleccionada.id)
      ? [seleccionada, ...coincidencias]
      : coincidencias;
  }, [aseguradoId, busqueda, polizaId, polizas]);

  function elegirPoliza(valor: string) {
    setPolizaId(valor);
    const poliza = polizas.find((item) => String(item.id) === valor);
    if (!poliza) return;
    setAseguradoId(String(poliza.aseguradoId));
    setCompania(poliza.compania ?? "");
    setRamo(poliza.ramo);
  }

  return (
    <>
      <div className="panel-cabecera">
        <h2 id="panel-cargar-siniestro-titulo" className="panel-titulo">Nuevo expediente de siniestro</h2>
        <p className="texto-suave">Completá los datos disponibles. Podés vincular una póliza ahora o dejar el expediente sin póliza.</p>
      </div>
      <div className="panel-cuerpo siniestro-alta-cuerpo">
        <form action={cargarSiniestro} className="siniestro-form siniestro-form-carga siniestro-alta-form">
          <label className="siniestro-campo-ancho">
            <span>Buscar coincidencias</span>
            <input
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Nombre, CUIT/DNI, número de póliza o patente"
              autoComplete="off"
            />
            <small>Las coincidencias son sugerencias. Confirmá el asegurado o la póliza antes de guardar.</small>
          </label>

          <label>
            <span>Asegurado (opcional)</span>
            <select name="aseguradoId" value={aseguradoId} onChange={(evento) => {
              const nuevoAseguradoId = evento.target.value;
              const polizaActual = polizas.find((poliza) => String(poliza.id) === polizaId);
              setAseguradoId(nuevoAseguradoId);
              if (polizaActual && String(polizaActual.aseguradoId) !== nuevoAseguradoId) setPolizaId("");
            }}>
              <option value="">Sin vincular por ahora</option>
              {candidatos.map((asegurado) => (
                <option key={asegurado.id} value={asegurado.id}>
                  {asegurado.nombre}{asegurado.documento ? ` · ${asegurado.documento}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Póliza (opcional)</span>
            <select name="polizaId" value={polizaId} onChange={(evento) => elegirPoliza(evento.target.value)}>
              <option value="">Sin póliza asociada</option>
              {polizasVisibles.map((poliza) => (
                <option key={poliza.id} value={poliza.id}>
                  {poliza.asegurado} · {poliza.ramo} · {poliza.numero ?? "Sin número"}{poliza.bien ? ` · ${poliza.bien}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Compañía (opcional)</span>
            <input name="compania" list="siniestro-companias" value={compania} onChange={(evento) => setCompania(evento.target.value)} maxLength={120} />
            <datalist id="siniestro-companias">
              {companias.map((nombre) => <option key={nombre} value={nombre} />)}
            </datalist>
          </label>

          <label>
            <span>Ramo</span>
            <input name="ramo" value={ramo} onChange={(evento) => setRamo(evento.target.value)} placeholder="Automotor, Hogar, AP…" maxLength={100} />
          </label>

          <label>
            <span>Tipo de siniestro</span>
            <select name="tipo" required defaultValue="otro">
              {TIPOS_SINIESTRO.map((tipo) => <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>)}
            </select>
          </label>

          <label>
            <span>Fecha y hora del hecho</span>
            <input name="fecha" type="datetime-local" required />
          </label>

          <label className="siniestro-campo-ancho">
            <span>Descripción breve</span>
            <input name="descripcion" type="text" maxLength={250} required placeholder="Ej.: Choque en Av. Independencia" />
          </label>

          <label>
            <span>Afectado o bien involucrado</span>
            <input name="afectado" type="text" maxLength={180} required={!aseguradoId && !polizaId} placeholder="Persona, vehículo o inmueble" />
          </label>

          <label>
            <span>Lugar del hecho</span>
            <input name="lugar" type="text" maxLength={250} />
          </label>

          <label>
            <span>Quién avisó y por qué medio</span>
            <input name="avisoDe" type="text" placeholder="Ej.: Carolina por WhatsApp" maxLength={160} />
          </label>

          <label>
            <span>Relato del hecho</span>
            <textarea name="relato" rows={4} maxLength={4000} placeholder="Qué ocurrió y qué daños se informaron" />
          </label>

          <label>
            <span>Nota interna</span>
            <textarea name="notaInterna" rows={4} maxLength={2000} placeholder="Contexto para el equipo; no se incluye en la denuncia" />
          </label>

          <label className="siniestro-campo-ancho siniestro-adjuntos-alta">
            <span>Adjuntar documentos (hasta 20 archivos PDF, JPG o PNG; 25 MB en total)</span>
            <input name="archivos" type="file" multiple accept="application/pdf,image/jpeg,image/png" />
            <small>Los archivos quedan guardados en el expediente. El análisis automático se activará cuando se configuren proveedor, modelos y ejecución de tareas.</small>
          </label>

          <div className="siniestro-alta-pie siniestro-campo-ancho">
            <p className="texto-suave">La denuncia queda como borrador. El agente no envía nada sin tu aprobación.</p>
            <button type="submit" className="boton boton-primario">Crear expediente</button>
          </div>
        </form>
      </div>
    </>
  );
}
