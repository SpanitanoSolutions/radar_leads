"use client";

import { useMemo, useState } from "react";
import { TIPOS_SINIESTRO } from "@/lib/siniestros";
import { cargarSiniestro, editarSiniestro } from "./actions";
import type { obtenerSiniestros } from "@/lib/datos-agentes";

type SiniestroParaEditar = Awaited<ReturnType<typeof obtenerSiniestros>>[number]["siniestro"];

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
  return <FormularioSiniestro polizas={polizas} asegurados={asegurados} />;
}

export function FormularioEdicion({
  polizas,
  asegurados,
  siniestro,
  tab,
}: {
  polizas: PolizaDisponible[];
  asegurados: AseguradoDisponible[];
  siniestro: SiniestroParaEditar;
  tab: string;
}) {
  return <FormularioSiniestro polizas={polizas} asegurados={asegurados} siniestro={siniestro} tab={tab} />;
}

function fechaParaInput(fecha: Date | undefined) {
  if (!fecha) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha).replace(" ", "T");
}

function FormularioSiniestro({
  polizas,
  asegurados,
  siniestro,
  tab,
}: {
  polizas: PolizaDisponible[];
  asegurados: AseguradoDisponible[];
  siniestro?: SiniestroParaEditar;
  tab?: string;
}) {
  const editando = Boolean(siniestro);
  const [busqueda, setBusqueda] = useState("");
  const [aseguradoId, setAseguradoId] = useState(siniestro?.aseguradoId ? String(siniestro.aseguradoId) : "");
  const [polizaId, setPolizaId] = useState(siniestro?.polizaId ? String(siniestro.polizaId) : "");
  const [compania, setCompania] = useState(siniestro?.compania ?? "");
  const [ramo, setRamo] = useState(siniestro?.ramo ?? "");
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
      {!editando && (
        <div className="panel-cabecera">
          <h2 id="panel-cargar-siniestro-titulo" className="panel-titulo">Nuevo expediente de siniestro</h2>
          <p className="texto-suave">Completá los datos disponibles. Podés vincular una póliza ahora o dejar el expediente sin póliza.</p>
        </div>
      )}
      <div className={!editando ? "panel-cuerpo siniestro-alta-cuerpo" : undefined}>
        <form action={editando ? editarSiniestro : cargarSiniestro} className={`siniestro-form siniestro-form-carga${editando ? " siniestro-form-edicion" : " siniestro-alta-form"}`}>
          {siniestro && <input type="hidden" name="id" value={siniestro.id} />}
          {siniestro && <input type="hidden" name="tab" value={tab ?? "abiertos"} />}
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
            <select name="tipo" required defaultValue={siniestro?.tipo ?? "otro"}>
              {TIPOS_SINIESTRO.map((tipo) => <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>)}
            </select>
          </label>

          <label>
            <span>Fecha y hora del hecho</span>
            <input name="fecha" type="datetime-local" required defaultValue={fechaParaInput(siniestro?.fecha)} />
          </label>

          <label className="siniestro-campo-ancho">
            <span>Descripción breve</span>
            <input name="descripcion" type="text" maxLength={250} required defaultValue={siniestro?.descripcion ?? ""} placeholder="Ej.: Choque en Av. Independencia" />
          </label>

          <label>
            <span>Afectado o bien involucrado</span>
            <input name="afectado" type="text" maxLength={180} required={!aseguradoId && !polizaId} defaultValue={siniestro?.afectado ?? ""} placeholder="Persona, vehículo o inmueble" />
          </label>

          <label>
            <span>Lugar del hecho</span>
            <input name="lugar" type="text" maxLength={250} defaultValue={siniestro?.lugar ?? ""} />
          </label>

          <label>
            <span>Quién avisó y por qué medio</span>
            <input name="avisoDe" type="text" defaultValue={siniestro?.avisoDe ?? ""} placeholder="Ej.: Carolina por WhatsApp" maxLength={160} />
          </label>

          <label>
            <span>Relato del hecho</span>
            <textarea name="relato" rows={4} maxLength={4000} defaultValue={siniestro?.relato ?? ""} placeholder="Qué ocurrió y qué daños se informaron" />
          </label>

          {!editando && <label>
            <span>Nota interna</span>
            <textarea name="notaInterna" rows={4} maxLength={2000} placeholder="Contexto para el equipo; no se incluye en la denuncia" />
          </label>}

          {!editando && <label className="siniestro-campo-ancho siniestro-adjuntos-alta">
            <span>Adjuntar documentación (hasta 20 archivos; 25 MB en total)</span>
            <input name="archivos" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ods,.rtf" />
            <small>Se aceptan imágenes, PDF y documentos de oficina. Los archivos quedan guardados en el expediente; su revisión sigue siendo manual.</small>
          </label>}

          <div className="siniestro-alta-pie siniestro-campo-ancho">
            <p className="texto-suave">{editando ? "Los archivos y el borrador de denuncia se conservan. Podés editar la denuncia por separado." : "La denuncia queda como borrador. El agente no envía nada sin tu aprobación."}</p>
            <button type="submit" className="boton boton-primario">{editando ? "Guardar cambios" : "Crear expediente"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
