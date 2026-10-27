import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { Bitacora, EncabezadoAgente } from "@/components/agentes/Agente";
import { CONFIG_COBRANZA_INICIAL, PASOS_COBRANZA } from "@/agentes/cobranza/secuencia";
import type { ConfigCobranza } from "@/db/schema";
import { contactoDe } from "@/lib/asegurados";
import {
  etiquetaPendiente,
  grupoDe,
  kpisCobranza,
  leerReferencia,
  textoProximo,
  textoVencimiento,
  tonoEstado,
  type Grupo,
} from "@/lib/cobranza";
import { obtenerCuenta } from "@/lib/datos";
import {
  agenteConfigurado,
  obtenerActividad,
  obtenerComprobantes,
  obtenerCompanias,
  obtenerConfigAgente,
  obtenerContactos,
  obtenerCuotasDelMes,
  obtenerCuotasRecientes,
  obtenerPendientesCobranza,
  obtenerSeguimientosActivos,
} from "@/lib/datos-agentes";
import { diaEnArgentina, diaDeLaSemana, diaYMes, diasEntre, sumarDias } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { conFirma } from "@/lib/plantillas";
import { agruparCobros, textoVence } from "@/lib/validador";
import { aprobarTodos, guardarSecuencia } from "./actions";
import { TarjetaPendiente, type Pendiente } from "./TarjetaPendiente";
import "../agentes.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const FILTROS: { id: Grupo | "todas"; texto: string }[] = [
  { id: "todas", texto: "Todas" },
  { id: "vencidas", texto: "Vencidas" },
  { id: "porvencer", texto: "Por vencer" },
  { id: "pausadas", texto: "En pausa" },
];
const REGLAS: { id: keyof ConfigCobranza["reglas"]; texto: string }[] = [
  { id: "cortarAlConfirmar", texto: "Cortar la secuencia cuando el Validador de pagos confirma el pago." },
  { id: "horario", texto: "Enviar solo de lunes a sábado, entre las 9 y las 20 h." },
  { id: "contactoAdministracion", texto: "En empresas, escribirle al contacto de administración." },
  { id: "avisarRespuestas", texto: "Avisarme por WhatsApp cuando alguien responde." },
];

export default async function Cobranza({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pestana = sp.tab === "seguimiento" || sp.tab === "secuencia" ? sp.tab : "aprobar";
  const filtro = FILTROS.find((f) => f.id === sp.filtro)?.id ?? "todas";
  const verActividad = sp.ver === "actividad";
  const hoy = diaEnArgentina(new Date());

  const [activo, recientes, delMes, pendientesDb, seguimientos, companias, config, cuenta, actividad] = await Promise.all([
    agenteConfigurado("cobranza"),
    obtenerCuotasRecientes(hoy),
    obtenerCuotasDelMes(hoy),
    obtenerPendientesCobranza(hoy),
    obtenerSeguimientosActivos(),
    obtenerCompanias(),
    obtenerConfigAgente<ConfigCobranza>("cobranza"),
    obtenerCuenta(),
    verActividad ? obtenerActividad("cobranza") : Promise.resolve([]),
  ]);
  const secuencia: ConfigCobranza = {
    pasos: config?.pasos?.length ? config.pasos : CONFIG_COBRANZA_INICIAL.pasos,
    reglas: { ...CONFIG_COBRANZA_INICIAL.reglas, ...config?.reglas },
  };
  const cobros = agruparCobros(recientes);
  const porCabeza = new Map(cobros.map((c) => [c.cabezaId, c]));
  const [comprobantes, contactos] = await Promise.all([
    obtenerComprobantes(cobros.map((c) => c.cabezaId)),
    obtenerContactos([...new Set(cobros.map((c) => c.aseguradoId))]),
  ]);
  const gracia = new Map(companias.map((c) => [c.nombre, c.diasGracia]));
  const kpis = kpisCobranza(
    agruparCobros(delMes).map((c) => ({ ...c, cuotas: c.cuotas.length })),
    hoy,
  );
  const riesgo = kpisCobranza(
    cobros.map((c) => ({ ...c, cuotas: c.cuotas.length })),
    hoy,
  );

  // Para aprobar
  const pendientes: Pendiente[] = pendientesDb.flatMap((m) => {
    const ref = leerReferencia(m.referencia);
    const cobro = ref ? porCabeza.get(ref.cuotaId) : undefined;
    if (!ref || !cobro) return [];
    const primera = cobro.cuotas[0];
    const comp = comprobantes.get(cobro.cabezaId);
    const empresa = m.tipo === "empresa";
    return [
      {
        id: m.id,
        cliente: cobro.asegurado,
        poliza: `${cobro.compania ?? "Sin compañía"} · ${cobro.cuotas.length > 1 ? cobro.poliza.split(" · ")[0] : primera.ramo} · cuota ${primera.numero} de ${primera.cantidadCuotas}`,
        monto: ref.tipo === "diferencia" && comp?.monto ? `Faltan ${pesos(cobro.monto - comp.monto)}` : pesos(cobro.monto),
        vence: textoVencimiento(cobro.vencimiento, hoy),
        etiqueta: etiquetaPendiente(ref.tipo, cobro.vencimiento, hoy),
        canal:
          m.canal === "llamada"
            ? "Llamada tuya"
            : m.canal === "whatsapp"
              ? `WhatsApp · ${m.destinatario}`
              : `Email · ${empresa && m.contactoNombre ? m.contactoNombre : m.destinatario}`,
        esWhatsApp: m.canal === "whatsapp",
        porque: m.motivo,
        texto: conFirma(m.texto, cuenta.nombre),
        llamada: m.canal === "llamada",
        telefono: m.canal === "llamada" ? m.destinatario : null,
        manana: sumarDias(hoy, 1),
      },
    ];
  });
  const mensajesParaEnviar = pendientes.filter((p) => !p.llamada).length;
  const pendientePorCabeza = new Map(
    pendientesDb.flatMap((m) => {
      const ref = leerReferencia(m.referencia);
      return ref ? [[ref.cuotaId, { tipo: ref.tipo, canal: m.canal }] as const] : [];
    }),
  );

  // Seguimiento
  const filasSeguimiento = seguimientos.flatMap((s) => {
    const cobro = porCabeza.get(s.cuotaId);
    if (!cobro || cobro.pagada) return [];
    const a = contactos.get(cobro.aseguradoId);
    const contacto = a ? contactoDe(a) : { telefono: null, email: null };
    const sinContacto = !contacto.telefono && !contacto.email;
    const pausa = s.estado === "pausado" ? { motivo: s.motivoPausa ?? "En pausa", hasta: s.promesaPagoEl } : null;
    const comp = comprobantes.get(cobro.cabezaId);
    const faltante = comp?.monto && comp.monto < cobro.monto && comp.estado === "por_revisar" ? cobro.monto - comp.monto : null;
    const atraso = diasEntre(cobro.vencimiento, hoy);
    return [
      {
        id: s.id,
        cliente: cobro.asegurado,
        poliza: `${cobro.compania ?? "Sin compañía"} · ${cobro.cuotas.length > 1 ? `${cobro.cuotas[0].ramo} (${cobro.cuotas.length})` : cobro.cuotas[0].ramo}`,
        monto: pesos(faltante ?? cobro.monto),
        vence: textoVence(cobro.vencimiento, hoy),
        paso: s.paso,
        vencida: atraso > 0,
        estado: s.promesaPagoEl && pausa ? `Promesa de pago: ${diaDeLaSemana(s.promesaPagoEl)}` : (s.ultimaNovedad ?? "Todavía sin avisos"),
        tono: tonoEstado({ pausa, sinContacto, problema: Boolean(faltante) || /incompleto|equivocada/i.test(s.ultimaNovedad ?? ""), atraso, hecho: s.paso }),
        ultimo: s.ultimoContacto ? `${s.ultimoContacto}${s.ultimaNovedadEl ? ` · ${diaYMes(diaEnArgentina(s.ultimaNovedadEl))}` : ""}` : "—",
        proximo: textoProximo({
          vencimiento: cobro.vencimiento,
          hoy,
          diasGracia: gracia.get(cobro.compania ?? "") ?? 30,
          hecho: s.paso,
          pausa,
          sinContacto,
          pendiente: pendientePorCabeza.get(s.cuotaId) ?? null,
        }),
        grupo: grupoDe(cobro.vencimiento, hoy, Boolean(pausa)),
        orden: cobro.vencimiento,
      },
    ];
  });
  filasSeguimiento.sort((a, b) => a.orden.localeCompare(b.orden));
  const cuentaGrupo = (g: Grupo | "todas") => (g === "todas" ? filasSeguimiento.length : filasSeguimiento.filter((f) => f.grupo === g).length);
  const algunoAutomatico = secuencia.pasos.some((p) => p.automatico);

  return (
    <>
      <EncabezadoAgente
        agente="cobranza"
        titulo="Agente de cobranza"
        activo={activo}
        estado={algunoAutomatico ? "Activo · algunos pasos salen sin aprobación" : "Activo · te pide aprobación antes de enviar"}
        descripcion="Avisa a tus asegurados antes de que venza la cuota, sigue las que quedaron impagas y te avisa cuándo te toca llamar a vos. Cuando el Validador de pagos confirma un pago, la secuencia de ese cliente se corta sola."
      >
        <Link href={verActividad ? "/agentes/cobranza" : "/agentes/cobranza?ver=actividad"} className="boton">
          {verActividad ? "Ver cobranza" : "Actividad"}
        </Link>
        <Link href="/agentes/cobranza?tab=secuencia" className="boton">
          Editar secuencia
        </Link>
        <form action={aprobarTodos}>
          <button type="submit" className="boton boton-primario" disabled={mensajesParaEnviar === 0}>
            {mensajesParaEnviar > 0
              ? `Aprobar y enviar ${mensajesParaEnviar === 1 ? "1 mensaje" : `${mensajesParaEnviar} mensajes`}`
              : "Nada para enviar"}
          </button>
        </form>
      </EncabezadoAgente>

      <Aviso codigo={sp.aviso} />

      {verActividad ? (
        <Bitacora actividad={actividad} />
      ) : (
        <>
          <section aria-label="Resumen del mes" className="kpis-agente">
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Por cobrar en {MESES[Number(hoy.slice(5, 7)) - 1]}</span>
              <span className="kpi-agente-valor kpi-monto">{pesos(kpis.porCobrar)}</span>
              <span className="kpi-agente-detalle">
                {kpis.cuotasDelMes} cuotas de {kpis.aseguradosDelMes} {kpis.aseguradosDelMes === 1 ? "asegurado" : "asegurados"}
              </span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Cobrado</span>
              <span className="kpi-agente-valor kpi-monto texto-verde">{pesos(kpis.cobrado)}</span>
              <div className="barra-progreso-fila">
                <div className="barra-progreso" aria-hidden="true">
                  <div style={{ width: `${kpis.porcentaje}%` }} />
                </div>
                <span className="kpi-agente-detalle">{kpis.porcentaje} %</span>
              </div>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Cuotas vencidas</span>
              <span className="kpi-agente-valor kpi-monto">{riesgo.vencidas}</span>
              <span className="kpi-agente-detalle">{pesos(riesgo.montoVencido)} sin cobrar</span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Cerca de quedar sin cobertura</span>
              <span className={`kpi-agente-valor kpi-monto ${riesgo.riesgo.length ? "texto-rojo" : ""}`}>{riesgo.riesgo.length}</span>
              <span className="kpi-agente-detalle">
                {riesgo.riesgo[0] ? `${riesgo.riesgo[0].asegurado} · ${riesgo.riesgo[0].atraso} días de atraso` : "Ninguna por ahora"}
              </span>
            </div>
          </section>

          <nav aria-label="Secciones del agente" className="pestanas">
            <Link href="/agentes/cobranza" aria-current={pestana === "aprobar" ? "page" : undefined} className="pestana">
              Para aprobar <span className={pendientes.length ? "contador-rojo" : "contador-gris"}>{pendientes.length}</span>
            </Link>
            <Link
              href="/agentes/cobranza?tab=seguimiento"
              aria-current={pestana === "seguimiento" ? "page" : undefined}
              className="pestana"
            >
              Seguimiento <span className="contador-gris">{filasSeguimiento.length}</span>
            </Link>
            <Link href="/agentes/cobranza?tab=secuencia" aria-current={pestana === "secuencia" ? "page" : undefined} className="pestana">
              Secuencia
            </Link>
          </nav>

          {pestana === "aprobar" && (
            <div className="lista-pendientes">
              {pendientes.map((p) => (
                <TarjetaPendiente key={p.id} p={p} />
              ))}
              {pendientes.length === 0 && (
                <section className="tarjeta vacio-agente">
                  <div className="celda-fuerte">No hay nada para aprobar</div>
                  <p className="texto-suave">El agente vuelve a revisar las cuotas mañana a las 9:00.</p>
                </section>
              )}
            </div>
          )}

          {pestana === "seguimiento" && (
            <section aria-label="Seguimiento de cuotas" className="tarjeta">
              <div className="lista-cabecera">
                <nav aria-label="Filtrar seguimiento" className="segmentos">
                  {FILTROS.map((f) => (
                    <Link
                      key={f.id}
                      href={`/agentes/cobranza?tab=seguimiento${f.id === "todas" ? "" : `&filtro=${f.id}`}`}
                      scroll={false}
                      aria-current={filtro === f.id ? "true" : undefined}
                      className="segmento"
                    >
                      {f.texto} · {cuentaGrupo(f.id)}
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="tabla-scroll">
                <table className="tabla tabla-seguimiento">
                  <thead>
                    <tr>
                      <th scope="col">Cliente</th>
                      <th scope="col" className="numero">
                        Monto
                      </th>
                      <th scope="col">Vencimiento</th>
                      <th scope="col">Secuencia</th>
                      <th scope="col">Última novedad</th>
                      <th scope="col">Próximo paso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasSeguimiento
                      .filter((f) => filtro === "todas" || f.grupo === filtro)
                      .map((f) => (
                        <tr key={f.id}>
                          <td>
                            <div className="celda-fuerte">{f.cliente}</div>
                            <div className="celda-secundaria">{f.poliza}</div>
                          </td>
                          <td className="numero tabular celda-fuerte">{f.monto}</td>
                          <td>
                            <span className={`pastilla pastilla-${f.vence.tono}`}>{f.vence.texto}</span>
                          </td>
                          <td>
                            <div className="pasos-barra" aria-hidden="true">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <span key={i} className={i <= f.paso ? (f.vencida ? "paso-barra paso-barra-rojo" : "paso-barra paso-barra-hecho") : "paso-barra"} />
                              ))}
                            </div>
                            <span className="nota-pie">{f.paso === 0 ? "Sin empezar" : `Paso ${f.paso} de 5`}</span>
                          </td>
                          <td>
                            <span className={`estado-${f.tono}`}>{f.estado}</span>
                            <div className="nota-pie">{f.ultimo}</div>
                          </td>
                          <td className="texto-gris-oscuro">{f.proximo}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {cuentaGrupo(filtro) === 0 && <p className="vacio">No hay cuotas en seguimiento con este filtro.</p>}
              </div>
            </section>
          )}

          {pestana === "secuencia" && (
            <form action={guardarSecuencia} className="secuencia">
              <ol className="secuencia-pasos">
                {PASOS_COBRANZA.map((p) => {
                  const actual = secuencia.pasos.find((x) => x.paso === p.paso);
                  return (
                    <li key={p.paso} className="secuencia-paso">
                      <div className="secuencia-numero" aria-hidden="true">
                        {p.paso}
                      </div>
                      <div className="secuencia-cuerpo">
                        <div className="titulo-fila">
                          <h2 className="titulo-tarjeta">
                            <span className="visualmente-oculto">Paso {p.paso}: </span>
                            {p.titulo}
                          </h2>
                          <span className="texto-suave">
                            {p.cuando} · {p.canal}
                          </span>
                        </div>
                        {p.tarea ? (
                          <p className="texto-suave texto-italica">{p.plantilla}</p>
                        ) : (
                          <>
                            <label htmlFor={`plantilla-${p.paso}`} className="visualmente-oculto">
                              Mensaje del paso {p.paso}
                            </label>
                            <textarea
                              id={`plantilla-${p.paso}`}
                              name={`plantilla-${p.paso}`}
                              rows={3}
                              className="campo plantilla"
                              defaultValue={actual?.plantilla ?? p.plantilla}
                            />
                          </>
                        )}
                        <label className="opcion-chica">
                          <input type="checkbox" name={`auto-${p.paso}`} defaultChecked={Boolean(actual?.automatico)} disabled={p.tarea} />
                          {p.tarea ? "Siempre la hacés vos" : "Se envía sin pedirte aprobación"}
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <aside className="secuencia-lateral">
                <section className="tarjeta tarjeta-compacta">
                  <h2 className="titulo-tarjeta">Reglas</h2>
                  {REGLAS.map((r) => (
                    <label key={r.id} className="opcion">
                      <input type="checkbox" name={r.id} defaultChecked={secuencia.reglas[r.id]} />
                      <span>{r.texto}</span>
                    </label>
                  ))}
                </section>
                <section className="nota-caja">
                  <div className="celda-fuerte">Plazos de gracia</div>
                  Cada compañía tiene su propio plazo antes de suspender la cobertura por falta de pago. El agente toma el de
                  cada compañía para calcular el paso 5.
                </section>
                <section className="nota-caja">
                  <div className="celda-fuerte">Variables de los mensajes</div>
                  {"{nombre}, {compañía}, {ramo}, {cuota}, {monto}, {vence}, {medios de pago}, {fin de gracia}, {productor}"}
                </section>
                <button type="submit" className="boton boton-primario">
                  Guardar secuencia
                </button>
              </aside>
            </form>
          )}
        </>
      )}
    </>
  );
}
