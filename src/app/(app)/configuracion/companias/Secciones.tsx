import Link from "next/link";
import { Fragment } from "react";
import { BotonConfirmar, BotonEnviar, FormConError } from "@/components/Formularios";
import { ORDEN_CANALES } from "@/lib/conectores/canales";
import type { CredencialVisible } from "@/lib/conectores/credenciales";
import type { Capacidad, TipoConector } from "@/lib/conectores/tipos";
import {
  estadoCanal,
  permisoDe,
  TEXTO_CAPACIDAD,
  textoError,
  textoModo,
  TITULO_CANAL,
  type AgenteConector,
  type ModoCanales,
  type SaludGuardada,
} from "@/lib/conectores/vista";
import { diaYHora } from "@/lib/fechas";
import { COLUMNAS_LISTADO, leerMapeoListado } from "@/lib/validador/listados";
import {
  borrarCredencialCompania,
  dejarDeUsarPlantillaCompania,
  guardarCredencialCompania,
  guardarOrdenCanales,
  probarConexionCompania,
} from "./actions";

// Las partes de /configuracion/companias: canales y salud, qué puede hacer
// cada agente, el orden de los canales, las credenciales y, para el
// Validador, la plantilla de sus listados.

export type Ubicacion = { compania: string; agente: AgenteConector | null };

export const urlCompanias = (u: Ubicacion, extra: Record<string, string> = {}) =>
  `/configuracion/companias?${new URLSearchParams({ cia: u.compania, ...(u.agente ? { agente: u.agente } : {}), ...extra })}`;

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** 120 → "120 ms", 2400 → "2,4 s". */
const tiempo = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} s`);

/** Los campos ocultos que dicen a qué compañía y agente volver. */
function Ocultos({ u }: { u: Ubicacion }) {
  return (
    <>
      <input type="hidden" name="compania" value={u.compania} />
      {u.agente && <input type="hidden" name="agente" value={u.agente} />}
    </>
  );
}

// ---------- Canales y salud ----------

export type ConectorVisible = { tipo: TipoConector; capacidades: readonly Capacidad[] };

export function TablaCanales({ u, conectores, enUso, salud }: { u: Ubicacion; conectores: ConectorVisible[]; enUso: TipoConector[]; salud: SaludGuardada[] }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla tabla-compacta cias-tabla-canales">
        <thead>
          <tr>
            <th scope="col">Canal</th>
            <th scope="col">Estado</th>
            <th scope="col">Último éxito</th>
            <th scope="col">Último error</th>
            <th scope="col">Respuesta</th>
            <th scope="col">
              <span className="visualmente-oculto">Probar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {conectores.map((c) => {
            const s = salud.find((x) => x.canal === c.tipo);
            const estado = estadoCanal(s);
            const lugar = enUso.indexOf(c.tipo);
            return (
              <tr key={c.tipo}>
                <td>
                  <span className="celda-fuerte">{TITULO_CANAL[c.tipo]}</span>
                  <div className="texto-suave">{lugar >= 0 ? `${lugar + 1}.º en el orden` : "No se usa por el orden elegido"}</div>
                </td>
                <td>
                  <span className={`pastilla pastilla-${estado.tono}`}>{estado.texto}</span>
                </td>
                <td className="tabular">{s?.ultimoExitoEl ? diaYHora(s.ultimoExitoEl) : "—"}</td>
                <td>
                  {s?.ultimoErrorEl ? (
                    <>
                      <span className="tabular">{diaYHora(s.ultimoErrorEl)}</span>
                      <div className="texto-suave">{textoError(s.codigoUltimoError)}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular">{s?.latenciaMs != null ? tiempo(s.latenciaMs) : "—"}</td>
                <td>
                  <FormConError accion={probarConexionCompania} className="cias-probar">
                    <Ocultos u={u} />
                    <input type="hidden" name="canal" value={c.tipo} />
                    <BotonEnviar texto="Probar conexión" enviando="Probando…" className="boton boton-mediano" />
                  </FormConError>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Qué puede hacer cada agente con la compañía, por qué canal y cuándo lo hace solo. */
export function TablaCapacidades({
  agentes,
  conectores,
}: {
  agentes: { nombre: string; capacidades: readonly Capacidad[] }[];
  conectores: ConectorVisible[];
}) {
  return (
    <div className="tabla-scroll">
      <table className="tabla tabla-compacta cias-tabla-texto">
        <thead>
          <tr>
            <th scope="col">Qué hace</th>
            {agentes.length > 1 && <th scope="col">Agente</th>}
            <th scope="col">Por</th>
            <th scope="col">Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {agentes.flatMap((a) =>
            a.capacidades.map((capacidad) => {
              const canales = conectores.filter((c) => c.capacidades.includes(capacidad)).map((c) => TITULO_CANAL[c.tipo]);
              return (
                <tr key={capacidad}>
                  <td>{TEXTO_CAPACIDAD[capacidad]}</td>
                  {agentes.length > 1 && <td>{a.nombre}</td>}
                  <td className={canales.length ? undefined : "texto-suave"}>{canales.length ? canales.join(", ") : "No disponible"}</td>
                  <td>{permisoDe(capacidad)}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Orden de los canales ----------

export function FormOrdenCanales({ u, modo }: { u: Ubicacion; modo: ModoCanales }) {
  const actual = modo.modo === "propio" ? modo.canales : ORDEN_CANALES;
  const id = (n: string) => `orden-${n}`;
  return (
    <FormConError accion={guardarOrdenCanales} className="cias-orden">
      <Ocultos u={u} />
      <p className="texto-suave">
        Hoy: <span className="celda-fuerte">{textoModo(modo)}</span>
      </p>
      <fieldset className="cias-opciones">
        <legend className="visualmente-oculto">Cómo se conectan los agentes con {u.compania}</legend>
        <label className="cias-opcion">
          <input type="radio" name="modo" value="automatico" defaultChecked={modo.modo === "automatico"} />
          <span>
            <span className="celda-fuerte">Automático</span>
            <span className="texto-suave"> · conexión directa, después portal y después archivo, entre los que haya.</span>
          </span>
        </label>
        <label className="cias-opcion">
          <input type="radio" name="modo" value="propio" defaultChecked={modo.modo === "propio"} />
          <span className="celda-fuerte">En este orden</span>
        </label>
        <div className="cias-lugares">
          {ORDEN_CANALES.map((canal) => {
            const lugar = actual.indexOf(canal);
            return (
              <div key={canal} className="form-columna">
                <label htmlFor={id(canal)} className="etiqueta">
                  {TITULO_CANAL[canal]}
                </label>
                <select id={id(canal)} name={`lugar-${canal}`} className="campo" defaultValue={lugar >= 0 ? String(lugar + 1) : ""}>
                  <option value="">No usar</option>
                  {ORDEN_CANALES.map((_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}.º
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <label className="cias-opcion">
          <input type="radio" name="modo" value="manual" defaultChecked={modo.modo === "manual"} />
          <span>
            <span className="celda-fuerte">Solo correo o carga manual</span>
            <span className="texto-suave"> · los agentes no usan ninguna conexión automática con {u.compania}.</span>
          </span>
        </label>
      </fieldset>
      <p className="nota-pie">Vale para los tres agentes. Si un canal falla, el agente pasa al siguiente y lo deja registrado.</p>
      <BotonEnviar texto="Guardar el orden" enviando="Guardando…" />
    </FormConError>
  );
}

// ---------- Credenciales ----------

const ESTADO_CREDENCIAL: Record<string, { texto: string; tono: string }> = {
  activa: { texto: "Activa", tono: "verde" },
  vencida: { texto: "Vencida", tono: "rojo" },
  desactivada: { texto: "Desactivada", tono: "gris" },
};

function CamposCredencial({ c, prefijo }: { c?: CredencialVisible; prefijo: string }) {
  const id = (n: string) => `${prefijo}-${n}`;
  return (
    <>
      <div className="form-columna">
        <label htmlFor={id("etiqueta")} className="etiqueta">
          Etiqueta
        </label>
        <input id={id("etiqueta")} name="etiqueta" className="campo" defaultValue={c?.etiqueta} placeholder="Productor principal" required maxLength={80} />
      </div>
      <div className="form-columna">
        <label htmlFor={id("usuario")} className="etiqueta">
          Usuario del portal
        </label>
        <input id={id("usuario")} name="usuario" className="campo" defaultValue={c?.usuario} autoComplete="off" required maxLength={120} />
      </div>
      <div className="form-columna">
        <label htmlFor={id("secreto")} className="etiqueta">
          {c ? "Contraseña nueva (opcional)" : "Contraseña"}
        </label>
        <input id={id("secreto")} name="secreto" type="password" className="campo" autoComplete="new-password" required={!c} maxLength={200} />
      </div>
      {c && (
        <div className="form-columna">
          <label htmlFor={id("estado")} className="etiqueta">
            Estado
          </label>
          <select id={id("estado")} name="estado" className="campo" defaultValue={c.estado}>
            <option value="activa">Activa</option>
            <option value="vencida">Vencida</option>
            <option value="desactivada">Desactivada</option>
          </select>
        </div>
      )}
    </>
  );
}

export function SeccionCredenciales({ u, credenciales, editando }: { u: Ubicacion; credenciales: CredencialVisible[]; editando: number | null }) {
  return (
    <>
      <div className="tabla-scroll">
        <table className="tabla tabla-compacta cias-tabla-credenciales">
          <thead>
            <tr>
              <th scope="col">Etiqueta</th>
              <th scope="col">Usuario</th>
              <th scope="col">Estado</th>
              <th scope="col">Último uso</th>
              <th scope="col">Creada</th>
              <th scope="col">
                <span className="visualmente-oculto">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {credenciales.map((c) => {
              const estado = ESTADO_CREDENCIAL[c.estado] ?? { texto: c.estado, tono: "gris" };
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="celda-fuerte">{c.etiqueta}</td>
                    <td>{c.usuario}</td>
                    <td>
                      <span className={`pastilla pastilla-${estado.tono}`}>{estado.texto}</span>
                    </td>
                    <td className="tabular">{c.ultimoUsoEl ? diaYHora(c.ultimoUsoEl) : "Nunca"}</td>
                    <td className="tabular">{diaYHora(c.creadoEl)}</td>
                    <td>
                      <div className="acciones-rapidas acciones-derecha cias-acciones">
                        <Link href={urlCompanias(u, editando === c.id ? {} : { editar: String(c.id) })} scroll={false} className="boton-texto" aria-expanded={editando === c.id}>
                          Editar
                        </Link>
                        <BotonConfirmar
                          accion={borrarCredencialCompania}
                          campos={{ id: c.id, compania: u.compania, ...(u.agente ? { agente: u.agente } : {}) }}
                          texto="Borrar"
                          pregunta={`¿Borrar la credencial “${c.etiqueta}” de ${u.compania}? No se puede deshacer.`}
                        />
                      </div>
                    </td>
                  </tr>
                  {editando === c.id && (
                    <tr className="cias-fila-panel">
                      <td colSpan={6}>
                        <FormConError accion={guardarCredencialCompania} className="form-grilla cias-form">
                          <Ocultos u={u} />
                          <input type="hidden" name="id" value={c.id} />
                          <CamposCredencial c={c} prefijo={`cred-${c.id}`} />
                          <BotonEnviar texto="Guardar cambios" enviando="Guardando…" className="boton boton-primario boton-mediano cias-boton-grilla" />
                        </FormConError>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {credenciales.length === 0 && <p className="vacio">{u.compania} no tiene credenciales cargadas.</p>}

      <details className="cias-agregar" open={credenciales.length === 0}>
        <summary className="boton boton-mediano">+ Agregar credencial</summary>
        <FormConError accion={guardarCredencialCompania} className="form-grilla cias-form">
          <Ocultos u={u} />
          <CamposCredencial prefijo="cred-nueva" />
          <BotonEnviar texto="Guardar credencial" enviando="Guardando…" className="boton boton-primario boton-mediano cias-boton-grilla" />
        </FormConError>
      </details>
    </>
  );
}

// ---------- Plantilla de los listados del Validador ----------

export type Plantilla = { id: number; version: number; origen: string; confirmado: boolean; confirmadoEl: Date | null; mapeo: Record<string, unknown> };

export function PlantillaDeImportacion({ u, plantillas }: { u: Ubicacion; plantillas: Plantilla[] }) {
  const vigente = plantillas.find((p) => p.confirmado);
  const mapeo = vigente ? leerMapeoListado(vigente.mapeo) : null;
  const nombre = (campo: string) => COLUMNAS_LISTADO.find((c) => c.id === campo)?.nombre ?? campo;
  if (!vigente || !mapeo) {
    return (
      <p className="texto-suave">
        Todavía no hay plantilla: la primera vez que subas un listado de {u.compania} al Validador vas a confirmar qué dato tiene cada columna, y queda guardada acá.
      </p>
    );
  }
  return (
    <>
      <p className="texto-suave">
        Versión {vigente.version}, {vigente.origen === "ia" ? "propuesta por la IA" : "armada a mano"} y confirmada
        {vigente.confirmadoEl ? ` el ${diaYHora(vigente.confirmadoEl)}` : ""}. Los listados de {u.compania} con estas columnas se leen solos.
      </p>
      <div className="tabla-scroll">
        <table className="tabla tabla-compacta cias-tabla-texto">
          <thead>
            <tr>
              <th scope="col">Columna del listado</th>
              <th scope="col">Dato en UNIQO</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(mapeo.columnas).map(([columna, campo]) => (
              <tr key={columna}>
                <td>{columna}</td>
                <td>{nombre(campo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota-pie">
        {mapeo.estadoPorDefecto ? `Sin columna de estado: todo el listado son cuotas ${mapeo.estadoPorDefecto === "pagada" ? "pagas" : "impagas"}. ` : ""}
        Moneda si no la dice: {mapeo.monedaPorDefecto === "USD" ? "dólares" : "pesos"}.
        {Object.keys(mapeo.estados).length ? ` ${cuantos(Object.keys(mapeo.estados).length, "estado propio", "estados propios")} de la compañía.` : ""}
        {plantillas.length > 1 ? ` Hay ${cuantos(plantillas.length - 1, "versión anterior", "versiones anteriores")}.` : ""}
      </p>
      <BotonConfirmar
        accion={dejarDeUsarPlantillaCompania}
        campos={{ id: vigente.id, compania: u.compania, ...(u.agente ? { agente: u.agente } : {}) }}
        texto="Dejar de usar esta plantilla"
        pregunta={`¿Dejar de usar la plantilla de ${u.compania}? El próximo listado te va a pedir que confirmes las columnas de nuevo.`}
        className="boton boton-mediano"
      />
    </>
  );
}
