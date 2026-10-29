"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { IconoSiguiente } from "@/components/iconos";
import { MEDIOS_MANUALES } from "@/lib/validador/pantalla";
import { enviarACobranza, marcarPagada } from "./actions";
import { BotonEnviar } from "./Formularios";
import { FormComprobante } from "./TablaCobros";

type Pastilla = { texto: string; tono: string };

export type CuotaFila = {
  id: number;
  poliza: string;
  cuota: string;
  item: string;
  endoso: string;
  cupon: string;
  monto: string;
  vencimiento: string;
  medio: string;
  estado: Pastilla;
  revision: string;
  fechaPago: string;
  origen: string;
  abierta: boolean;
  /** Tiene un comprobante esperando en Por revisar. */
  conComprobante: boolean;
};

export type GrupoFila = {
  aseguradoId: number;
  asegurado: string;
  cantidad: number;
  companias: string;
  /** Una línea por moneda. */
  montos: string[];
  /** Pendientes: los días de la cuota más urgente. Pagadas: la fecha del último pago. */
  etiqueta: Pastilla;
  contactable: boolean;
  cuotas: CuotaFila[];
};

type Panel = { cuotaId: number; tipo: "pagada" | "comprobante" } | null;

function Acciones({ cuota, grupo, volver, panel, abrir }: { cuota: CuotaFila; grupo: GrupoFila; volver: string; panel: Panel; abrir: (p: Panel) => void }) {
  const alternar = (tipo: "pagada" | "comprobante") => abrir(panel?.cuotaId === cuota.id && panel.tipo === tipo ? null : { cuotaId: cuota.id, tipo });
  return (
    <div className="acciones-rapidas">
      <button type="button" className="boton boton-chico" aria-expanded={panel?.cuotaId === cuota.id && panel.tipo === "pagada"} onClick={() => alternar("pagada")}>
        Marcar pagada
      </button>
      {!cuota.conComprobante && (
        <button
          type="button"
          className="boton boton-chico"
          aria-expanded={panel?.cuotaId === cuota.id && panel.tipo === "comprobante"}
          onClick={() => alternar("comprobante")}
        >
          Adjuntar comprobante
        </button>
      )}
      <Link href={`/asegurados/${grupo.aseguradoId}`} className="boton boton-chico">
        Ver póliza
      </Link>
      {grupo.contactable ? (
        <form action={enviarACobranza}>
          <input type="hidden" name="cuotaId" value={cuota.id} />
          <input type="hidden" name="volver" value={volver} />
          <BotonEnviar texto="Enviar a Cobranza" enviando="Preparando…" className="boton boton-chico" />
        </form>
      ) : (
        <Link href={`/asegurados/${grupo.aseguradoId}?editar=1`} className="boton boton-chico" title="Sin teléfono ni email no se le puede escribir">
          Completar contacto
        </Link>
      )}
    </div>
  );
}

function FormPagada({ cuota, volver, hoy }: { cuota: CuotaFila; volver: string; hoy: string }) {
  const id = (n: string) => `pagada-${cuota.id}-${n}`;
  return (
    <form action={marcarPagada} className="form-grilla form-comprobante">
      <input type="hidden" name="cuotaId" value={cuota.id} />
      <input type="hidden" name="volver" value={volver} />
      <div className="form-columna">
        <label htmlFor={id("fecha")} className="etiqueta">
          Fecha de pago
        </label>
        <input id={id("fecha")} name="fecha" type="date" className="campo" defaultValue={hoy} max={hoy} required />
      </div>
      <div className="form-columna">
        <label htmlFor={id("medio")} className="etiqueta">
          Medio
        </label>
        <select id={id("medio")} name="medio" className="campo" defaultValue="Transferencia">
          {MEDIOS_MANUALES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="form-columna">
        <label htmlFor={id("archivo")} className="etiqueta">
          Comprobante (opcional)
        </label>
        <input id={id("archivo")} name="archivo" type="file" accept="image/*,application/pdf" className="campo campo-archivo" />
      </div>
      <BotonEnviar texto="Confirmar el pago" enviando="Guardando…" className="boton boton-primario boton-mediano boton-en-grilla" />
      <p className="nota-pie">Se marcan pagadas también las cuotas que se cobran junto con esta (mismo asegurado, compañía y vencimiento).</p>
    </form>
  );
}

/**
 * Lista por asegurado (Pendientes → Cobranza y Pagadas → Resumen). Al
 * expandir un asegurado se ve una sub-tabla por cuota; en Pendientes, con las
 * acciones de cada cuota.
 */
export function ListaAsegurados({ grupos, modo, volver, hoy }: { grupos: GrupoFila[]; modo: "pendientes" | "pagadas"; volver: string; hoy: string }) {
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [panel, setPanel] = useState<Panel>(null);
  const alternar = (id: number) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pendientes = modo === "pendientes";
  const columnas = pendientes ? 10 : 9;

  return (
    <div className="tabla-scroll">
      <table className="tabla tabla-grupos">
        <thead>
          <tr>
            <th scope="col">
              <span className="visualmente-oculto">Detalle</span>
            </th>
            <th scope="col">Asegurado</th>
            <th scope="col">Compañía</th>
            <th scope="col" className="numero">
              Monto
            </th>
            <th scope="col">{pendientes ? "Vence" : "Último pago"}</th>
          </tr>
        </thead>
        {grupos.map((g) => {
          const abierto = abiertos.has(g.aseguradoId);
          return (
            <tbody key={g.aseguradoId} className={abierto ? "grupo-asegurado grupo-abierto" : "grupo-asegurado"}>
              <tr>
                <td className="celda-boton">
                  <button
                    type="button"
                    className="boton-icono"
                    aria-expanded={abierto}
                    aria-controls={`cuotas-${g.aseguradoId}`}
                    aria-label={`${abierto ? "Ocultar" : "Ver"} las cuotas de ${g.asegurado}`}
                    onClick={() => alternar(g.aseguradoId)}
                  >
                    <span className={abierto ? "chevron chevron-abajo" : "chevron"}>
                      <IconoSiguiente size={16} />
                    </span>
                  </button>
                </td>
                <td>
                  <Link href={`/asegurados/${g.aseguradoId}`} className="nombre-asegurado celda-fuerte">
                    {g.asegurado}
                  </Link>
                  <span className="contador-gris contador-cuotas">{g.cantidad === 1 ? "1 cuota" : `${g.cantidad} cuotas`}</span>
                </td>
                <td>{g.companias}</td>
                <td className="numero tabular celda-fuerte">
                  {g.montos.map((m) => (
                    <div key={m}>{m}</div>
                  ))}
                </td>
                <td>
                  <span className={`pastilla pastilla-${g.etiqueta.tono}`}>{g.etiqueta.texto}</span>
                </td>
              </tr>
              {abierto && (
                <tr className="fila-detalle" id={`cuotas-${g.aseguradoId}`}>
                  <td colSpan={5}>
                    <div className="tabla-scroll">
                      <table className="tabla tabla-compacta tabla-subcuotas">
                        <caption className="visualmente-oculto">Cuotas de {g.asegurado}</caption>
                        <thead>
                          <tr>
                            <th scope="col">Póliza</th>
                            <th scope="col">Cuota</th>
                            <th scope="col">Ítem</th>
                            {pendientes && <th scope="col">Endoso</th>}
                            <th scope="col">Cupón</th>
                            <th scope="col" className="numero">
                              Monto
                            </th>
                            <th scope="col">Vencimiento</th>
                            {!pendientes && <th scope="col">Pagó el</th>}
                            <th scope="col">Medio de pago</th>
                            {pendientes ? (
                              <>
                                <th scope="col">Estado</th>
                                <th scope="col">Última revisión</th>
                              </>
                            ) : (
                              <th scope="col">Origen</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {g.cuotas.map((c) => (
                            <Fragment key={c.id}>
                              <tr className={pendientes && c.abierta ? "fila-con-acciones" : undefined}>
                                <td>{c.poliza}</td>
                                <td className="tabular">{c.cuota}</td>
                                <td>{c.item}</td>
                                {pendientes && <td>{c.endoso}</td>}
                                <td>{c.cupon}</td>
                                <td className="numero tabular">{c.monto}</td>
                                <td className="tabular">{c.vencimiento}</td>
                                {!pendientes && <td className="tabular">{c.fechaPago}</td>}
                                <td>{c.medio}</td>
                                {pendientes ? (
                                  <>
                                    <td>
                                      <span className={`punto-estado punto-${c.estado.tono}`}>{c.estado.texto}</span>
                                      {c.conComprobante && (
                                        <Link href="/agentes/validador?tab=revisar" className="enlace-chico">
                                          Comprobante por revisar
                                        </Link>
                                      )}
                                    </td>
                                    <td className="texto-suave-normal">{c.revision}</td>
                                  </>
                                ) : (
                                  <td>{c.origen}</td>
                                )}
                              </tr>
                              {pendientes && c.abierta && (
                                <tr className="fila-acciones-cuota">
                                  <td colSpan={columnas}>
                                    <Acciones cuota={c} grupo={g} volver={volver} panel={panel} abrir={setPanel} />
                                  </td>
                                </tr>
                              )}
                              {pendientes && panel?.cuotaId === c.id && (
                                <tr className="fila-panel">
                                  <td colSpan={columnas}>
                                    {panel.tipo === "pagada" ? (
                                      <FormPagada cuota={c} volver={volver} hoy={hoy} />
                                    ) : (
                                      <FormComprobante fila={c} volver={volver} abierto />
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
      {grupos.length === 0 && <p className="vacio">No hay cuotas con estos filtros.</p>}
    </div>
  );
}
