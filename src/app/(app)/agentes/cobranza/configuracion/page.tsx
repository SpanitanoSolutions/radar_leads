import Link from "next/link";
import { isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Aviso } from "@/components/Aviso";
import { PanelLateral } from "@/components/PanelLateral";
import { leerConfigCobranza } from "@/agentes/cobranza/casos";
import { estadoCanales } from "@/agentes/cobranza/canales";
import { ultimaCorridaCron } from "@/agentes/cobranza/corridas";
import { NOMBRE_CANAL, NOMBRE_DIA } from "@/lib/cobranza/configuracion";
import { pasadasLocales, proximaPasada } from "@/lib/cobranza/programacion";
import { rangoDeTramo } from "@/lib/cobranza/tramos";
import { CANALES_COBRANZA, type CanalCobranza } from "@/lib/cobranza/tipos";
import { obtenerCuenta } from "@/lib/datos";
import { diaYHora } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { RAMOS_CARTERA } from "@/lib/ramos";
import { Migas } from "../Componentes";
import {
  borrarDemo,
  borrarTramo,
  cargarDemo,
  guardarCanal,
  guardarSeccion,
  guardarTramo,
  moverTramo,
  probarCanal,
  verificarCanal,
} from "./actions";
import "../../agentes.css";
import "../cobranza.css";

export const instant = false;

const SECCIONES = [
  { id: "estrategia", texto: "Estrategia" },
  { id: "filtros", texto: "Filtros" },
  { id: "horario", texto: "Horario" },
  { id: "informacion", texto: "Información" },
  { id: "notificaciones", texto: "Notificaciones" },
  { id: "pruebas", texto: "Pruebas" },
  { id: "demo", texto: "Demo" },
] as const;
type Seccion = (typeof SECCIONES)[number]["id"];

const ZONAS = [
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Cordoba",
  "America/Argentina/Mendoza",
  "America/Argentina/Salta",
  "America/Argentina/Tucuman",
  "America/Argentina/San_Luis",
  "America/Argentina/Ushuaia",
];

/** Mensajes de esta pantalla que llevan un detalle (el error, el destino, la cantidad). */
function avisoLocal(codigo: string | undefined, detalle: string): { texto: string; error?: boolean } | null {
  switch (codigo) {
    case "config-guardada":
      return { texto: "Configuración guardada." };
    case "config-invalida":
      return { texto: `No se guardó: ${detalle || "revisá los datos."}`, error: true };
    case "tramo-guardado":
      return { texto: "Tramo guardado." };
    case "tramo-borrado":
      return { texto: "Tramo borrado." };
    case "tramo-inexistente":
      return { texto: "Ese tramo ya no existe.", error: true };
    case "canal-guardado":
      return { texto: "Canal guardado." };
    case "canal-verificado":
      return { texto: "Remitente verificado: es el de la conexión de UNIQO." };
    case "canal-sin-conexion":
      return { texto: `${detalle} no está conectado. Conectalo en Configuración → Conexiones y volvé a verificar.`, error: true };
    case "canal-sin-destino":
      return { texto: "Escribí a dónde mandar la prueba.", error: true };
    case "canal-probado":
      return { texto: `Salió el mensaje de prueba a ${detalle}.` };
    case "canal-simulado":
      return { texto: `El canal no está conectado: la prueba a ${detalle} se simuló y no salió nada. Así se ve en modo prueba.` };
    case "canal-error":
      return { texto: `No salió la prueba: ${detalle}`, error: true };
    case "demo-cargada":
      return { texto: `Cargué ${detalle} recibos de ejemplo. Los ves en el tablero.` };
    case "demo-borrada":
      return { texto: detalle === "0" ? "No había demo para borrar." : `Borré la demo (${detalle} asegurados de ejemplo).` };
    default:
      return null;
  }
}

const unico = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function ConfiguracionCobranza({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = sp.tab === "canales" ? "canales" : "general";
  const seccion: Seccion = SECCIONES.find((s) => s.id === sp.seccion)?.id ?? "estrategia";
  const canalActual: CanalCobranza = CANALES_COBRANZA.find((c) => c === sp.canal) ?? "whatsapp";
  const [config, cuenta] = await Promise.all([leerConfigCobranza(), obtenerCuenta()]);
  const aviso = avisoLocal(unico(sp.aviso), unico(sp.detalle));

  return (
    <>
      <Migas items={[{ texto: "Agente de Cobranza", href: "/agentes/cobranza" }, { texto: "Configuración" }]} />
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <h1 className="titulo">Configuración</h1>
          <p className="subtitulo descripcion-agente">Cómo, cuándo y por dónde le escribe el agente a tus asegurados.</p>
        </div>
        <div className="fila-acciones">
          <Link href="/agentes/cobranza/instrucciones" className="boton boton-mediano">
            Ver agente →
          </Link>
        </div>
      </header>

      {aviso ? (
        <p className={`aviso aviso-${aviso.error ? "error" : "ok"}`} role={aviso.error ? "alert" : "status"}>
          {aviso.texto}
        </p>
      ) : (
        <Aviso codigo={sp.aviso} />
      )}

      <nav aria-label="Configuración" className="pestanas">
        <Link href="/agentes/cobranza/configuracion" aria-current={tab === "general" ? "page" : undefined} className="pestana">
          General
        </Link>
        <Link href="/agentes/cobranza/configuracion?tab=canales" aria-current={tab === "canales" ? "page" : undefined} className="pestana">
          Canales
        </Link>
      </nav>

      {tab === "canales" ? (
        await PestanaCanales({ canal: canalActual, config })
      ) : (
        <div className="cob-config">
          <nav aria-label="Secciones" className="cob-subnav">
            {SECCIONES.map((s) => (
              <Link key={s.id} href={`/agentes/cobranza/configuracion?seccion=${s.id}`} aria-current={seccion === s.id ? "page" : undefined} scroll={false}>
                {s.texto}
                {s.id === "pruebas" && config.modoPrueba && <span className="cob-chip cob-chip-ambar">On</span>}
              </Link>
            ))}
          </nav>
          <section className="tarjeta">{await contenidoGeneral(seccion, config, cuenta.nombre, unico(sp.tramo))}</section>
        </div>
      )}
    </>
  );
}

type Config = Awaited<ReturnType<typeof leerConfigCobranza>>;

async function contenidoGeneral(seccion: Seccion, config: Config, nombreCuenta: string | null, tramoAbierto: string) {
  const oculto = <input type="hidden" name="seccion" value={seccion} />;
  const guardarBoton = (
    <div className="fila-acciones">
      <button type="submit" className="boton boton-primario">
        Guardar
      </button>
    </div>
  );

  if (seccion === "estrategia") {
    const tramo = tramoAbierto === "nuevo" ? { id: "nuevo", nombre: "", minDias: null, maxDias: null, instrucciones: null } : config.tramos.find((t) => t.id === tramoAbierto);
    return (
      <>
        <form action={guardarSeccion} className="cob-formulario">
          {oculto}
          <h2>Estrategia</h2>
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="reglasGenerales">
              Reglas generales de cobranza
            </label>
            <textarea
              id="reglasGenerales"
              name="reglasGenerales"
              rows={5}
              className="campo"
              defaultValue={config.reglasGenerales}
              placeholder="Ej.: Firmar mensajes con el nombre del productor. Con clientes empresa usar tono formal. Si el cliente tiene varias pólizas vencidas, mencionarlas juntas."
            />
            <span className="nota-pie">Se suman a las instrucciones del agente, tal como las escribís.</span>
          </div>
          <h3>Reglas de re-contacto</h3>
          <div className="cob-campos">
            <Numero nombre="maxIntentos" etiqueta="Máximo de intentos por recibo" valor={config.maxIntentos} min={1} max={20} nota="Después, el caso se escala a vos." />
            <Numero nombre="diasEntreIntentos" etiqueta="Días entre intentos" valor={config.diasEntreIntentos} min={1} max={30} />
            <Numero nombre="diasGraciaPromesa" etiqueta="Días de gracia tras promesa de pago" valor={config.diasGraciaPromesa} min={0} max={30} />
            <Numero nombre="diasPrimerContacto" etiqueta="Primer contacto: días antes del vencimiento" valor={config.diasPrimerContacto} min={0} max={60} />
          </div>
          {guardarBoton}
        </form>
        <div className="cob-formulario">
          <div className="titulo-fila" style={{ justifyContent: "space-between" }}>
            <h3>Tramos de seguimiento</h3>
            <Link href="/agentes/cobranza/configuracion?seccion=estrategia&tramo=nuevo" scroll={false} className="boton boton-mediano">
              + Agregar tramo
            </Link>
          </div>
          <p className="texto-suave">Según los días para el vencimiento, el agente usa las instrucciones del primer tramo que coincide.</p>
          <ul className="cob-tramos">
            {config.tramos.map((t, i) => (
              <li key={t.id} className="cob-tramo">
                <div>
                  <Link href={`/agentes/cobranza/configuracion?seccion=estrategia&tramo=${t.id}`} scroll={false} id={`tramo-${t.id}`}>
                    {t.nombre}
                  </Link>
                  <div className="cob-mono cob-secundaria">
                    {t.id} · {rangoDeTramo(t)}
                  </div>
                </div>
                <div className="titulo-fila">
                  <span className={t.instrucciones ? "pastilla pastilla-verde" : "pastilla pastilla-gris"}>{t.instrucciones ? "Con instrucciones" : "Sin prompt configurado"}</span>
                  <form action={moverTramo}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="sentido" value="arriba" />
                    <button type="submit" className="boton boton-chico" disabled={i === 0} aria-label={`Subir ${t.nombre}`}>
                      ↑
                    </button>
                  </form>
                  <form action={moverTramo}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="sentido" value="abajo" />
                    <button type="submit" className="boton boton-chico" disabled={i === config.tramos.length - 1} aria-label={`Bajar ${t.nombre}`}>
                      ↓
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {tramo && (
          <PanelLateral tituloId="tramo-titulo" cerrarHref="/agentes/cobranza/configuracion?seccion=estrategia" volverA={`tramo-${tramo.id}`} ancho={560}>
            <div className="panel-cabecera">
              <h2 id="tramo-titulo" className="panel-titulo">
                {tramo.id === "nuevo" ? "Nuevo tramo" : tramo.nombre}
              </h2>
            </div>
            <div className="panel-cuerpo">
              <form action={guardarTramo} className="form-columna">
                <input type="hidden" name="id" value={tramo.id} />
                <label className="etiqueta" htmlFor="tramo-nombre">
                  Nombre
                </label>
                <input id="tramo-nombre" name="nombre" className="campo" defaultValue={tramo.nombre} required maxLength={80} />
                <div className="cob-campos">
                  <Numero nombre="minDias" etiqueta="Desde (días para vencer)" valor={tramo.minDias} min={-365} max={365} nota="Negativo = vencido. Vacío = sin límite." />
                  <Numero nombre="maxDias" etiqueta="Hasta (días para vencer)" valor={tramo.maxDias} min={-365} max={365} />
                </div>
                <label className="etiqueta" htmlFor="tramo-instrucciones">
                  Instrucciones para el agente
                </label>
                <textarea
                  id="tramo-instrucciones"
                  name="instrucciones"
                  rows={8}
                  className="campo"
                  defaultValue={tramo.instrucciones ?? ""}
                  placeholder="Ej.: Recordatorio amable. Mencioná que puede pagar por transferencia o débito. No hace falta insistir."
                />
                <p className="nota-pie">Si queda vacío, el agente sigue las reglas generales y usa criterio profesional.</p>
                <div className="fila-acciones">
                  <button type="submit" className="boton boton-primario">
                    Guardar tramo
                  </button>
                  {tramo.id !== "nuevo" && config.tramos.length > 1 && (
                    <button type="submit" formAction={borrarTramo} className="boton-terciario">
                      Borrar tramo
                    </button>
                  )}
                </div>
              </form>
            </div>
          </PanelLateral>
        )}
      </>
    );
  }

  if (seccion === "filtros") {
    const companias = await db
      .selectDistinct({ compania: schema.polizas.compania })
      .from(schema.polizas)
      .where(isNull(schema.polizas.bajaEl))
      .orderBy(sql`1`);
    const lista = [...new Set([...companias.map((c) => c.compania).filter((c): c is string => Boolean(c)), ...config.filtros.companias])].sort((a, b) => a.localeCompare(b, "es"));
    return (
      <form action={guardarSeccion} className="cob-formulario">
        {oculto}
        <h2>Filtros</h2>
        <p className="texto-suave">Qué recibos entran al agente. Sin ninguna marcada, entran todas. Lo que queda afuera va a la pestaña &ldquo;Excluidas por reglas&rdquo;.</p>
        <fieldset className="cob-campo">
          <legend className="etiqueta">Aseguradoras incluidas</legend>
          <div className="cob-campos">
            {lista.map((c) => (
              <label key={c} className="opcion-chica">
                <input type="checkbox" name="compania" value={c} defaultChecked={config.filtros.companias.includes(c)} /> {c}
              </label>
            ))}
            {lista.length === 0 && <span className="nota-pie">Todavía no hay compañías en la cartera.</span>}
          </div>
        </fieldset>
        <fieldset className="cob-campo">
          <legend className="etiqueta">Ramos incluidos</legend>
          <div className="cob-campos">
            {RAMOS_CARTERA.map((r) => (
              <label key={r.id} className="opcion-chica">
                <input type="checkbox" name="ramo" value={r.id} defaultChecked={config.filtros.ramos.includes(r.id)} /> {r.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="cob-campos">
          <Numero nombre="montoMinimo" etiqueta="Monto mínimo del recibo" valor={config.filtros.montoMinimo} min={0} nota={config.filtros.montoMinimo ? `Hoy: ${pesos(config.filtros.montoMinimo)}` : "Vacío: sin mínimo."} />
        </div>
        <label className="opcion">
          <input type="checkbox" name="excluirMarcados" defaultChecked={config.filtros.excluirMarcados} />
          <span>Excluir a los asegurados que marcaste para no contactar (los que pidieron la baja quedan afuera siempre).</span>
        </label>
        {guardarBoton}
      </form>
    );
  }

  if (seccion === "horario") {
    const ahora = new Date();
    const proxima = proximaPasada(config, await ultimaCorridaCron(), ahora);
    const [pasada] = pasadasLocales(config.zonaHoraria);
    return (
      <form action={guardarSeccion} className="cob-formulario">
        {oculto}
        <h2>Horario</h2>
        <div className="cob-campos">
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="horaEjecucion">
              Hora de ejecución diaria
            </label>
            <input id="horaEjecucion" name="horaEjecucion" type="time" className="campo" defaultValue={config.horaEjecucion} required />
          </div>
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="zonaHoraria">
              Zona horaria
            </label>
            <select id="zonaHoraria" name="zonaHoraria" className="campo" defaultValue={config.zonaHoraria}>
              {[...new Set([config.zonaHoraria, ...ZONAS])].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="cob-campo">
          <legend className="etiqueta">Días permitidos</legend>
          <div className="cob-chips-dias">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <label key={d} className="cob-chip-dia">
                <input type="checkbox" name="dia" value={d} defaultChecked={config.diasPermitidos.includes(d)} />
                <span>{NOMBRE_DIA[d]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="cob-campos">
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="ventanaDesde">
              Ventana de contacto: desde
            </label>
            <input id="ventanaDesde" name="ventanaDesde" type="time" className="campo" defaultValue={config.ventanaDesde} required />
          </div>
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="ventanaHasta">
              Hasta
            </label>
            <input id="ventanaHasta" name="ventanaHasta" type="time" className="campo" defaultValue={config.ventanaHasta} required />
          </div>
        </div>
        <p className="nota-caja">
          <span className="celda-fuerte">Próxima ejecución automática: </span>
          {proxima
            ? `${diaYHora(proxima)} (hora de ${config.zonaHoraria.split("/").at(-1)?.replace("_", " ")}).`
            : `ninguna. El cron pasa una vez por día a las ${pasada}: elegí esa hora o una anterior, y algún día permitido.`}{" "}
          Los días y la ventana valen para los mensajes reales; en modo prueba se puede probar a cualquier hora.
        </p>
        {guardarBoton}
      </form>
    );
  }

  if (seccion === "informacion") {
    return (
      <form action={guardarSeccion} className="cob-formulario">
        {oculto}
        <h2>Información</h2>
        <p className="texto-suave">Quién firma los mensajes y a quién le llegan los casos escalados.</p>
        <div className="cob-campos">
          <Texto nombre="firmanteNombre" etiqueta="Nombre del productor o ejecutivo" valor={config.firmanteNombre} placeholder={nombreCuenta ?? "Nombre que firma"} />
          <Texto nombre="firmanteEmail" etiqueta="Email" valor={config.firmanteEmail} tipo="email" />
          <Texto nombre="firmanteTelefono" etiqueta="Teléfono" valor={config.firmanteTelefono} />
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="idioma">
              Idioma
            </label>
            <select id="idioma" name="idioma" className="campo" defaultValue={config.idioma}>
              <option value="es-AR">Español (Argentina), con voseo</option>
            </select>
          </div>
        </div>
        {!config.firmanteNombre && nombreCuenta && <p className="nota-pie">Si queda vacío, firma con el nombre de Mi cuenta: {nombreCuenta}.</p>}
        {guardarBoton}
      </form>
    );
  }

  if (seccion === "notificaciones") {
    const n = config.notificaciones;
    return (
      <form action={guardarSeccion} className="cob-formulario">
        {oculto}
        <h2>Notificaciones</h2>
        <label className="opcion">
          <input type="checkbox" name="alEscalar" defaultChecked={n.alEscalar} />
          <span>Avisarme cuando el agente me pasa un caso (sin respuesta, rechazo o error).</span>
        </label>
        <label className="opcion">
          <input type="checkbox" name="alPrometer" defaultChecked={n.alPrometer} />
          <span>Avisarme cuando un asegurado promete pagar.</span>
        </label>
        <label className="opcion">
          <input type="checkbox" name="resumenDiario" defaultChecked={n.resumenDiario} />
          <span>Mandarme un resumen después de cada corrida automática.</span>
        </label>
        <div className="cob-campos">
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="canal">
              Por dónde
            </label>
            <select id="canal" name="canal" className="campo" defaultValue={n.canal}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="destinatarios">
              Destinatarios (uno por línea)
            </label>
            <textarea id="destinatarios" name="destinatarios" rows={3} className="campo" defaultValue={n.destinatarios.join("\n")} placeholder={config.firmanteEmail || "Vacío: el email o teléfono de Información"} />
          </div>
        </div>
        <p className="nota-pie">Salen por tu Gmail o WhatsApp conectado. Sin conexión, los avisos quedan solo en la línea de tiempo y en Ejecuciones.</p>
        {guardarBoton}
      </form>
    );
  }

  if (seccion === "pruebas") {
    const p = config.prueba;
    return (
      <form action={guardarSeccion} className="cob-formulario">
        {oculto}
        <h2>Pruebas</h2>
        <label className="cob-interruptor">
          <input type="checkbox" name="modoPrueba" className="interruptor" defaultChecked={config.modoPrueba} />
          <span>
            <span className="celda-fuerte">Modo prueba</span>
            <span className="nota-pie"> · todo contacto va a los datos de prueba, nunca al asegurado. Apagarlo es lo que habilita al agente a escribirle a tus clientes.</span>
          </span>
        </label>
        <label className="cob-interruptor">
          <input type="checkbox" name="pedirAprobacion" className="interruptor" defaultChecked={config.pedirAprobacion} />
          <span>
            <span className="celda-fuerte">Pedirme aprobación antes de enviar</span>
            <span className="nota-pie"> · con el modo prueba apagado, cada mensaje del agente espera en &ldquo;Para aprobar&rdquo;. Si lo apagás, escribe solo.</span>
          </span>
        </label>
        <div className="cob-campos">
          <Texto nombre="pruebaTelefono" etiqueta="Teléfono de prueba" valor={p.telefono} />
          <Texto nombre="pruebaWhatsapp" etiqueta="WhatsApp de prueba" valor={p.whatsapp} placeholder="Vacío: el teléfono de prueba" />
          <Texto nombre="pruebaEmail" etiqueta="Email de prueba" valor={p.email} tipo="email" />
          <Numero nombre="maxRecibos" etiqueta="Máx. recibos por corrida de prueba" valor={p.maxRecibos} min={1} max={50} />
        </div>
        <div className="cob-campos">
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="filtroTipo">
              Filtro de recibos
            </label>
            <select id="filtroTipo" name="filtroTipo" className="campo" defaultValue={p.filtro.tipo}>
              <option value="cualquiera">Cualquiera</option>
              <option value="tramo">Por tramo</option>
              <option value="compania">Por aseguradora</option>
            </select>
          </div>
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="filtroTramo">
              Tramo
            </label>
            <select id="filtroTramo" name="filtroTramo" className="campo" defaultValue={p.filtro.tipo === "tramo" ? p.filtro.tramo : config.tramos[0]?.id}>
              {config.tramos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <Texto nombre="filtroCompania" etiqueta="Aseguradora" valor={p.filtro.tipo === "compania" ? p.filtro.compania : ""} />
        </div>
        <p className="nota-pie">Sin destinos de prueba, o con el canal sin conectar, los mensajes se simulan: se ven en la línea de tiempo y no sale nada.</p>
        {guardarBoton}
      </form>
    );
  }

  return (
    <div className="cob-formulario">
      <h2>Demo</h2>
      <p className="texto-suave">
        Carga unos 100 recibos ficticios de aseguradoras argentinas, con vencimientos de 40 días atrás a 30 adelante, algunos sin contacto y otros excluidos, y su línea de tiempo con todos los tipos de evento. Todo queda marcado como ejemplo: nunca sale por una conexión real y se borra con &ldquo;Borrar datos de ejemplo&rdquo; o con el botón de abajo.
      </p>
      <div className="fila-acciones">
        <form action={cargarDemo}>
          <button type="submit" className="boton boton-primario">
            Cargar datos de ejemplo
          </button>
        </form>
        <form action={borrarDemo}>
          <button type="submit" className="boton">
            Borrar la demo de Cobranza
          </button>
        </form>
      </div>
    </div>
  );
}

async function PestanaCanales({ canal, config }: { canal: CanalCobranza; config: Config }) {
  const estado = await estadoCanales();
  const actual = config.canales[canal];
  const conexion = estado[canal];
  return (
    <div className="cob-canales">
      <nav aria-label="Canales" className="cob-subnav cob-lista-canales">
        <span className="cob-titulo-chico cob-subnav-titulo">Canales habilitados</span>
        {CANALES_COBRANZA.map((c) => (
          <Link key={c} href={`/agentes/cobranza/configuracion?tab=canales&canal=${c}`} aria-current={c === canal ? "page" : undefined} scroll={false}>
            {NOMBRE_CANAL[c]}
            <span className={`cob-chip ${config.canales[c].habilitado ? "cob-chip-verde" : "cob-chip-gris"}`}>{config.canales[c].habilitado ? "Activo" : "Inactivo"}</span>
          </Link>
        ))}
      </nav>
      <div className="cob-detalle-principal">
        <form action={guardarCanal} className="tarjeta cob-formulario">
          <input type="hidden" name="canal" value={canal} />
          <h2>{NOMBRE_CANAL[canal]}</h2>
          <label className="opcion">
            <input type="checkbox" name="habilitado" defaultChecked={actual.habilitado} />
            <span>Habilitado</span>
          </label>
          {canal === "telefono" && (
            <p className="nota-caja">
              Todavía no hay llamadas de voz con IA. En modo prueba la llamada se simula; en modo real, el agente te deja la llamada en &ldquo;Para aprobar&rdquo; con el guion, para que la hagas vos.
            </p>
          )}
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="instrucciones">
              Instrucciones
            </label>
            <textarea id="instrucciones" name="instrucciones" rows={5} className="campo" defaultValue={actual.instrucciones} placeholder="Estimado/a {nombre}, te recordamos que tu póliza vence en 15 días…" />
          </div>
          <div className="cob-campo">
            <label className="etiqueta" htmlFor="remitente">
              {canal === "email" ? "Email remitente" : "Número de salida"}
            </label>
            <input id="remitente" name="remitente" className="campo" defaultValue={actual.remitente ?? ""} placeholder={conexion.remitente ?? (canal === "email" ? "El de tu Gmail conectado" : "El de tu WhatsApp conectado")} />
            <span className="nota-pie">
              {actual.verificado ? "Verificado con la conexión de UNIQO." : conexion.conectado ? `Conectado: ${conexion.remitente ?? "sí"}. Verificalo para usarlo.` : "Sin conexión real: en modo prueba los mensajes se simulan."}
            </span>
          </div>
          <div className="fila-acciones">
            <button type="submit" className="boton boton-primario">
              Guardar
            </button>
            {canal !== "telefono" && (
              <button type="submit" formAction={verificarCanal} className="boton">
                Verificar
              </button>
            )}
            <Link href="/agentes/cobranza/instrucciones" className="nota-pie">
              Ver agente →
            </Link>
          </div>
        </form>

        <form action={probarCanal} className="tarjeta cob-formulario">
          <input type="hidden" name="canal" value={canal} />
          <h2>Test</h2>
          <div className="cob-campos">
            <Texto nombre="nombre" etiqueta="Nombre" valor="" placeholder="Juan" />
            <Texto nombre="destino" etiqueta={canal === "email" ? "Email" : "Teléfono"} valor={canal === "email" ? config.prueba.email : config.prueba.whatsapp || config.prueba.telefono} />
          </div>
          <div className="fila-acciones">
            <button type="submit" className="boton">
              Probar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Numero({ nombre, etiqueta, valor, min, max, nota }: { nombre: string; etiqueta: string; valor: number | null; min?: number; max?: number; nota?: string }) {
  return (
    <div className="cob-campo">
      <label className="etiqueta" htmlFor={nombre}>
        {etiqueta}
      </label>
      <input id={nombre} name={nombre} type="number" className="campo" defaultValue={valor ?? ""} min={min} max={max} step={1} />
      {nota && <span className="nota-pie">{nota}</span>}
    </div>
  );
}

function Texto({ nombre, etiqueta, valor, placeholder, tipo = "text" }: { nombre: string; etiqueta: string; valor: string; placeholder?: string; tipo?: string }) {
  return (
    <div className="cob-campo">
      <label className="etiqueta" htmlFor={nombre}>
        {etiqueta}
      </label>
      <input id={nombre} name={nombre} type={tipo} className="campo" defaultValue={valor} placeholder={placeholder} />
    </div>
  );
}
