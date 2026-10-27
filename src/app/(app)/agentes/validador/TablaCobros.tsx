"use client";

import Link from "next/link";
import { useState } from "react";
import { IconoSiguiente } from "@/components/iconos";
import { cargarComprobante, confirmarPago, enviarRecibo, enviarRecordatorio, pedirOtroComprobante } from "./actions";

export type Accion = "confirmar" | "pedir" | "confirmarIgual" | "recordatorio" | "marcarPagada" | "completarContacto" | "recibo";

export type FilaCobro = {
  id: number;
  aseguradoId: number;
  cliente: string;
  compania: string;
  poliza: string;
  cuota: string;
  monto: string;
  vence: { texto: string; tono: string };
  comprobante: { texto: string; clase: string };
  detalle: {
    canal: string | null;
    datos: [string, string][];
    archivoId: number | null;
    titulo: string;
    chequeos: { resultado: "ok" | "mal" | "duda"; texto: string }[];
    acciones: Accion[];
    puedeCargar: boolean;
  };
};

const MARCA = {
  ok: { marca: "✓", etiqueta: "Correcto", clase: "chequeo-ok" },
  mal: { marca: "✕", etiqueta: "Error", clase: "chequeo-mal" },
  duda: { marca: "!", etiqueta: "Revisar", clase: "chequeo-duda" },
};

function Boton({ accion, fila, volver, primero }: { accion: Accion; fila: FilaCobro; volver: string; primero: boolean }) {
  const clase = primero ? "boton boton-primario boton-mediano" : "boton boton-mediano";
  if (accion === "completarContacto") {
    return (
      <Link href={`/asegurados/${fila.aseguradoId}?editar=1`} className={clase}>
        Completar contacto
      </Link>
    );
  }
  const config: Record<Exclude<Accion, "completarContacto">, { texto: string; accion: (f: FormData) => Promise<void> }> = {
    confirmar: { texto: "Confirmar pago", accion: confirmarPago },
    confirmarIgual: { texto: "Confirmar igual", accion: confirmarPago },
    marcarPagada: { texto: "Marcar como pagada", accion: confirmarPago },
    pedir: { texto: "Pedir otro comprobante", accion: pedirOtroComprobante },
    recordatorio: { texto: "Enviar recordatorio", accion: enviarRecordatorio },
    recibo: { texto: "Enviar recibo al cliente", accion: enviarRecibo },
  };
  const c = config[accion];
  return (
    <form action={c.accion}>
      <input type="hidden" name="cuotaId" value={fila.id} />
      <input type="hidden" name="volver" value={volver} />
      <button type="submit" className={clase}>
        {c.texto}
      </button>
    </form>
  );
}

function FormComprobante({ fila, volver }: { fila: FilaCobro; volver: string }) {
  const id = (n: string) => `comp-${fila.id}-${n}`;
  return (
    <details className="cargar-comprobante">
      <summary className="boton-texto">Cargar un comprobante a mano</summary>
      <form action={cargarComprobante} className="form-grilla form-comprobante">
        <input type="hidden" name="cuotaId" value={fila.id} />
        <input type="hidden" name="volver" value={volver} />
        <div className="form-columna">
          <label htmlFor={id("medio")} className="etiqueta">
            Medio
          </label>
          <select id={id("medio")} name="medio" className="campo" defaultValue="Transferencia">
            <option>Transferencia</option>
            <option>Depósito</option>
            <option>Rapipago</option>
            <option>Pago Fácil</option>
            <option>Transferencia · Mercado Pago</option>
            <option>Débito automático</option>
          </select>
        </div>
        <div className="form-columna">
          <label htmlFor={id("fecha")} className="etiqueta">
            Fecha
          </label>
          <input id={id("fecha")} name="fecha" type="date" className="campo" required />
        </div>
        <div className="form-columna">
          <label htmlFor={id("monto")} className="etiqueta">
            Monto
          </label>
          <input id={id("monto")} name="monto" inputMode="decimal" className="campo" placeholder="72.500,00" required />
        </div>
        <div className="form-columna">
          <label htmlFor={id("destino")} className="etiqueta">
            Destino o código de pago
          </label>
          <input id={id("destino")} name="destino" className="campo" placeholder="Titular de la cuenta o código" />
        </div>
        <div className="form-columna">
          <label htmlFor={id("operacion")} className="etiqueta">
            N° de operación
          </label>
          <input id={id("operacion")} name="operacion" className="campo" />
        </div>
        <div className="form-columna">
          <label htmlFor={id("archivo")} className="etiqueta">
            Imagen o PDF (opcional)
          </label>
          <input id={id("archivo")} name="archivo" type="file" accept="image/*,application/pdf" className="campo campo-archivo" />
        </div>
        <button type="submit" className="boton boton-primario boton-mediano alinear-inicio">
          Revisar comprobante
        </button>
      </form>
    </details>
  );
}

export function TablaCobros({ filas, abierta, volver }: { filas: FilaCobro[]; abierta: number | null; volver: string }) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set(abierta ? [abierta] : []));
  const alternar = (id: number) =>
    setAbiertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="tabla-scroll">
      <table className="tabla tabla-cobros">
        <thead>
          <tr>
            <th scope="col">
              <span className="visualmente-oculto">Detalle</span>
            </th>
            <th scope="col">Cliente</th>
            <th scope="col">Compañía</th>
            <th scope="col">Póliza · cuota</th>
            <th scope="col" className="numero">
              Monto
            </th>
            <th scope="col">Vence</th>
            <th scope="col">Comprobante</th>
          </tr>
        </thead>
        {filas.map((f) => {
          const abierto = abiertas.has(f.id);
          return (
            <tbody key={f.id} className={abierto ? "cobro cobro-abierto" : "cobro"}>
              <tr>
                <td className="celda-boton">
                  <button
                    type="button"
                    className="boton-icono"
                    aria-expanded={abierto}
                    aria-controls={`detalle-${f.id}`}
                    aria-label={`${abierto ? "Ocultar" : "Ver"} detalle de ${f.cliente}`}
                    onClick={() => alternar(f.id)}
                  >
                    <span className={abierto ? "chevron chevron-abajo" : "chevron"}>
                      <IconoSiguiente size={16} />
                    </span>
                  </button>
                </td>
                <td className="celda-fuerte">
                  <Link href={`/asegurados/${f.aseguradoId}`} className="nombre-asegurado">
                    {f.cliente}
                  </Link>
                </td>
                <td>{f.compania}</td>
                <td>
                  <div>{f.poliza}</div>
                  <div className="celda-secundaria">{f.cuota}</div>
                </td>
                <td className="numero tabular celda-fuerte">{f.monto}</td>
                <td>
                  <span className={`pastilla pastilla-${f.vence.tono}`}>{f.vence.texto}</span>
                </td>
                <td>
                  <span className={f.comprobante.clase}>{f.comprobante.texto}</span>
                </td>
              </tr>
              {abierto && (
                <tr className="fila-detalle" id={`detalle-${f.id}`}>
                  <td colSpan={7}>
                    <div className="detalle-cobro">
                      {f.detalle.datos.length > 0 && (
                        <div className="caja-comprobante">
                          <div className="caja-comprobante-titulo">Comprobante · {f.detalle.canal}</div>
                          <dl>
                            {f.detalle.datos.map(([k, v]) => (
                              <div key={k}>
                                <dt>{k}</dt>
                                <dd>{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                      <div className="detalle-cobro-texto">
                        <div className="celda-fuerte">{f.detalle.titulo}</div>
                        <ul className="chequeos">
                          {f.detalle.chequeos.map((c, i) => (
                            <li key={i}>
                              <span className={`chequeo ${MARCA[c.resultado].clase}`} aria-hidden="true">
                                {MARCA[c.resultado].marca}
                              </span>
                              <span>
                                <span className="visualmente-oculto">{MARCA[c.resultado].etiqueta}: </span>
                                {c.texto}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="fila-acciones">
                          {f.detalle.acciones.map((a, i) => (
                            <Boton key={a} accion={a} fila={f} volver={volver} primero={i === 0} />
                          ))}
                          {f.detalle.archivoId && (
                            <a href={`/archivos/${f.detalle.archivoId}`} className="boton boton-mediano" download>
                              Ver comprobante original
                            </a>
                          )}
                        </div>
                        {f.detalle.puedeCargar && <FormComprobante fila={f} volver={volver} />}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
      {filas.length === 0 && <p className="vacio">No hay cuotas en esta pestaña.</p>}
    </div>
  );
}
