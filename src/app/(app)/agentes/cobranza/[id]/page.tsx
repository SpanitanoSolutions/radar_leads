import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { leerConfigCobranza, sincronizarCasos } from "@/agentes/cobranza/casos";
import { cuotasDelCaso, diaLocal, eventosDelCaso, obtenerCaso, situacionDelCaso } from "@/agentes/cobranza/datos";
import { NOMBRE_CANAL } from "@/lib/cobranza/configuracion";
import { chipVencimiento, ESTADO_INFO, REACTIVABLES } from "@/lib/cobranza/estados";
import { TEXTO_OMISION } from "@/lib/cobranza/reglas";
import { rangoDeTramo } from "@/lib/cobranza/tramos";
import { diaYHora, fechaCorta } from "@/lib/fechas";
import { cambiarMarcaNoContactar, guardarContactoCaso, marcarComoPagado, reactivarRecibo } from "../actions";
import { Chip, ChipEvento, EstadoPunto, Migas, Monto } from "../Componentes";
import "../../agentes.css";
import "../cobranza.css";

export const instant = false;

const TABS = [
  { id: "detalle", texto: "Detalle" },
  { id: "seguimiento", texto: "Seguimiento" },
] as const;

export default async function CasoCobranza({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; aviso?: string }> }) {
  const [{ id: textoId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(textoId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const config = await leerConfigCobranza();
  const dia = diaLocal(config);
  const hoy = dia(new Date());
  await sincronizarCasos(hoy, config);
  const caso = await obtenerCaso(id);
  if (!caso) notFound();
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "detalle";
  const [cuotas, eventos] = await Promise.all([cuotasDelCaso(caso), eventosDelCaso(caso.id)]);
  const situacion = situacionDelCaso(caso, config, hoy);
  const chip = chipVencimiento(situacion.diasParaVencer);
  const aqui = `/agentes/cobranza/${caso.id}${tab === "seguimiento" ? "?tab=seguimiento" : ""}`;
  const empresa = caso.asegurado.tipo === "empresa";

  return (
    <>
      <Migas items={[{ texto: "Agente de Cobranza", href: "/agentes/cobranza" }, { texto: caso.asegurado.nombre }]} />
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <Link href="/agentes/cobranza" className="volver">
            ← Atrás
          </Link>
          <h1 className="titulo">{caso.asegurado.nombre}</h1>
          <div className="titulo-fila cob-subtitulo">
            <span className="cob-mono">
              {caso.compania ?? "Sin compañía"} · {caso.polizaNumero ?? "s/n"}
            </span>
            {caso.estado !== "pagado" && <Chip texto={chip.texto} tono={chip.tono} />}
            {caso.esEjemplo && <span className="pastilla pastilla-gris">Ejemplo</span>}
          </div>
        </div>
      </header>

      <Aviso codigo={sp.aviso} />

      <nav aria-label="Secciones del caso" className="pestanas">
        {TABS.map((t) => (
          <Link key={t.id} href={`/agentes/cobranza/${caso.id}${t.id === "detalle" ? "" : `?tab=${t.id}`}`} aria-current={tab === t.id ? "page" : undefined} className="pestana">
            {t.texto}
            {t.id === "seguimiento" && <span className="contador-gris">{eventos.length}</span>}
          </Link>
        ))}
      </nav>

      <div className="cob-detalle">
        <div className="cob-detalle-principal">
          {tab === "detalle" ? (
            <>
              <section className="tarjeta cob-recibo" aria-label="Recibo">
                <div className="cob-recibo-cabecera">
                  <span className="cob-mono cob-recibo-compania">{caso.compania ?? "Sin compañía"}</span>
                  <Chip texto={caso.estado === "pagado" ? "Pagado" : situacion.diasParaVencer < 0 ? "Vencido" : "Por vencer"} tono={caso.estado === "pagado" ? "verde" : situacion.diasParaVencer < 0 ? "rojo" : "ambar"} />
                </div>
                <div>
                  <div className="cob-recibo-asegurado">{caso.asegurado.nombre}</div>
                  <div className="cob-mono cob-secundaria">Póliza {caso.polizaNumero ?? "sin número"}</div>
                </div>
                <dl className="cob-grilla">
                  <div>
                    <dt>Nº de recibo</dt>
                    <dd className="cob-mono">{caso.recibo}</dd>
                  </div>
                  <div>
                    <dt>Endoso / serie</dt>
                    <dd className="cob-mono">{caso.endoso ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Vencimiento</dt>
                    <dd className="tabular">{fechaCorta(caso.vencimiento)}</dd>
                  </div>
                  <div>
                    <dt>Vigencia</dt>
                    <dd className="tabular">
                      {caso.vigencia.desde ? fechaCorta(caso.vigencia.desde) : "—"} → {caso.vigencia.hasta ? fechaCorta(caso.vigencia.hasta) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Forma de pago</dt>
                    <dd>{caso.formaPago ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Ramo</dt>
                    <dd>{caso.ramo}</dd>
                  </div>
                </dl>
                <div className="cob-recibo-monto">
                  <span className="cob-mono">{caso.moneda}</span>
                  <Monto valor={caso.monto} moneda={caso.moneda} />
                </div>
              </section>

              {cuotas.length > 1 && (
                <section className="tarjeta" aria-label="Cuotas que se cobran juntas">
                  <h2 className="titulo-tarjeta cob-titulo-seccion">Se cobran juntas ({cuotas.length} cuotas)</h2>
                  <div className="tabla-scroll">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Póliza</th>
                          <th scope="col">Cuota</th>
                          <th scope="col">Estado</th>
                          <th scope="col" className="numero">
                            Monto
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cuotas.map((c) => (
                          <tr key={c.id}>
                            <td>
                              {c.ramo} · <span className="cob-mono">{c.poliza ?? "s/n"}</span>
                              {c.item ? <span className="nota-pie"> · ítem {c.item}</span> : null}
                            </td>
                            <td className="tabular">
                              {c.numero}/{c.cantidad_cuotas}
                            </td>
                            <td>{c.estado_validacion === "cancelada" ? "Anulada" : c.estado === "pagada" ? "Pagada" : "Impaga"}</td>
                            <td className="numero">
                              <Monto valor={c.monto} moneda={c.moneda} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="tarjeta tarjeta-padding" aria-label="Qué hace el agente">
                <h2 className="titulo-tarjeta">Qué hace el agente hoy</h2>
                <dl className="cob-grilla cob-grilla-dos">
                  <div>
                    <dt>Tramo</dt>
                    <dd>{situacion.tramo ? `${situacion.tramo.nombre} (${rangoDeTramo(situacion.tramo)})` : "Ninguno de los tramos configurados"}</dd>
                  </div>
                  <div>
                    <dt>Canales</dt>
                    <dd>{situacion.canales.length ? situacion.canales.map((c) => NOMBRE_CANAL[c]).join(", ") : "Ninguno habilitado con sus datos"}</dd>
                  </div>
                  <div>
                    <dt>Intentos</dt>
                    <dd className="tabular">
                      {caso.intentos} de {config.maxIntentos}
                    </dd>
                  </div>
                  <div>
                    <dt>Próximo contacto</dt>
                    <dd>{situacion.motivoNoContactar ? `No le escribe: ${TEXTO_OMISION[situacion.motivoNoContactar]}.` : "Le escribe en la próxima corrida."}</dd>
                  </div>
                </dl>
              </section>
            </>
          ) : (
            <section className="tarjeta" aria-label="Seguimiento">
              {eventos.length === 0 ? (
                <p className="vacio">Todavía no pasó nada con este recibo.</p>
              ) : (
                <ol className="cob-linea">
                  {eventos.map((e) => {
                    const texto = typeof e.datos.texto === "string" ? e.datos.texto : null;
                    return (
                      <li key={e.id} className="cob-evento">
                        <span className="cob-evento-fecha tabular">{diaYHora(e.creadoEl)}</span>
                        <div className="cob-evento-cuerpo">
                          <div className="titulo-fila">
                            <ChipEvento tipo={e.tipo} />
                            {e.esPrueba && <Chip texto="Modo prueba" tono="ambar" />}
                            {e.canal && <span className="cob-mono cob-secundaria">{NOMBRE_CANAL[e.canal]}</span>}
                          </div>
                          <p className="cob-evento-resumen">{e.resumen}</p>
                          {texto && (
                            <details className="cob-evento-texto">
                              <summary>{typeof e.datos.para === "string" && e.datos.para ? `Mensaje · ${e.datos.para}` : "Mensaje"}</summary>
                              <p>{texto}</p>
                            </details>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}
        </div>

        <aside className="cob-detalle-lateral" aria-label="Acciones del caso">
          <section className="tarjeta tarjeta-padding">
            <h2 className="cob-titulo-chico">Estatus</h2>
            <EstadoPunto estado={caso.estado} />
            <p className="texto-suave">{caso.motivo ?? ESTADO_INFO[caso.estado].descripcion}</p>
            {caso.promesaEl && caso.estado === "promesa" && <p className="texto-suave">Prometió pagar el {fechaCorta(caso.promesaEl)}.</p>}
            {caso.borradorPendiente && (
              <Link href="/agentes/cobranza?tab=aprobar" className="nota-pie">
                Tiene un mensaje esperando tu aprobación →
              </Link>
            )}
          </section>

          <section className="tarjeta tarjeta-padding">
            <h2 className="cob-titulo-chico">Contacto{empresa ? " de administración" : ""}</h2>
            <form action={guardarContactoCaso} className="form-columna">
              <input type="hidden" name="casoId" value={caso.id} />
              <input type="hidden" name="volver" value={aqui} />
              <label className="etiqueta" htmlFor="cob-telefono">
                Teléfono y WhatsApp
              </label>
              <input id="cob-telefono" name="telefono" className="campo" defaultValue={(empresa ? caso.asegurado.contactoTelefono : caso.asegurado.telefono) ?? ""} placeholder={caso.contacto.telefono ?? "Sin teléfono"} />
              <label className="etiqueta" htmlFor="cob-email">
                Email
              </label>
              <input id="cob-email" name="email" type="email" className="campo" defaultValue={(empresa ? caso.asegurado.contactoEmail : caso.asegurado.email) ?? ""} placeholder={caso.contacto.email ?? "Sin email"} />
              {empresa && (caso.asegurado.telefono || caso.asegurado.email) && (
                <p className="nota-pie">
                  Si queda vacío, usa el general: {[caso.asegurado.telefono, caso.asegurado.email].filter(Boolean).join(" · ")}.
                </p>
              )}
              <div className="fila-acciones">
                <button type="submit" className="boton boton-mediano">
                  Guardar contacto
                </button>
                <Link href={`/asegurados/${caso.aseguradoId}`} className="nota-pie">
                  Ver ficha
                </Link>
              </div>
            </form>
          </section>

          {caso.estado !== "pagado" && (
            <form action={marcarComoPagado}>
              <input type="hidden" name="casoId" value={caso.id} />
              <input type="hidden" name="volver" value={aqui} />
              <button type="submit" className="boton boton-primario cob-boton-ancho">
                Marcar como pagado
              </button>
            </form>
          )}
          {REACTIVABLES.includes(caso.estado) && caso.noContactar !== "baja" && (
            <form action={reactivarRecibo}>
              <input type="hidden" name="casoId" value={caso.id} />
              <input type="hidden" name="volver" value={aqui} />
              <button type="submit" className="boton cob-boton-ancho">
                Reactivar recibo
              </button>
            </form>
          )}
          {caso.noContactar !== "baja" && (
            <form action={cambiarMarcaNoContactar}>
              <input type="hidden" name="casoId" value={caso.id} />
              <input type="hidden" name="volver" value={aqui} />
              <input type="hidden" name="marcar" value={caso.noContactar ? "0" : "1"} />
              <button type="submit" className="boton-terciario cob-boton-ancho">
                {caso.noContactar ? "Volver a contactar a este asegurado" : "No contactar a este asegurado"}
              </button>
            </form>
          )}
          {caso.noContactar === "baja" && <p className="nota-pie">Pidió no recibir más mensajes de cobranza.</p>}
        </aside>
      </div>
    </>
  );
}
