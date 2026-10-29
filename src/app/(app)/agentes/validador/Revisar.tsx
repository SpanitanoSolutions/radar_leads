import Link from "next/link";
import type { Comprobante, ProblemaFuente } from "@/db/schema";
import type { EstadoCompaniaCuota } from "@/lib/conectores/tipos";
import type { CuotaDeCaso, obtenerCasosARevisar, obtenerListadosSubidos } from "@/lib/datos-validador";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import { normalizarEncabezado } from "@/lib/importacion";
import { ETIQUETA_MEDIO } from "@/lib/validador/estados";
import { leerMapeoListado, type CampoListado } from "@/lib/validador/listados";
import {
  completarComprobanteSuelto,
  confirmarComprobanteSuelto,
  descartarComprobanteSuelto,
  enviarACobranza,
  resolverCasoRevisar,
  subirComprobanteSuelto,
  subirListado,
} from "./actions";
import { BotonEnviar, ConfirmarColumnas, FormConError } from "./Formularios";
import { TablaCobros, type FilaCobro } from "./TablaCobros";

// "Por revisar": todo lo que espera una decisión del productor. Los
// comprobantes que llegaron para un cobro (la revisión de siempre), los casos
// de los listados y los conectores, los comprobantes subidos sueltos y los
// listados (subir uno nuevo y confirmar las columnas de un formato nuevo).

export type IA = { comprobantes: boolean; pdf: boolean };
type Casos = Awaited<ReturnType<typeof obtenerCasosARevisar>>;
type Listado = Awaited<ReturnType<typeof obtenerListadosSubidos>>[number];
export type TablaListado = { encabezados: string[]; filas: string[][] };

const INFORMADO: Record<EstadoCompaniaCuota, string> = { pagada: "pagada", pendiente: "impaga", vencida: "vencida", anulada: "anulada" };
const ACCION_IA: Record<string, string> = {
  confirmar: "confirmar el pago",
  revisar: "revisarlo con la compañía",
  enviar_a_cobranza: "enviarla a Cobranza",
  avisar_productor: "avisarte",
};

const abierta = (c: CuotaDeCaso) => c.estado !== "pagada" && c.estadoValidacion !== "pagada" && c.estadoValidacion !== "cancelada";
const estadoCuota = (c: CuotaDeCaso) =>
  c.estado === "pagada" || c.estadoValidacion === "pagada" ? "Pagada" : c.estadoValidacion === "cancelada" ? "Cancelada" : c.estadoValidacion === "vencida" ? "Vencida" : "Impaga";
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function PestanaRevisar({
  cobros,
  casos,
  sueltos,
  listados,
  tablas,
  companias,
  ia,
  volver,
}: {
  cobros: FilaCobro[];
  casos: Casos;
  sueltos: { comprobantes: Comprobante[]; cuotas: Map<number, CuotaDeCaso> };
  listados: Listado[];
  tablas: Map<number, TablaListado>;
  companias: string[];
  ia: IA;
  volver: string;
}) {
  const nada = !cobros.length && !casos.casos.length && !sueltos.comprobantes.length && !listados.some((l) => l.estado === "mapeo_por_confirmar");
  return (
    <>
      {nada && (
        <section className="tarjeta">
          <p className="vacio">No hay nada para revisar. Cuando llegue un comprobante o un listado traiga algo que no cierra, aparece acá.</p>
        </section>
      )}

      {cobros.length > 0 && (
        <section aria-labelledby="t-comprobantes" className="tarjeta">
          <div className="lista-cabecera">
            <h2 id="t-comprobantes" className="lista-titulo">
              Comprobantes recibidos
            </h2>
            <span className="texto-suave">{cuantos(cobros.length, "cobro con comprobante", "cobros con comprobante")} para confirmar</span>
          </div>
          <TablaCobros filas={cobros} abiertas={cobros.map((f) => f.id)} volver={volver} />
        </section>
      )}

      {casos.casos.length > 0 && <CasosARevisar casos={casos} volver={volver} />}
      {casos.noIdentificados.length > 0 && <NoIdentificados casos={casos} volver={volver} />}

      <ComprobantesSueltos sueltos={sueltos} ia={ia} volver={volver} />

      <Listados listados={listados} tablas={tablas} companias={companias} ia={ia} />
    </>
  );
}

function CasosARevisar({ casos, volver }: { casos: Casos; volver: string }) {
  return (
    <section aria-labelledby="t-casos" className="tarjeta tarjeta-padding">
      <div className="titulo-con-contador">
        <h2 id="t-casos" className="titulo-seccion">
          Casos de los listados
        </h2>
        <span className="contador-rojo">{casos.casos.length}</span>
      </div>
      <p className="texto-suave">
        Lo que informó la compañía no coincide del todo con la cartera. Nada cambia hasta que elijas qué hacer. Se muestra solo lo último que informó cada
        compañía.
      </p>
      {casos.casos.map((caso) => {
        const candidatos = [...caso.candidatos].sort((a, b) => b.puntaje - a.puntaje);
        const d = caso.datos;
        return (
          <article key={caso.id} className="caso-revisar" aria-labelledby={`caso-${caso.id}`}>
            <div className="caso-cabecera">
              <h3 id={`caso-${caso.id}`} className="celda-fuerte">
                {caso.compania} · póliza {d.poliza || "sin número"} · cuota {d.cuotaN}/{d.cuotaTotal}
                {d.item ? ` · ítem ${d.item}` : ""}
              </h3>
              <span className="texto-suave">
                {caso.fuente ?? "Conector"}
                {caso.fila ? `, fila ${caso.fila}` : ""}
              </span>
            </div>
            <p className="caso-informado">
              La compañía la informa <strong>{INFORMADO[d.estadoCompania]}</strong>: {importe(d.monto, d.moneda)}, vence el {fechaCorta(d.vencimiento)}
              {d.fechaPago ? `, pagó el ${fechaCorta(d.fechaPago)}` : ""}
              {d.medio ? ` (${ETIQUETA_MEDIO[d.medio]})` : ""}.
            </p>
            {caso.motivo && <p className="texto-suave">{caso.motivo}</p>}
            {caso.explicacion && (
              <div className="caja-ia">
                <div className="caja-ia-titulo">Lo que ve la IA</div>
                <p>{caso.explicacion}</p>
                {caso.accionPropuesta && <p className="texto-suave">Sugiere {ACCION_IA[caso.accionPropuesta] ?? caso.accionPropuesta}. Lo decidís vos.</p>}
              </div>
            )}
            {candidatos.length > 0 && (
              <div className="tabla-scroll">
                <table className="tabla tabla-compacta">
                  <caption className="visualmente-oculto">Cuotas candidatas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Cuota candidata</th>
                      <th scope="col" className="numero">
                        Monto
                      </th>
                      <th scope="col">Vence</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Coincidencia</th>
                      <th scope="col">
                        <span className="visualmente-oculto">Acción</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidatos.map((cand) => {
                      const q = casos.cuotas.get(cand.cuotaId);
                      if (!q) return null;
                      return (
                        <tr key={cand.cuotaId}>
                          <td>
                            <Link href={`/asegurados/${q.aseguradoId}`} className="nombre-asegurado">
                              {q.asegurado}
                            </Link>
                            <div className="celda-secundaria">
                              {q.ramo} · {q.poliza ?? "sin número"} · cuota {q.numero}/{q.cantidadCuotas}
                              {q.item ? ` · ítem ${q.item}` : ""}
                            </div>
                            {caso.cuotaSugeridaId === q.id && <span className="pastilla pastilla-azul">Sugerida por la IA</span>}
                          </td>
                          <td className="numero tabular">{importe(q.monto, q.moneda)}</td>
                          <td className="tabular">{fechaCorta(q.vencimiento)}</td>
                          <td>{estadoCuota(q)}</td>
                          <td>
                            <span className="celda-fuerte tabular">{cand.puntaje} pts</span>
                            <div className="celda-secundaria">{cand.motivos.join(" · ")}</div>
                          </td>
                          <td>{abierta(q) ? <AccionCaso pagoId={caso.id} cuotaId={q.id} informado={d.estadoCompania} volver={volver} /> : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <form action={resolverCasoRevisar} className="fila-acciones">
              <input type="hidden" name="pagoId" value={caso.id} />
              <input type="hidden" name="decision" value="descartar" />
              <input type="hidden" name="volver" value={volver} />
              <BotonEnviar texto="Dejar como está" enviando="Guardando…" className="boton boton-mediano" />
            </form>
          </article>
        );
      })}
    </section>
  );
}

/** Lo que se puede hacer con una cuota candidata según lo que informó la compañía. */
function AccionCaso({ pagoId, cuotaId, informado, volver }: { pagoId: number; cuotaId: number; informado: EstadoCompaniaCuota; volver: string }) {
  if (informado === "pendiente" || informado === "vencida") {
    return (
      <form action={enviarACobranza}>
        <input type="hidden" name="cuotaId" value={cuotaId} />
        <input type="hidden" name="pagoId" value={pagoId} />
        <input type="hidden" name="volver" value={volver} />
        <BotonEnviar texto="Enviar a Cobranza" enviando="Preparando…" className="boton boton-chico" />
      </form>
    );
  }
  return (
    <form action={resolverCasoRevisar}>
      <input type="hidden" name="pagoId" value={pagoId} />
      <input type="hidden" name="decision" value="aplicar" />
      <input type="hidden" name="cuotaId" value={cuotaId} />
      <input type="hidden" name="volver" value={volver} />
      <BotonEnviar texto={informado === "pagada" ? "Marcar pagada esta cuota" : "Cancelar esta cuota"} enviando="Guardando…" className="boton boton-primario boton-chico" />
    </form>
  );
}

function NoIdentificados({ casos, volver }: { casos: Casos; volver: string }) {
  return (
    <section aria-labelledby="t-no-identificados" className="tarjeta">
      <details className="detalle-plegable">
        <summary className="lista-cabecera">
          <h2 id="t-no-identificados" className="lista-titulo">
            Pagos que no se pudieron identificar
          </h2>
          <span className="texto-suave">{cuantos(casos.noIdentificados.length, "pago", "pagos")} sin una cuota de la cartera que se les parezca</span>
        </summary>
        <div className="tabla-scroll">
          <table className="tabla tabla-compacta">
            <thead>
              <tr>
                <th scope="col">Compañía</th>
                <th scope="col">Fila</th>
                <th scope="col">Póliza</th>
                <th scope="col">Cuota</th>
                <th scope="col" className="numero">
                  Monto
                </th>
                <th scope="col">Vence</th>
                <th scope="col">Informada</th>
                <th scope="col">Por qué</th>
                <th scope="col">
                  <span className="visualmente-oculto">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {casos.noIdentificados.map((p) => (
                <tr key={p.id}>
                  <td>{p.compania}</td>
                  <td className="tabular">{p.fila ?? "—"}</td>
                  <td>{p.datos.poliza || "—"}</td>
                  <td className="tabular">
                    {p.datos.cuotaN}/{p.datos.cuotaTotal}
                  </td>
                  <td className="numero tabular">{importe(p.datos.monto, p.datos.moneda)}</td>
                  <td className="tabular">{fechaCorta(p.datos.vencimiento)}</td>
                  <td>{INFORMADO[p.datos.estadoCompania]}</td>
                  <td className="celda-secundaria">{p.motivo}</td>
                  <td>
                    <form action={resolverCasoRevisar}>
                      <input type="hidden" name="pagoId" value={p.id} />
                      <input type="hidden" name="decision" value="descartar" />
                      <input type="hidden" name="volver" value={volver} />
                      <BotonEnviar texto="Descartar" enviando="…" className="boton boton-chico" />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

const EXTRACCION: Record<string, { texto: string; tono: string }> = {
  pendiente: { texto: "La IA lo está leyendo", tono: "azul" },
  ia: { texto: "Leído por la IA", tono: "verde" },
  error: { texto: "La IA no pudo leerlo", tono: "rojo" },
};

function ComprobantesSueltos({ sueltos, ia, volver }: { sueltos: { comprobantes: Comprobante[]; cuotas: Map<number, CuotaDeCaso> }; ia: IA; volver: string }) {
  return (
    <section aria-labelledby="t-sueltos" className="tarjeta tarjeta-padding">
      <div className="titulo-con-contador">
        <h2 id="t-sueltos" className="titulo-seccion">
          Comprobantes sin asignar
        </h2>
        {sueltos.comprobantes.length > 0 && <span className="contador-rojo">{sueltos.comprobantes.length}</span>}
      </div>
      <p className="texto-suave">
        Subí la foto o el PDF de una transferencia, un ticket de Pago Fácil o Rapipago o un pago de Mercado Pago.{" "}
        {ia.comprobantes ? "La IA lo lee y te propongo a qué cobro corresponde." : "Cargás monto, fecha y referencia y te propongo a qué cobro corresponde."} La cuota
        recién queda pagada cuando lo confirmás.
      </p>
      <FormConError accion={subirComprobanteSuelto} className="subir-archivo">
        <label htmlFor="comprobante-suelto" className="visualmente-oculto">
          Comprobante (foto o PDF)
        </label>
        <input id="comprobante-suelto" name="archivo" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="campo campo-archivo" required />
        <BotonEnviar texto="Subir comprobante" enviando="Subiendo…" />
      </FormConError>

      {sueltos.comprobantes.map((c) => {
        const estado = EXTRACCION[c.extraccion] ?? (c.monto === null ? { texto: "Faltan los datos", tono: "ambar" } : { texto: "Cargado a mano", tono: "gris" });
        const datos: [string, string][] = [
          ["Monto", c.monto !== null ? importe(c.monto, c.moneda) : "—"],
          ["Fecha", c.fecha ? fechaCorta(diaEnArgentina(c.fecha)) : "—"],
          ["Medio", c.medio ?? "—"],
          ["N° de operación", c.numeroOperacion ?? "—"],
          ["Referencia", c.referencia ?? "—"],
          ["Pagó", [c.pagador, c.documentoPagador].filter(Boolean).join(" · ") || "—"],
          ["Destino", c.destino ?? "—"],
        ];
        return (
          <article key={c.id} id={`comprobante-${c.id}`} className="caso-revisar" aria-labelledby={`suelto-${c.id}`}>
            <div className="caso-cabecera">
              <h3 id={`suelto-${c.id}`} className="celda-fuerte">
                Comprobante recibido {diaYHora(c.recibidoEl)}
              </h3>
              <span className={`pastilla pastilla-${estado.tono}`}>{estado.texto}</span>
              {c.archivoId && (
                <a href={`/archivos/${c.archivoId}`} className="enlace-chico" download>
                  Ver el archivo
                </a>
              )}
            </div>
            <dl className="datos-comprobante">
              {datos.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {c.motivoPropuesta && <p className="texto-suave">{c.motivoPropuesta}</p>}
            {c.candidatos.length > 0 && (
              <ul className="candidatos">
                {c.candidatos.map((cand) => {
                  const lista = cand.cuotaIds.map((id) => sueltos.cuotas.get(id)).filter((q): q is CuotaDeCaso => Boolean(q));
                  const [q] = lista;
                  if (!q) return null;
                  const total = lista.reduce((s, x) => s + x.monto, 0);
                  return (
                    <li key={cand.cuotaId} className="candidato">
                      <div>
                        <Link href={`/asegurados/${q.aseguradoId}`} className="nombre-asegurado celda-fuerte">
                          {q.asegurado}
                        </Link>
                        <div className="celda-secundaria">
                          {q.compania ?? "—"} · {lista.map((x) => `${x.ramo} ${x.poliza ?? ""} cuota ${x.numero}/${x.cantidadCuotas}`).join(", ")} · vence {fechaCorta(q.vencimiento)} ·{" "}
                          {importe(total, q.moneda)}
                        </div>
                        <div className="celda-secundaria">
                          <span className="celda-fuerte tabular">{cand.puntaje} pts</span> · {cand.motivos.join(" · ")}
                        </div>
                      </div>
                      <form action={confirmarComprobanteSuelto}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="cuotaId" value={cand.cuotaId} />
                        <input type="hidden" name="volver" value={volver} />
                        <BotonEnviar texto="Es este cobro: confirmar" enviando="Confirmando…" className="boton boton-primario boton-chico" />
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="cargar-comprobante" open={c.extraccion !== "pendiente" && c.monto === null}>
              <summary className="boton-texto">{c.monto === null ? "Cargar los datos a mano" : "Corregir los datos"}</summary>
              <FormConError accion={completarComprobanteSuelto} className="form-grilla form-comprobante">
                <input type="hidden" name="id" value={c.id} />
                <CampoTexto id={c.id} nombre="monto" etiqueta="Monto" valor={c.monto !== null ? String(c.monto).replace(".", ",") : ""} placeholder="72.500,00" />
                <div className="form-columna">
                  <label htmlFor={`suelto-${c.id}-moneda`} className="etiqueta">
                    Moneda
                  </label>
                  <select id={`suelto-${c.id}-moneda`} name="moneda" className="campo" defaultValue={c.moneda}>
                    <option value="ARS">Pesos</option>
                    <option value="USD">Dólares</option>
                  </select>
                </div>
                <CampoTexto id={c.id} nombre="fecha" etiqueta="Fecha" tipo="date" valor={c.fecha ? diaEnArgentina(c.fecha) : ""} />
                <CampoTexto id={c.id} nombre="medio" etiqueta="Medio" valor={c.medio ?? ""} placeholder="Transferencia · Banco Nación" />
                <CampoTexto id={c.id} nombre="numeroOperacion" etiqueta="N° de operación" valor={c.numeroOperacion ?? ""} />
                <CampoTexto id={c.id} nombre="referencia" etiqueta="Referencia o código de pago" valor={c.referencia ?? ""} />
                <CampoTexto id={c.id} nombre="pagador" etiqueta="Quién pagó" valor={c.pagador ?? ""} />
                <CampoTexto id={c.id} nombre="documentoPagador" etiqueta="DNI o CUIT de quien pagó" valor={c.documentoPagador ?? ""} />
                <CampoTexto id={c.id} nombre="destinoTitular" etiqueta="Titular de la cuenta de destino" valor="" />
                <CampoTexto id={c.id} nombre="destinoCuenta" etiqueta="CBU, CVU o alias de destino" valor="" />
                <BotonEnviar texto="Guardar y proponer el cobro" enviando="Buscando el cobro…" className="boton boton-primario boton-mediano boton-en-grilla" />
              </FormConError>
            </details>
            <form action={descartarComprobanteSuelto} className="fila-acciones">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="volver" value={volver} />
              <BotonEnviar texto="Descartar" enviando="…" className="boton-terciario" />
            </form>
          </article>
        );
      })}
    </section>
  );
}

function CampoTexto({ id, nombre, etiqueta, valor, placeholder, tipo = "text" }: { id: number; nombre: string; etiqueta: string; valor: string; placeholder?: string; tipo?: string }) {
  const campo = `suelto-${id}-${nombre}`;
  return (
    <div className="form-columna">
      <label htmlFor={campo} className="etiqueta">
        {etiqueta}
      </label>
      <input id={campo} name={nombre} type={tipo} className="campo" defaultValue={valor} placeholder={placeholder} />
    </div>
  );
}

const ESTADO_LISTADO: Record<string, { texto: string; tono: string }> = {
  pendiente: { texto: "Sin procesar", tono: "gris" },
  extrayendo: { texto: "La IA lo está leyendo", tono: "azul" },
  mapeo_por_confirmar: { texto: "Confirmá las columnas", tono: "ambar" },
  procesada: { texto: "Leído", tono: "verde" },
  error: { texto: "No se pudo leer", tono: "rojo" },
};

function Problemas({ problemas }: { problemas: ProblemaFuente[] }) {
  if (!problemas.length) return null;
  return (
    <details className="problemas-listado">
      <summary className="boton-texto">{cuantos(problemas.length, "fila no se pudo leer", "filas no se pudieron leer")}</summary>
      <ul>
        {problemas.map((p) => (
          <li key={`${p.fila}-${p.mensaje}`}>
            <span className="celda-fuerte tabular">Fila {p.fila}:</span> {p.mensaje}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Listados({ listados, tablas, companias, ia }: { listados: Listado[]; tablas: Map<number, TablaListado>; companias: string[]; ia: IA }) {
  return (
    <section aria-labelledby="t-listados" id="importar" className="tarjeta tarjeta-padding">
      <h2 id="t-listados" className="titulo-seccion">
        Listados de las compañías
      </h2>
      <p className="texto-suave">
        Bajá de cada portal el listado de cuotas pagas o impagas y subilo acá: Excel (.xlsx) o CSV{ia.pdf ? ", o PDF (lo lee la IA)" : ""}. La primera vez
        confirmás qué dato tiene cada columna; después se lee solo.
      </p>
      <FormConError accion={subirListado} className="form-grilla subir-listado">
        <div className="form-columna">
          <label htmlFor="listado-compania" className="etiqueta">
            Compañía
          </label>
          <select id="listado-compania" name="compania" className="campo" defaultValue="" required>
            <option value="" disabled>
              Elegí la compañía
            </option>
            {companias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="form-columna">
          <label htmlFor="listado-archivo" className="etiqueta">
            Archivo
          </label>
          <input id="listado-archivo" name="archivo" type="file" accept={ia.pdf ? ".xlsx,.csv,.txt,.pdf" : ".xlsx,.csv,.txt"} className="campo campo-archivo" required />
        </div>
        <BotonEnviar texto="Subir listado" enviando="Leyendo el listado…" className="boton boton-primario boton-mediano boton-en-grilla" />
      </FormConError>

      {listados.length > 0 && (
        <ol className="listados">
          {listados.map((l) => {
            const estado = ESTADO_LISTADO[l.estado] ?? { texto: l.estado, tono: "gris" };
            const tabla = tablas.get(l.id);
            const propuesto = leerMapeoListado(l.mapeoPropuesto);
            return (
              <li key={l.id} id={`listado-${l.id}`} className="listado">
                <div className="caso-cabecera">
                  <span className="celda-fuerte">{l.nombre ?? "Listado"}</span>
                  <span className="texto-suave">
                    {l.compania} · {diaYHora(l.creadoEl)}
                  </span>
                  <span className={`pastilla pastilla-${estado.tono}`}>{estado.texto}</span>
                </div>
                {l.estado === "procesada" && (
                  <p className="texto-suave">
                    {cuantos(l.filasExtraidas, "fila leída", "filas leídas")}: {cuantos(l.pagos.confirmados, "coincidió", "coincidieron")} con la cartera,{" "}
                    {l.pagos.aRevisar} a revisar y {cuantos(l.pagos.noIdentificados, "no identificada", "no identificadas")}.
                  </p>
                )}
                {l.estado === "error" && l.errorSeguro && <p className="mensaje-error">{l.errorSeguro}</p>}
                <Problemas problemas={l.problemas} />
                {l.estado === "mapeo_por_confirmar" &&
                  (tabla ? (
                    <ConfirmarColumnas
                      fuenteId={l.id}
                      encabezados={tabla.encabezados}
                      filas={tabla.filas}
                      propuesta={tabla.encabezados.map((e): CampoListado | "" => propuesto?.columnas[normalizarEncabezado(e)] ?? "")}
                      estadoPorDefecto={propuesto?.estadoPorDefecto ?? null}
                      monedaPorDefecto={propuesto?.monedaPorDefecto ?? "ARS"}
                      conIA={(l.mapeoPropuesto as { origen?: string } | null)?.origen === "ia"}
                    />
                  ) : (
                    <p className="mensaje-error">El archivo ya no está guardado: subilo de nuevo.</p>
                  ))}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
