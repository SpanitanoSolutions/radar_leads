import Link from "next/link";
import { Fragment } from "react";
import type { ValidadorCorrida } from "@/db/schema";
import type { CredencialVisible } from "@/lib/conectores/credenciales";
import { diaYHora } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import { RAMOS_CARTERA } from "@/lib/ramos";
import { ZONAS_HORARIAS, type ConfigValidador } from "@/lib/validador/configuracion";
import { TODOS_LOS_RAMOS, type FilaGrilla } from "@/lib/validador/gracia";
import { COLUMNAS_LISTADO, leerMapeoListado } from "@/lib/validador/listados";
import { EVENTOS_VALIDADOR, type NotificacionesLeidas } from "@/lib/validador/notificaciones";
import { BotonEnviar, FormConError } from "../Formularios";
import {
  borrarCredencialPortal,
  dejarDeUsarPlantilla,
  enviarAvisoDePrueba,
  guardarCredencialPortal,
  guardarGraciaRamo,
  guardarNotificaciones,
  guardarProgramacion,
  guardarTolerancia,
} from "./actions";
import { BotonConfirmar } from "./BotonConfirmar";

// Las cuatro pestañas de /agentes/validador/configuracion (sección 5.6 de
// docs/specs/validador-v2.md).

const url = (params: Record<string, string>) => `/agentes/validador/configuracion?${new URLSearchParams(params)}`;
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ---------- Credenciales ----------

export type CompaniaCredenciales = { nombre: string; total: number; activas: number };
type Plantilla = { id: number; version: number; origen: string; confirmado: boolean; confirmadoEl: Date | null; mapeo: Record<string, unknown> };
type Salud = { canal: string; ultimoExitoEl: Date | null; ultimoErrorEl: Date | null; codigoUltimoError: string | null; credencialVencida: boolean; portalCambiado: boolean };

const ESTADO_CREDENCIAL: Record<string, { texto: string; tono: string }> = {
  activa: { texto: "Activa", tono: "verde" },
  vencida: { texto: "Vencida", tono: "rojo" },
  desactivada: { texto: "Desactivada", tono: "gris" },
};

/** "Federación Patronal" → "federacion-patronal": el identificador del proveedor. */
const identificador = (nombre: string) =>
  nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

function PlantillaDeImportacion({ compania, plantillas }: { compania: string; plantillas: Plantilla[] }) {
  const vigente = plantillas.find((p) => p.confirmado);
  const mapeo = vigente ? leerMapeoListado(vigente.mapeo) : null;
  const nombre = (campo: string) => COLUMNAS_LISTADO.find((c) => c.id === campo)?.nombre ?? campo;
  return (
    <section aria-labelledby="t-plantilla" className="config-bloque">
      <h3 id="t-plantilla" className="titulo-tarjeta">
        Plantilla de importación
      </h3>
      {!vigente || !mapeo ? (
        <p className="texto-suave">
          Todavía no hay plantilla: la primera vez que subas un listado de {compania} vas a confirmar qué dato tiene cada columna, y queda guardada acá.
        </p>
      ) : (
        <>
          <p className="texto-suave">
            Versión {vigente.version}, {vigente.origen === "ia" ? "propuesta por la IA" : "armada a mano"} y confirmada
            {vigente.confirmadoEl ? ` el ${diaYHora(vigente.confirmadoEl)}` : ""}. Los listados de {compania} con estas columnas se leen solos.
          </p>
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta tabla-plantilla">
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
            accion={dejarDeUsarPlantilla}
            campos={{ id: vigente.id, compania }}
            texto="Dejar de usar esta plantilla"
            pregunta={`¿Dejar de usar la plantilla de ${compania}? El próximo listado te va a pedir que confirmes las columnas de nuevo.`}
            className="boton boton-mediano"
          />
        </>
      )}
    </section>
  );
}

export function PestanaCredenciales({
  companias,
  seleccionada,
  credenciales,
  plantillas,
  salud,
  conectores,
  editando,
}: {
  companias: CompaniaCredenciales[];
  seleccionada: string;
  credenciales: CredencialVisible[];
  plantillas: Plantilla[];
  salud: Salud[];
  conectores: number;
  /** La credencial que se está editando (?editar=id): su formulario va en la fila de abajo. */
  editando: number | null;
}) {
  const activas = credenciales.filter((c) => c.estado === "activa").length;
  return (
    <div className="config-credenciales">
      <nav aria-label="Compañías" className="tarjeta config-companias">
        <div className="lista-cabecera">
          <span className="lista-titulo">Compañías</span>
          <span className="contador-gris">{companias.length}</span>
        </div>
        <ul>
          {companias.map((c) => (
            <li key={c.nombre}>
              <Link href={url({ tab: "credenciales", cia: c.nombre })} aria-current={c.nombre === seleccionada ? "page" : undefined} className="config-compania">
                <span className={`punto-estado ${c.activas ? "punto-verde" : "punto-ambar"}`}>{c.nombre}</span>
                <span className="texto-suave tabular">{c.total}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="t-compania" className="tarjeta tarjeta-padding config-detalle">
        <h2 id="t-compania" className="titulo-seccion">
          {seleccionada}
        </h2>
        <dl className="config-datos">
          <div>
            <dt>Tipo</dt>
            <dd>Portal de aseguradora</dd>
          </div>
          <div>
            <dt>Credenciales</dt>
            <dd>
              {credenciales.length} ({cuantos(activas, "activa", "activas")})
            </dd>
          </div>
          <div>
            <dt>Identificador del proveedor</dt>
            <dd>
              <code>{identificador(seleccionada)}</code>
            </dd>
          </div>
          <div>
            <dt>Conexión</dt>
            <dd>{conectores ? "Conector simulado (API y portal)" : "Sin conector: los pagos entran por los listados que subís"}</dd>
          </div>
        </dl>
        {salud.map((s) => (
          <p key={s.canal} className="texto-suave">
            Canal {s.canal}: {s.ultimoExitoEl ? `último éxito ${diaYHora(s.ultimoExitoEl)}` : "sin éxitos todavía"}
            {s.ultimoErrorEl ? `; último error ${diaYHora(s.ultimoErrorEl)}${s.codigoUltimoError ? ` (${s.codigoUltimoError.replace(/_/g, " ")})` : ""}` : ""}
            {s.credencialVencida ? "; la credencial venció" : ""}
            {s.portalCambiado ? "; el portal cambió" : ""}.
          </p>
        ))}
        <p className="nota-pie">
          Las contraseñas se guardan cifradas y no se vuelven a mostrar. Por ahora solo se guardan: todavía no hay conexión real con el portal de la compañía.
        </p>

        <div className="tabla-scroll">
          <table className="tabla tabla-compacta tabla-credenciales">
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
                        <div className="acciones-rapidas acciones-derecha config-acciones">
                          <Link
                            href={url(editando === c.id ? { tab: "credenciales", cia: seleccionada } : { tab: "credenciales", cia: seleccionada, editar: String(c.id) })}
                            scroll={false}
                            className="boton-texto"
                            aria-expanded={editando === c.id}
                          >
                            Editar
                          </Link>
                          <BotonConfirmar
                            accion={borrarCredencialPortal}
                            campos={{ id: c.id, compania: seleccionada }}
                            texto="Borrar"
                            pregunta={`¿Borrar la credencial “${c.etiqueta}” de ${seleccionada}? No se puede deshacer.`}
                          />
                        </div>
                      </td>
                    </tr>
                    {editando === c.id && (
                      <tr className="fila-panel">
                        <td colSpan={6}>
                          <FormConError accion={guardarCredencialPortal} className="form-grilla config-form">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="compania" value={seleccionada} />
                            <CamposCredencial c={c} prefijo={`cred-${c.id}`} />
                            <BotonEnviar texto="Guardar cambios" enviando="Guardando…" className="boton boton-primario boton-mediano boton-en-grilla" />
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
        {credenciales.length === 0 && <p className="vacio">{seleccionada} no tiene credenciales cargadas.</p>}

        <details className="config-agregar" open={credenciales.length === 0}>
          <summary className="boton boton-mediano">+ Agregar credencial</summary>
          <FormConError accion={guardarCredencialPortal} className="form-grilla config-form">
            <input type="hidden" name="compania" value={seleccionada} />
            <CamposCredencial prefijo="cred-nueva" />
            <BotonEnviar texto="Guardar credencial" enviando="Guardando…" className="boton boton-primario boton-mediano boton-en-grilla" />
          </FormConError>
        </details>

        <PlantillaDeImportacion compania={seleccionada} plantillas={plantillas} />
      </section>
    </div>
  );
}

// ---------- General ----------

const RAMOS = [{ id: TODOS_LOS_RAMOS, nombre: "Todos los ramos" }, ...RAMOS_CARTERA];
const textoDias = (d: { diasPrimera: number; diasSiguientes: number }) => `${d.diasPrimera} y ${d.diasSiguientes} días`;

export function PestanaGeneral({
  ramo,
  grilla,
  graciaHabilitada,
  otras,
  tolerancia,
}: {
  ramo: string;
  grilla: FilaGrilla[];
  graciaHabilitada: boolean;
  otras: string[];
  tolerancia: number;
}) {
  const todos = ramo === TODOS_LOS_RAMOS;
  const sinGracia = todos ? grilla.filter((g) => !g.propia).length : 0;
  return (
    <>
      <section aria-labelledby="t-gracia" className="tarjeta tarjeta-padding">
        <h2 id="t-gracia" className="titulo-seccion">
          Períodos de gracia por ramo
        </h2>
        <p className="texto-suave">
          Días adicionales después del vencimiento antes de marcar una cuota como vencida. Se configura por ramo y compañía, con un valor para la 1.ª cuota y otro para
          las siguientes. En un ramo, si no cargás nada, usa lo de &ldquo;Todos los ramos&rdquo;.
        </p>
        <nav aria-label="Ramos" className="segmentos config-ramos">
          {RAMOS.map((r) => (
            <Link
              key={r.id}
              href={url(r.id === TODOS_LOS_RAMOS ? { tab: "general" } : { tab: "general", ramo: r.id })}
              scroll={false}
              aria-current={r.id === ramo ? "true" : undefined}
              className="segmento"
            >
              {r.nombre}
            </Link>
          ))}
        </nav>
        {sinGracia > 0 && (
          <p className="config-nota">
            {cuantos(sinGracia, "compañía no tiene", "compañías no tienen")} gracia cargada: sus cuotas pasan a vencidas al día siguiente del vencimiento.
          </p>
        )}
        {/* La clave rearma el formulario al cambiar de ramo: si no, los campos se quedan con los valores del ramo anterior. */}
        <FormConError key={`${ramo}|${JSON.stringify(grilla.map((g) => g.propia))}`} accion={guardarGraciaRamo} className="config-gracia">
          <input type="hidden" name="ramo" value={ramo} />
          <input type="hidden" name="filas" value={grilla.length} />
          <label className="config-interruptor">
            <input type="checkbox" name="graciaHabilitada" className="interruptor" defaultChecked={graciaHabilitada} />
            <span>Habilitar períodos de gracia</span>
          </label>
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta tabla-gracia">
              <thead>
                <tr>
                  <th scope="col">Compañía</th>
                  <th scope="col">1.ª cuota (días)</th>
                  <th scope="col">Cuotas siguientes (días)</th>
                  <th scope="col">Qué rige</th>
                </tr>
              </thead>
              <tbody>
                {grilla.map((g, i) => (
                  <tr key={g.compania}>
                    <td className="celda-fuerte">
                      {g.compania}
                      <input type="hidden" name={`compania-${i}`} value={g.compania} />
                    </td>
                    <td>
                      <input
                        name={`primera-${i}`}
                        aria-label={`Días de gracia de la 1.ª cuota en ${g.compania}`}
                        className="campo campo-dias"
                        inputMode="numeric"
                        defaultValue={g.propia?.diasPrimera ?? ""}
                        placeholder={g.heredada ? String(g.heredada.diasPrimera) : ""}
                      />
                    </td>
                    <td>
                      <input
                        name={`siguientes-${i}`}
                        aria-label={`Días de gracia de las cuotas siguientes en ${g.compania}`}
                        className="campo campo-dias"
                        inputMode="numeric"
                        defaultValue={g.propia?.diasSiguientes ?? ""}
                        placeholder={g.heredada ? String(g.heredada.diasSiguientes) : ""}
                      />
                    </td>
                    <td>
                      {g.propia ? (
                        <span className="texto-suave">{todos ? textoDias(g.propia) : `Propia de este ramo: ${textoDias(g.propia)}`}</span>
                      ) : g.heredada ? (
                        <span className="texto-suave">La de todos los ramos: {textoDias(g.heredada)}</span>
                      ) : (
                        <span className="pastilla pastilla-ambar">Sin gracia cargada</span>
                      )}
                    </td>
                  </tr>
                ))}
                {otras.length > 0 && (
                  <tr>
                    <td>
                      <select name="compania-nueva" aria-label="Agregar otra compañía" className="campo" defaultValue="">
                        <option value="">Agregar otra compañía…</option>
                        {otras.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input name="primera-nueva" aria-label="Días de la 1.ª cuota de la compañía nueva" className="campo campo-dias" inputMode="numeric" />
                    </td>
                    <td>
                      <input name="siguientes-nueva" aria-label="Días de las cuotas siguientes de la compañía nueva" className="campo campo-dias" inputMode="numeric" />
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="nota-pie">Dejá los dos valores vacíos para {todos ? "quitar la gracia de la compañía" : "que use lo de todos los ramos"}.</p>
          <div className="fila-acciones">
            <BotonEnviar texto="Guardar cambios" enviando="Guardando…" />
          </div>
        </FormConError>
      </section>

      <section aria-labelledby="t-tolerancia" className="tarjeta tarjeta-padding">
        <h2 id="t-tolerancia" className="titulo-seccion">
          Coincidencia de montos
        </h2>
        <p className="texto-suave">
          La diferencia que se acepta entre lo que informa la compañía (o un comprobante) y la cuota para darlos por iguales. Hoy: {importe(tolerancia, "ARS")}.
        </p>
        <FormConError accion={guardarTolerancia} className="form-grilla config-form">
          <div className="form-columna">
            <label htmlFor="tolerancia" className="etiqueta">
              Tolerancia (en la moneda de la cuota)
            </label>
            <input id="tolerancia" name="tolerancia" className="campo" inputMode="decimal" defaultValue={String(tolerancia).replace(".", ",")} required />
          </div>
          <BotonEnviar texto="Guardar" enviando="Guardando…" className="boton boton-primario boton-mediano boton-en-grilla" />
        </FormConError>
      </section>
    </>
  );
}

// ---------- Programación ----------

export type InfoEtapa = { ultima: ValidadorCorrida | null; proxima: Date | null };

const ESTADO_CORRIDA: Record<string, { texto: string; tono: string }> = {
  ok: { texto: "OK", tono: "verde" },
  con_errores: { texto: "Con errores", tono: "rojo" },
  en_curso: { texto: "En curso", tono: "azul" },
};

/** "viernes 30/10 a las 08:00", en la zona horaria de la programación. */
function cuandoEn(fecha: Date, zona: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-AR", { timeZone: zona, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(fecha)
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day}/${p.month} a las ${p.hour}:${p.minute}`;
}

export function PestanaProgramacion({
  config,
  info,
  agenteActivo,
  conIA,
  pasadas,
}: {
  config: ConfigValidador;
  info: Record<"validacion" | "enriquecimiento", InfoEtapa>;
  agenteActivo: boolean;
  conIA: boolean;
  pasadas: string[];
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const horaPasada = pasadas
    .map((h) => new Intl.DateTimeFormat("es-AR", { timeZone: config.zonaHoraria, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(`${hoy}T${h}:00Z`)))
    .join(" y ");
  return (
    <>
      <section aria-labelledby="t-programacion" className="tarjeta tarjeta-padding">
        <h2 id="t-programacion" className="titulo-seccion">
          Validación automática programada
        </h2>
        <p className="texto-suave">Ejecuta la validación de pagos automáticamente según la frecuencia configurada.</p>
        <FormConError accion={guardarProgramacion} className="form-grilla config-form">
          <div className="form-columna">
            <label htmlFor="frecuencia" className="etiqueta">
              Frecuencia
            </label>
            <select id="frecuencia" name="frecuencia" className="campo" defaultValue={config.frecuencia}>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal (los lunes)</option>
              <option value="mensual">Mensual (el 1.º)</option>
            </select>
          </div>
          <div className="form-columna">
            <label htmlFor="horaEjecucion" className="etiqueta">
              Hora de ejecución
            </label>
            <input id="horaEjecucion" name="horaEjecucion" type="time" className="campo" defaultValue={config.horaEjecucion} required />
          </div>
          <div className="form-columna">
            <label htmlFor="horaEnriquecimiento" className="etiqueta">
              Hora de enriquecimiento
            </label>
            <input id="horaEnriquecimiento" name="horaEnriquecimiento" type="time" className="campo" defaultValue={config.horaEnriquecimiento} required />
          </div>
          <div className="form-columna">
            <label htmlFor="zonaHoraria" className="etiqueta">
              Zona horaria
            </label>
            <select id="zonaHoraria" name="zonaHoraria" className="campo" defaultValue={config.zonaHoraria}>
              {ZONAS_HORARIAS.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.texto}
                </option>
              ))}
            </select>
          </div>
          <BotonEnviar texto="Guardar configuración" enviando="Guardando…" className="boton boton-primario boton-mediano boton-en-grilla" />
        </FormConError>
        <p className="nota-pie">
          La validación trae lo de cada compañía, lo cruza con la cartera y recalcula los estados. El enriquecimiento, más tarde,{" "}
          {conIA ? "lee con IA los listados y comprobantes pendientes, explica los casos a revisar y arma el resumen del día." : "procesa lo pendiente que no necesita IA y deja el resumen del día."}
        </p>
        <p className="config-nota">
          El sistema pasa a revisar una vez por día, a las {horaPasada}. Cada etapa corre en la primera pasada desde su hora: con frecuencia diaria, una hora más tarde
          que esa no llega a correr.
        </p>
      </section>

      <section aria-labelledby="t-ejecucion" className="tarjeta tarjeta-padding">
        <h2 id="t-ejecucion" className="titulo-seccion">
          Información de ejecución
        </h2>
        {!agenteActivo && (
          <p className="config-nota config-nota-error">
            El agente está inactivo: la programación no corre hasta que lo actives en <Link href="/agentes/validador">la pantalla del Validador</Link>.
          </p>
        )}
        <dl className="config-ejecucion">
          {(["validacion", "enriquecimiento"] as const).map((etapa) => {
            const { ultima, proxima } = info[etapa];
            const estado = ultima ? (ESTADO_CORRIDA[ultima.estado] ?? { texto: ultima.estado, tono: "gris" }) : null;
            return (
              <div key={etapa} className="config-etapa">
                <dt className="celda-fuerte">{etapa === "validacion" ? "Validación" : "Enriquecimiento"}</dt>
                <dd>
                  <div>
                    Última ejecución:{" "}
                    {ultima ? (
                      <>
                        {cuandoEn(ultima.iniciadaEl, config.zonaHoraria)} ({ultima.origen === "cron" ? "automática" : "pedida por vos"}){" "}
                        <span className={`pastilla pastilla-${estado!.tono}`}>{estado!.texto}</span>
                      </>
                    ) : (
                      "todavía no corrió"
                    )}
                  </div>
                  {ultima && ultima.errores.length > 0 && (
                    <ul className="errores-corrida">
                      {ultima.errores.map((e, i) => (
                        <li key={i}>
                          {e.compania && <span className="celda-fuerte">{e.compania}: </span>}
                          {e.mensaje}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div>
                    Próxima ejecución:{" "}
                    {proxima ? (
                      cuandoEn(proxima, config.zonaHoraria)
                    ) : (
                      <span className="texto-rojo">no va a correr con esta hora: elegí una hora hasta las {horaPasada}.</span>
                    )}
                  </div>
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="nota-pie">
          El detalle de cada corrida está en <Link href="/agentes/validador?ver=actividad">Actividad</Link>.
        </p>
      </section>
    </>
  );
}

// ---------- Notificaciones ----------

export function PestanaNotificaciones({
  config,
  conectados,
  conIA,
}: {
  config: NotificacionesLeidas;
  conectados: Record<"whatsapp" | "email", boolean>;
  conIA: boolean;
}) {
  const canal = (id: "whatsapp" | "email", nombre: string, ayuda: string) => (
    <fieldset className="config-canal">
      <legend className="titulo-tarjeta">{nombre}</legend>
      <label className="config-interruptor">
        <input type="checkbox" name={`${id}Activo`} className="interruptor" defaultChecked={config[id].activo} />
        <span>Activar</span>
      </label>
      {!conectados[id] && (
        <p className="config-nota">
          {nombre} no está conectado: los avisos no van a salir hasta que lo conectes en <Link href="/configuracion">Configuración → Conexiones</Link>.
        </p>
      )}
      <label htmlFor={`${id}-destinatarios`} className="etiqueta">
        Destinatarios (uno por línea)
      </label>
      <textarea id={`${id}-destinatarios`} name={`${id}Destinatarios`} className="campo" rows={3} defaultValue={config[id].destinatarios.join("\n")} placeholder={ayuda} />
    </fieldset>
  );
  return (
    <section aria-labelledby="t-notificaciones" className="tarjeta tarjeta-padding">
      <h2 id="t-notificaciones" className="titulo-seccion">
        Notificaciones
      </h2>
      <p className="texto-suave">
        Avisos para vos (o tu equipo) después de la validación automática. A tus asegurados no se les escribe desde acá: eso lo prepara{" "}
        <Link href="/agentes/cobranza">Cobranza</Link>, siempre como borrador para que lo apruebes.
      </p>
      <FormConError accion={guardarNotificaciones} className="config-notificaciones">
        <div className="config-canales">
          {canal("whatsapp", "WhatsApp", "+54 9 223 555-1234")}
          {canal("email", "Email", "vos@tuempresa.com.ar")}
        </div>
        <fieldset className="config-canal">
          <legend className="titulo-tarjeta">Qué avisar</legend>
          {EVENTOS_VALIDADOR.map((e) => (
            <label key={e.id} className="config-opcion">
              <input type="checkbox" name="eventos" value={e.id} defaultChecked={config.eventos.includes(e.id)} />
              <span>{e.texto}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="config-canal">
          <legend className="titulo-tarjeta">Cómo</legend>
          <label className="config-opcion">
            <input type="radio" name="modo" value="resumen" defaultChecked={config.modo === "resumen"} />
            <span>
              <strong>Resumen diario:</strong> un solo aviso por día, después del enriquecimiento, con el resumen del día{conIA ? " (lo arma la IA)" : ""} y una línea por cada
              cosa que elegiste.
            </span>
          </label>
          <label className="config-opcion">
            <input type="radio" name="modo" value="evento" defaultChecked={config.modo === "evento"} />
            <span>
              <strong>Evento por evento:</strong> apenas termina la validación automática, un aviso por cada cosa que elegiste y tenga novedades.
            </span>
          </label>
        </fieldset>
        <div className="fila-acciones">
          <BotonEnviar texto="Guardar notificaciones" enviando="Guardando…" />
        </div>
      </FormConError>
      <form action={enviarAvisoDePrueba} className="fila-acciones config-prueba">
        <BotonEnviar texto="Mandar un aviso de prueba" enviando="Mandando…" className="boton boton-mediano" />
        <span className="texto-suave">Usa lo guardado: guardá antes los cambios.</span>
      </form>
    </section>
  );
}
