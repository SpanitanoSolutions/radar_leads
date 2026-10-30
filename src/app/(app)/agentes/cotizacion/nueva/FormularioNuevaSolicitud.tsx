"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { nuevaSolicitud } from "../actions";

type Contacto = { id: number; nombre: string };
type Aseguradora = { id: number; nombre: string; ramos: string[] };
type TipoContacto = "asegurado" | "lead";
type OpcionContacto = Contacto & { tipo: TipoContacto };

const RAMOS = ["Automotor", "Flotas", "Hogar", "Integral de comercio", "Incendio", "RC", "Caución", "ART", "AP", "Vida", "Salud"];
const TIPOS = [
  { valor: "negocio_nuevo", titulo: "Negocio nuevo", detalle: "Una cobertura para contratar por primera vez." },
  { valor: "renovacion", titulo: "Renovación", detalle: "Revisá una póliza que está por vencer." },
] as const;
const MENSAJES_AVISO: Record<string, string> = {
  "solicitud-incompleta": "Revisá el contacto, el tipo de solicitud y el ramo.",
  "solicitud-vinculo-invalido": "Elegí un asegurado o lead de la lista.",
  "asegurado-inexistente": "No encontramos ese asegurado. Buscalo de nuevo y volvé a intentarlo.",
  "lead-inexistente": "No encontramos ese lead. Buscalo de nuevo y volvé a intentarlo.",
  "sin-companias-configuradas": "No hay aseguradoras disponibles para este ramo. Revisá la configuración.",
  "solicitud-riesgo-invalido": "Completá los datos obligatorios del riesgo y revisá el CUIT/CUIL.",
  "solicitud-adjunto-invalido": "El archivo debe ser PDF, Word, Excel o imagen, y pesar hasta 25 MB.",
  "error-operacion": "No pudimos guardar la solicitud. Revisá si se creó antes de volver a intentarlo.",
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").trim();
}

function coincideConRamo(aseguradora: Aseguradora, ramo: string): boolean {
  return aseguradora.ramos.length === 0 || aseguradora.ramos.includes(ramo);
}

function BotonCrear({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton boton-primario cotizacion-crear" disabled={bloqueado || pending}>
      {pending ? "Creando solicitud…" : "Crear solicitud"}
      {!pending && <span aria-hidden="true">→</span>}
    </button>
  );
}

export default function FormularioNuevaSolicitud({
  asegurados,
  leads,
  aseguradoras,
  aviso,
}: {
  asegurados: Contacto[];
  leads: Contacto[];
  aseguradoras: Aseguradora[];
  aviso: string;
}) {
  const [ramo, setRamo] = useState("Automotor");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"]>("negocio_nuevo");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<OpcionContacto | null>(null);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [errorContacto, setErrorContacto] = useState(false);
  const [archivo, setArchivo] = useState("");
  const [companiasElegidas, setCompaniasElegidas] = useState<string[]>(() =>
    aseguradoras.filter((aseguradora) => coincideConRamo(aseguradora, "Automotor")).map((aseguradora) => aseguradora.nombre),
  );

  const contactos = useMemo<OpcionContacto[]>(() => [
    ...asegurados.map((contacto) => ({ ...contacto, tipo: "asegurado" as const })),
    ...leads.map((contacto) => ({ ...contacto, tipo: "lead" as const })),
  ], [asegurados, leads]);
  const coincidencias = useMemo(() => {
    const consulta = normalizar(busqueda);
    if (!consulta) return [];
    return contactos.filter((contacto) => normalizar(contacto.nombre).includes(consulta));
  }, [busqueda, contactos]);
  const resultados = coincidencias.slice(0, 8);
  const aseguradorasDisponibles = useMemo(
    () => aseguradoras.filter((aseguradora) => coincideConRamo(aseguradora, ramo)),
    [aseguradoras, ramo],
  );
  const avisoVisible = MENSAJES_AVISO[aviso];

  function cambiarRamo(nuevoRamo: string) {
    setRamo(nuevoRamo);
    setCompaniasElegidas(aseguradoras.filter((aseguradora) => coincideConRamo(aseguradora, nuevoRamo)).map((aseguradora) => aseguradora.nombre));
  }

  function elegirContacto(contacto: OpcionContacto) {
    setSeleccionado(contacto);
    setBusqueda(contacto.nombre);
    setMostrarResultados(false);
    setErrorContacto(false);
  }

  function cambiarContacto() {
    setSeleccionado(null);
    setBusqueda("");
    setMostrarResultados(true);
    setErrorContacto(false);
    window.setTimeout(() => document.getElementById("cotizacion-busqueda-contacto")?.focus(), 0);
  }

  function manejarTeclado(evento: KeyboardEvent<HTMLInputElement>) {
    if (!mostrarResultados || !resultados.length) {
      if (evento.key === "ArrowDown" && resultados.length) setMostrarResultados(true);
      return;
    }
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setIndiceActivo((actual) => (actual + 1) % resultados.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndiceActivo((actual) => (actual - 1 + resultados.length) % resultados.length);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      elegirContacto(resultados[indiceActivo]);
    } else if (evento.key === "Escape") {
      setMostrarResultados(false);
    }
  }

  function validarFormulario(evento: FormEvent<HTMLFormElement>) {
    if (!seleccionado) {
      evento.preventDefault();
      setErrorContacto(true);
      setMostrarResultados(true);
      document.getElementById("cotizacion-busqueda-contacto")?.focus();
    }
  }

  function alternarCompania(nombre: string) {
    setCompaniasElegidas((actuales) => actuales.includes(nombre)
      ? actuales.filter((compania) => compania !== nombre)
      : [...actuales, nombre]);
  }

  function seleccionarTodas() {
    setCompaniasElegidas(aseguradorasDisponibles.map((aseguradora) => aseguradora.nombre));
  }

  function limpiarCompanias() {
    setCompaniasElegidas([]);
  }

  const requiereRiesgoAuto = ramo === "Automotor";
  const requiereRiesgoFlota = ramo === "Flotas";
  const maxAnio = new Date().getFullYear() + 1;

  return (
    <form action={nuevaSolicitud} className="cotizacion-nueva-formulario" onSubmit={validarFormulario}>
      {avisoVisible && <p role="alert" className="cotizacion-nueva-aviso">{avisoVisible}</p>}

      <section className="cotizacion-form-seccion" aria-labelledby="cotizacion-contacto-titulo">
        <div className="cotizacion-seccion-encabezado">
          <span className="cotizacion-paso" aria-hidden="true">1</span>
          <div>
            <h2 id="cotizacion-contacto-titulo">¿A quién vamos a asegurar?</h2>
            <p>Buscá por nombre y elegí un asegurado o una empresa de tus leads.</p>
          </div>
        </div>
        <div className="cotizacion-selector-contacto">
          <label htmlFor="cotizacion-busqueda-contacto">Asegurado o lead</label>
          <div className={`cotizacion-contacto-buscador${errorContacto ? " con-error" : ""}`}>
            <span className="cotizacion-lupa" aria-hidden="true">⌕</span>
            <input
              id="cotizacion-busqueda-contacto"
              type="text"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={mostrarResultados && !seleccionado}
              aria-controls="cotizacion-contactos-resultados"
              aria-activedescendant={mostrarResultados && resultados[indiceActivo] ? `cotizacion-contacto-${resultados[indiceActivo].tipo}-${resultados[indiceActivo].id}` : undefined}
              aria-invalid={errorContacto}
              required
              value={seleccionado ? seleccionado.nombre : busqueda}
              placeholder="Escribí un nombre para buscar…"
              readOnly={Boolean(seleccionado)}
              onFocus={() => { if (!seleccionado) setMostrarResultados(true); }}
              onBlur={(evento) => {
                const destino = evento.relatedTarget;
                if (!(destino instanceof Node) || !evento.currentTarget.closest(".cotizacion-selector-contacto")?.contains(destino)) setMostrarResultados(false);
              }}
              onChange={(evento) => {
                setSeleccionado(null);
                setBusqueda(evento.target.value);
                setIndiceActivo(0);
                setMostrarResultados(true);
                setErrorContacto(false);
              }}
              onKeyDown={manejarTeclado}
            />
            {seleccionado ? (
              <button type="button" className="cotizacion-contacto-cambiar" onClick={cambiarContacto}>Cambiar</button>
            ) : (
              <span className="cotizacion-contactos-cantidad">{contactos.length} contactos</span>
            )}
          </div>
          <input type="hidden" name="vinculo" value={seleccionado ? `${seleccionado.tipo}:${seleccionado.id}` : ""} />
          {!contactos.length && <p className="cotizacion-contacto-sin-resultados">Todavía no hay contactos disponibles. Podés <Link href="/asegurados/nuevo">agregar un asegurado</Link> o revisar tus <Link href="/leads">leads</Link>.</p>}
          {mostrarResultados && !seleccionado && busqueda.trim() && (
            <div id="cotizacion-contactos-resultados" className="cotizacion-contactos-resultados" role="listbox" aria-label="Resultados de contacto">
              {resultados.length ? resultados.map((contacto, indice) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={indice === indiceActivo}
                  id={`cotizacion-contacto-${contacto.tipo}-${contacto.id}`}
                  className="cotizacion-contacto-opcion"
                  key={`${contacto.tipo}-${contacto.id}`}
                  onMouseEnter={() => setIndiceActivo(indice)}
                  onClick={() => elegirContacto(contacto)}
                >
                  <span className="cotizacion-contacto-avatar" aria-hidden="true">{contacto.nombre.trim().slice(0, 1).toLocaleUpperCase("es-AR") || "?"}</span>
                  <span className="cotizacion-contacto-nombre">{contacto.nombre}</span>
                  <span className="cotizacion-contacto-tipo">{contacto.tipo === "asegurado" ? "Asegurado" : "Lead"}</span>
                </button>
              )) : (
                <p className="cotizacion-contacto-sin-resultados">No encontramos coincidencias. Probá con otro nombre.</p>
              )}
              {coincidencias.length > resultados.length && <p className="cotizacion-contacto-pista">Mostramos las primeras coincidencias. Escribí otro nombre o apellido para afinar la búsqueda.</p>}
            </div>
          )}
          {errorContacto && <span className="cotizacion-campo-error">Elegí un contacto de la lista para continuar.</span>}
        </div>
      </section>

      <section className="cotizacion-form-seccion" aria-labelledby="cotizacion-solicitud-titulo">
        <div className="cotizacion-seccion-encabezado">
          <span className="cotizacion-paso" aria-hidden="true">2</span>
          <div>
            <h2 id="cotizacion-solicitud-titulo">¿Qué necesitás cotizar?</h2>
            <p>Indicá el tipo de operación y el ramo.</p>
          </div>
        </div>
        <fieldset className="cotizacion-tipos-solicitud">
          <legend>Tipo de solicitud</legend>
          <div className="cotizacion-tipos-opciones">
            {TIPOS.map((opcion) => (
              <label key={opcion.valor} className={`cotizacion-tipo-opcion${tipo === opcion.valor ? " seleccionado" : ""}`}>
                <input type="radio" name="tipo" value={opcion.valor} checked={tipo === opcion.valor} onChange={() => setTipo(opcion.valor)} />
                <span className="cotizacion-tipo-marca" aria-hidden="true">{tipo === opcion.valor ? "✓" : ""}</span>
                <span><strong>{opcion.titulo}</strong><small>{opcion.detalle}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="cotizacion-nueva-grid">
          <label className="cotizacion-campo">
            <span>Ramo</span>
            <select name="ramo" value={ramo} onChange={(evento) => cambiarRamo(evento.target.value)} required>
              {RAMOS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="cotizacion-campo">
            <span>Bien a asegurar <small>Opcional</small></span>
            <input name="bien" type="text" maxLength={250} placeholder={ramo === "Automotor" ? "Ej.: Toyota Corolla 2022" : "Ej.: vivienda, local, flota…"} />
          </label>
          <label className="cotizacion-campo cotizacion-campo-ancho">
            <span>Motivo o detalle <small>Opcional</small></span>
            <textarea name="motivo" rows={3} maxLength={500} placeholder="Contanos qué necesitás; por ejemplo, si es una renovación o cuándo vence la póliza." />
          </label>
        </div>
      </section>

      <section className="cotizacion-form-seccion" aria-labelledby="cotizacion-riesgo-titulo">
        <div className="cotizacion-seccion-encabezado">
          <span className="cotizacion-paso" aria-hidden="true">3</span>
          <div>
            <h2 id="cotizacion-riesgo-titulo">Datos del riesgo</h2>
            <p>Con estos datos las aseguradoras pueden preparar una cotización más precisa.</p>
          </div>
        </div>
        {requiereRiesgoAuto ? (
          <div className="cotizacion-datos-riesgo-grid">
            <label className="cotizacion-campo"><span>Marca <b>*</b></span><input name="marca" maxLength={80} required placeholder="Ej.: Toyota" /></label>
            <label className="cotizacion-campo"><span>Modelo <b>*</b></span><input name="modelo" maxLength={80} required placeholder="Ej.: Corolla" /></label>
            <label className="cotizacion-campo"><span>Año <b>*</b></span><input name="anio" type="number" min="1900" max={maxAnio} required placeholder="2022" /></label>
            <label className="cotizacion-campo"><span>Versión</span><input name="version" maxLength={100} placeholder="Ej.: XLI 1.8" /></label>
            <label className="cotizacion-campo"><span>Uso <b>*</b></span><input name="uso" maxLength={100} required placeholder="Particular, comercial…" /></label>
            <label className="cotizacion-campo"><span>Código postal <b>*</b></span><input name="codigoPostal" maxLength={12} required placeholder="Ej.: 1425" /></label>
            <label className="cotizacion-campo"><span>Conductor habitual</span><input name="conductor" maxLength={120} placeholder="Nombre y apellido" /></label>
            <label className="cotizacion-campo"><span>Fecha de nacimiento</span><input name="fechaNacimiento" type="date" /></label>
            <label className="cotizacion-campo"><span>CUIT/CUIL</span><input name="cuitCuil" maxLength={13} inputMode="numeric" placeholder="20-12345678-9" /></label>
            <label className="cotizacion-campo"><span>Forma de pago</span><input name="formaDePago" maxLength={80} placeholder="Mensual, anual…" /></label>
          </div>
        ) : requiereRiesgoFlota ? (
          <div className="cotizacion-datos-riesgo-grid">
            <label className="cotizacion-campo"><span>Unidades en la flota <b>*</b></span><input name="cantidadUnidades" type="number" min="1" required placeholder="Ej.: 5" /></label>
            <label className="cotizacion-campo"><span>Actividad <b>*</b></span><input name="actividad" maxLength={120} required placeholder="Ej.: distribución urbana" /></label>
            <label className="cotizacion-campo"><span>Zona de circulación</span><input name="zona" maxLength={120} placeholder="Localidad o provincia" /></label>
            <label className="cotizacion-campo"><span>CUIT/CUIL</span><input name="cuitCuil" maxLength={13} inputMode="numeric" placeholder="20-12345678-9" /></label>
          </div>
        ) : (
          <div className="cotizacion-datos-riesgo-grid">
            <label className="cotizacion-campo"><span>CUIT/CUIL</span><input name="cuitCuil" maxLength={13} inputMode="numeric" placeholder="20-12345678-9" /></label>
            <label className="cotizacion-campo"><span>Suma asegurada</span><input name="sumaAsegurada" type="number" min="0" step="0.01" placeholder="Importe solicitado" /></label>
            <label className="cotizacion-campo cotizacion-campo-ancho"><span>Coberturas solicitadas</span><input name="coberturasSolicitadas" maxLength={500} placeholder="Ej.: responsabilidad civil, cristales…" /></label>
          </div>
        )}
        {(requiereRiesgoAuto || requiereRiesgoFlota) && (
          <div className="cotizacion-datos-extra">
            <label className="cotizacion-campo"><span>Suma asegurada</span><input name="sumaAsegurada" type="number" min="0" step="0.01" placeholder="Importe solicitado" /></label>
            <label className="cotizacion-campo"><span>Coberturas solicitadas</span><input name="coberturasSolicitadas" maxLength={500} placeholder="Ej.: responsabilidad civil, cristales…" /></label>
          </div>
        )}
      </section>

      <section className="cotizacion-form-seccion" aria-labelledby="cotizacion-aseguradoras-titulo">
        <div className="cotizacion-seccion-encabezado cotizacion-aseguradoras-encabezado">
          <span className="cotizacion-paso" aria-hidden="true">4</span>
          <div>
            <h2 id="cotizacion-aseguradoras-titulo">Elegí las aseguradoras</h2>
            <p>Las activas para {ramo} ya están seleccionadas. Podés cambiar la selección.</p>
          </div>
          <span className="cotizacion-seleccion-resumen">{companiasElegidas.length} de {aseguradorasDisponibles.length} seleccionadas</span>
        </div>
        {aseguradorasDisponibles.length ? (
          <>
            <div className="cotizacion-aseguradoras-acciones">
              <button type="button" onClick={seleccionarTodas} disabled={companiasElegidas.length === aseguradorasDisponibles.length}>Seleccionar todas</button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={limpiarCompanias} disabled={!companiasElegidas.length}>Limpiar selección</button>
            </div>
            <div className="cotizacion-aseguradoras-grid">
              {aseguradorasDisponibles.map((aseguradora) => {
                const marcada = companiasElegidas.includes(aseguradora.nombre);
                return (
                  <label key={aseguradora.id} className={`cotizacion-aseguradora-opcion${marcada ? " seleccionada" : ""}`}>
                    <input type="checkbox" name="companias" value={aseguradora.nombre} checked={marcada} onChange={() => alternarCompania(aseguradora.nombre)} />
                    <span className="cotizacion-aseguradora-check" aria-hidden="true">{marcada ? "✓" : ""}</span>
                    <span className="cotizacion-aseguradora-detalle"><strong>{aseguradora.nombre}</strong></span>
                  </label>
                );
              })}
            </div>
          </>
        ) : (
          <div className="cotizacion-sin-aseguradoras">
            <span aria-hidden="true">ⓘ</span>
            <div><strong>No hay aseguradoras activas para {ramo}.</strong><p>Podés agregarlas o habilitarlas desde la configuración del agente.</p></div>
            <Link href="/agentes/cotizacion/configuracion" className="boton">Ir a configuración</Link>
          </div>
        )}
      </section>

      <section className="cotizacion-form-seccion" aria-labelledby="cotizacion-adjunto-titulo">
        <div className="cotizacion-seccion-encabezado">
          <span className="cotizacion-paso" aria-hidden="true">5</span>
          <div>
            <h2 id="cotizacion-adjunto-titulo">Adjuntá documentación <small>Opcional</small></h2>
            <p>Podés sumar una ficha, una póliza o una cotización anterior (PDF, Word, Excel o imagen; hasta 25 MB).</p>
          </div>
        </div>
        <label className="cotizacion-archivo-campo">
          <span className="cotizacion-archivo-icono" aria-hidden="true">↑</span>
          <span className="cotizacion-archivo-texto"><strong>{archivo || "Elegir un archivo"}</strong><small>{archivo ? "Archivo listo para adjuntar" : "PDF, DOCX, XLSX, XLS, PNG, JPG o WEBP · máximo 25 MB"}</small></span>
          <span className="boton cotizacion-archivo-boton">Buscar archivo</span>
          <input name="archivoInicial" type="file" accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp" onChange={(evento) => setArchivo(evento.target.files?.[0]?.name ?? "")} />
        </label>
      </section>

      <footer className="cotizacion-nueva-pie">
        <p><span aria-hidden="true">✓</span> Nada se envía a las aseguradoras sin tu aprobación.</p>
        <div>
          <Link href="/agentes/cotizacion" className="boton">Cancelar</Link>
          <BotonCrear bloqueado={!aseguradorasDisponibles.length || !companiasElegidas.length} />
        </div>
      </footer>
    </form>
  );
}
