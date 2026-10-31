import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Aviso } from "@/components/Aviso";
import { activarAgente, desactivarAgente } from "@/app/(app)/agentes/acciones";
import { leerConfigCobranza } from "@/agentes/cobranza/casos";
import { estadoCanales } from "@/agentes/cobranza/canales";
import { listarCorridas, ultimaCorridaCron } from "@/agentes/cobranza/corridas";
import { firmaDeLaCuenta } from "@/agentes/cobranza/motor";
import { NOMBRE_CANAL, NOMBRE_DIA } from "@/lib/cobranza/configuracion";
import { HERRAMIENTAS_COBRANZA } from "@/lib/cobranza/herramientas";
import { pasadasLocales, proximaPasada } from "@/lib/cobranza/programacion";
import { armarInstrucciones } from "@/lib/cobranza/prompt";
import { CANALES_COBRANZA } from "@/lib/cobranza/tipos";
import { agenteConfigurado } from "@/lib/datos-agentes";
import { diaYHora } from "@/lib/fechas";
import { estadoIA } from "@/lib/ia/ejecutar";
import { planDeTarea } from "@/lib/ia/modelos";
import { ejecutarAhora } from "../actions";
import { cambiarModo } from "../configuracion/actions";
import { Chip, Migas } from "../Componentes";
import { TablaCorridas } from "../ejecuciones/TablaCorridas";
import { Refrescar } from "../Refrescar";
import "../../agentes.css";
import "../cobranza.css";

export const instant = false;
export const maxDuration = 300;

const MOTIVO_IA = {
  sin_clave: "No hay clave de Anthropic en el servidor: escribe con las plantillas por tramo.",
  desactivada: "La IA está apagada para los agentes: escribe con las plantillas por tramo.",
  sin_cuota: "Se llegó al tope de gasto de IA del mes: escribe con las plantillas hasta el mes que viene.",
  activa: "La IA decide qué escribir y por dónde, dentro de las reglas.",
} as const;

export default async function InstruccionesCobranza({ searchParams }: { searchParams: Promise<{ tab?: string; aviso?: string }> }) {
  const sp = await searchParams;
  const [config, activo, ia] = await Promise.all([leerConfigCobranza(), agenteConfigurado("cobranza"), estadoIA({ agente: "cobranza", operacion: "contactar" })]);
  const firma = await firmaDeLaCuenta(config);
  const corridas = await listarCorridas(20);
  const triggers = 4;
  const tabs = [
    { id: "instrucciones", texto: "Instrucciones" },
    { id: "herramientas", texto: `Herramientas (${HERRAMIENTAS_COBRANZA.length})` },
    { id: "triggers", texto: `Triggers (${triggers})` },
    { id: "ejecuciones", texto: "Ejecuciones" },
    { id: "detalles", texto: "Detalles" },
    { id: "settings", texto: "Settings" },
  ] as const;
  const tab = tabs.find((t) => t.id === sp.tab)?.id ?? "instrucciones";
  const listo = activo && Object.values(config.canales).some((c) => c.habilitado);

  return (
    <>
      <div className="cob-cabecera-agente">
        <Migas items={[{ texto: "Agentes" }, { texto: "Agente de Cobranza", href: "/agentes/cobranza" }]} />
        <div className="fila-acciones">
          <Chip texto={listo ? "Listo" : activo ? "Sin canales" : "Inactivo"} tono={listo ? "verde" : "gris"} />
          <details className="desplegable menu-desplegable">
            <summary className="boton boton-mediano" aria-label="Más opciones">
              …
            </summary>
            <div className="panel-desplegable form-columna">
              <Link href="/agentes/cobranza">Tablero</Link>
              <Link href="/agentes/cobranza/configuracion">Configuración</Link>
              <Link href="/agentes/cobranza/ejecuciones">Ejecuciones</Link>
              <Link href="/agentes/cobranza/api">API</Link>
            </div>
          </details>
          <form action={ejecutarAhora}>
            <input type="hidden" name="prueba" value="1" />
            <button type="submit" className="boton boton-mediano">
              Probar
            </button>
          </form>
          <form action={ejecutarAhora}>
            <input type="hidden" name="volver" value="/agentes/cobranza" />
            <button type="submit" className="boton boton-primario boton-mediano">
              ▶ Ejecutar
            </button>
          </form>
        </div>
      </div>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Agente de Cobranza</h1>
          <p className="subtitulo descripcion-agente">Da seguimiento a pagos por vencer y vencidos contactando directamente al asegurado.</p>
        </div>
      </header>
      <Aviso codigo={sp.aviso} />

      <nav aria-label="Vista del agente" className="pestanas">
        {tabs.map((t) => (
          <Link key={t.id} href={`/agentes/cobranza/instrucciones${t.id === "instrucciones" ? "" : `?tab=${t.id}`}`} aria-current={tab === t.id ? "page" : undefined} className="pestana">
            {t.texto}
          </Link>
        ))}
      </nav>

      {tab === "instrucciones" && (
        <section className="tarjeta tarjeta-padding" aria-label="Instrucciones">
          <p className="texto-suave">
            Las instrucciones que recibe la IA, armadas desde la <Link href="/agentes/cobranza/configuracion">Configuración</Link> (reglas generales, canales y tramos). Para cambiarlas, editá la configuración. Las reglas duras (horario, días, intentos, modo prueba, promesas) las controla el sistema antes de cada herramienta, no solo este texto.
          </p>
          <pre className="cob-prompt">{armarInstrucciones(config, firma)}</pre>
        </section>
      )}

      {tab === "herramientas" && (
        <section className="tarjeta" aria-label="Herramientas">
          {HERRAMIENTAS_COBRANZA.map((h) => (
            <article key={h.nombre} className="cob-herramienta">
              <code className="celda-fuerte">{h.nombre}</code>
              <p className="texto-suave">{h.descripcion}</p>
              <details className="cob-evento-texto">
                <summary>Esquema JSON</summary>
                <pre className="cob-prompt">{JSON.stringify(h.esquema, null, 2)}</pre>
              </details>
            </article>
          ))}
        </section>
      )}

      {tab === "triggers" && (
        <section className="tarjeta" aria-label="Triggers">
          {await (async () => {
            const proxima = proximaPasada(config, await ultimaCorridaCron(), new Date());
            return (
              <article className="cob-herramienta">
                <div className="titulo-fila">
                  <span className="celda-fuerte">Cron diario</span>
                  <Chip texto={!activo ? "Agente inactivo" : config.modoPrueba ? "En pausa: modo prueba" : "Activo"} tono={activo && !config.modoPrueba ? "verde" : "gris"} />
                </div>
                <p className="texto-suave">
                  {config.horaEjecucion} · {config.diasPermitidos.map((d) => NOMBRE_DIA[d]).join(", ") || "ningún día"} · {config.zonaHoraria}. Vercel pasa una vez por día a las {pasadasLocales(config.zonaHoraria)[0]} (
                  <code className="cob-codigo-linea">GET /api/cron/cobranza</code>, con <code className="cob-codigo-linea">CRON_SECRET</code>).
                </p>
                <p className="nota-pie">
                  {config.modoPrueba
                    ? "En modo prueba no corre solo: probalo con Probar o ▶ Ejecutar."
                    : proxima
                      ? `Próxima ejecución: ${diaYHora(proxima)}.`
                      : "Con esta hora y estos días no corre nunca: revisá Configuración → Horario."}
                </p>
              </article>
            );
          })()}
          <article className="cob-herramienta">
            <span className="celda-fuerte">WhatsApp entrante</span>
            <p className="texto-suave">
              <code className="cob-codigo-linea">POST /api/v1/agentes/cobranza/entrantes/whatsapp</code> con la clave de la API. Cuando un asegurado responde, el agente lee el mensaje, registra la respuesta y contesta si hace falta.
            </p>
          </article>
          <article className="cob-herramienta">
            <span className="celda-fuerte">Email entrante</span>
            <p className="texto-suave">
              <code className="cob-codigo-linea">POST /api/v1/agentes/cobranza/entrantes/email</code>, igual que WhatsApp.
            </p>
          </article>
          <article className="cob-herramienta">
            <span className="celda-fuerte">API</span>
            <p className="texto-suave">
              <code className="cob-codigo-linea">POST /api/v1/agentes/cobranza/corridas</code> dispara una corrida. <Link href="/agentes/cobranza/api">Ver la referencia</Link>.
            </p>
          </article>
        </section>
      )}

      {tab === "ejecuciones" && (
        <section className="tarjeta" aria-label="Ejecuciones">
          {corridas.some((r) => r.estado === "en_curso") && <Refrescar />}
          <TablaCorridas corridas={corridas} />
        </section>
      )}

      {tab === "detalles" && (
        <section className="tarjeta tarjeta-padding" aria-label="Detalles">
          {await (async () => {
            const inicioMes = new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00-03:00`);
            const [[gasto], estado] = await Promise.all([
              db
                .select({ usd: sql<string>`coalesce(sum(${schema.iaUso.costoUsd}), 0)`, llamadas: sql<number>`count(*)::int` })
                .from(schema.iaUso)
                .where(and(eq(schema.iaUso.agente, "cobranza"), gte(schema.iaUso.creadoEl, inicioMes))),
              estadoCanales(),
            ]);
            return (
              <dl className="cob-grilla cob-grilla-dos">
                <div>
                  <dt>IA</dt>
                  <dd>{MOTIVO_IA[ia.motivo]}</dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd className="cob-mono">{planDeTarea("actuar").modelo}</dd>
                </div>
                <div>
                  <dt>Gasto de IA de Cobranza este mes</dt>
                  <dd className="tabular">
                    US$ {Number(gasto?.usd ?? 0).toFixed(4)} · {gasto?.llamadas ?? 0} llamadas (entra en el tope común de los agentes)
                  </dd>
                </div>
                <div>
                  <dt>Modo</dt>
                  <dd>{config.modoPrueba ? "Prueba: todo va a los destinos de prueba" : config.pedirAprobacion ? "Real, con tu aprobación para cada mensaje" : "Real: escribe solo"}</dd>
                </div>
                <div>
                  <dt>Canales</dt>
                  <dd>
                    {CANALES_COBRANZA.map((c) => `${NOMBRE_CANAL[c]}: ${config.canales[c].habilitado ? (estado[c].conectado ? "habilitado y conectado" : "habilitado, sin conexión real") : "apagado"}`).join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Firma</dt>
                  <dd>
                    {firma.productor}
                    {firma.organizacion ? ` (${firma.organizacion})` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Última corrida</dt>
                  <dd>{corridas[0] ? `${diaYHora(corridas[0].iniciadaEl)} · ${corridas[0].resumen ?? "en curso"}` : "Nunca"}</dd>
                </div>
                <div>
                  <dt>Reglas duras</dt>
                  <dd>
                    {config.maxIntentos} intentos · {config.diasEntreIntentos} días entre intentos · primer contacto {config.diasPrimerContacto} días antes · {config.diasGraciaPromesa} días de gracia tras una promesa · {config.ventanaDesde} a {config.ventanaHasta}
                  </dd>
                </div>
              </dl>
            );
          })()}
        </section>
      )}

      {tab === "settings" && (
        <section className="tarjeta" aria-label="Settings">
          <form action={cambiarModo} className="cob-formulario">
            <h2>Cómo trabaja</h2>
            <label className="cob-interruptor">
              <input type="checkbox" name="modoPrueba" className="interruptor" defaultChecked={config.modoPrueba} />
              <span>
                <span className="celda-fuerte">Modo prueba</span>
                <span className="nota-pie"> · todo contacto va a los datos de prueba, nunca al asegurado.</span>
              </span>
            </label>
            <label className="cob-interruptor">
              <input type="checkbox" name="pedirAprobacion" className="interruptor" defaultChecked={config.pedirAprobacion} />
              <span>
                <span className="celda-fuerte">Pedirme aprobación antes de enviar</span>
                <span className="nota-pie"> · cada mensaje real espera en &ldquo;Para aprobar&rdquo;.</span>
              </span>
            </label>
            <div className="fila-acciones">
              <button type="submit" className="boton boton-primario">
                Guardar
              </button>
              <Link href="/agentes/cobranza/configuracion" className="nota-pie">
                Toda la configuración →
              </Link>
            </div>
          </form>
          <div className="cob-formulario">
            <h2>Agente</h2>
            <p className="texto-suave">{activo ? "Activo: el cron lo corre solo en los días y la hora configurados." : "Desactivado: no corre solo. Podés probarlo igual."}</p>
            <form action={activo ? desactivarAgente : activarAgente}>
              <input type="hidden" name="agente" value="cobranza" />
              <button type="submit" className={activo ? "boton" : "boton boton-primario"}>
                {activo ? "Desactivar agente" : "Activar agente"}
              </button>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
