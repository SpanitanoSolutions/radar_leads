import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { contactoDe, esVigente, tonoDias } from "@/lib/asegurados";
import { obtenerCuenta } from "@/lib/datos";
import { obtenerAsegurados, obtenerAvisosPendientes } from "@/lib/datos-cartera";
import { diaEnArgentina, diaYMes, fechaCorta } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { conFirma } from "@/lib/plantillas";
import { agruparPorSemana } from "@/lib/vencimientos";
import { BotonAvisar } from "../asegurados/BotonAvisar";
import { aprobarMensaje, omitirMensaje } from "../mensajes/actions";
import "../asegurados/asegurados.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PLAZOS = [30, 60, 90] as const;

export default async function Vencimientos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const dias = PLAZOS.find((p) => String(p) === sp.dias) ?? 60;
  const hoy = diaEnArgentina(new Date());
  const [asegurados, avisos, cuenta] = await Promise.all([obtenerAsegurados(), obtenerAvisosPendientes(), obtenerCuenta()]);
  const conAviso = new Set(avisos.map((a) => a.aseguradoId));

  const items = asegurados.flatMap((a) =>
    a.polizas
      .filter((p) => p.vigenciaHasta && esVigente(p, hoy))
      .map((p) => ({
        vence: p.vigenciaHasta!,
        poliza: p,
        asegurado: a,
        contactable: Boolean(contactoDe(a).telefono || contactoDe(a).email),
      })),
  );
  const semanas = agruparPorSemana(items, hoy, dias);
  const total = semanas.reduce((n, s) => n + s.items.length, 0);
  const volver = `/vencimientos?dias=${dias}`;

  return (
    <>
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <h1 className="titulo">Vencimientos</h1>
          <p className="subtitulo">
            {total === 1 ? "1 póliza vence" : `${total} pólizas vencen`} en los próximos {dias} días, agrupadas por semana.
          </p>
        </div>
        <nav aria-label="Plazo" className="segmentos">
          {PLAZOS.map((p) => (
            <Link key={p} href={`/vencimientos?dias=${p}`} aria-current={p === dias ? "true" : undefined} className="segmento">
              {p} días
            </Link>
          ))}
        </nav>
      </header>

      <Aviso codigo={sp.aviso} />

      {avisos.length > 0 && (
        <section aria-labelledby="t-avisos" className="tarjeta tarjeta-padding">
          <div className="titulo-con-contador">
            <h2 id="t-avisos" className="titulo-seccion">
              Avisos para aprobar
            </h2>
            <span className="contador-rojo">{avisos.length}</span>
          </div>
          <p className="texto-suave">Nada sale sin que lo apruebes. Podés corregir el texto antes de enviarlo.</p>
          {avisos.map((m) => (
            <form key={m.id} action={aprobarMensaje} className="borrador">
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="volver" value={volver} />
              <div className="borrador-cabecera">
                <span className="celda-fuerte">
                  {m.aseguradoId ? <Link href={`/asegurados/${m.aseguradoId}`}>{m.cliente}</Link> : m.cliente}
                </span>
                <span className="texto-suave">
                  {m.canal === "whatsapp" ? "WhatsApp" : "Email"} · {m.destinatario}
                </span>
              </div>
              {m.motivo && <p className="texto-suave">{m.motivo}</p>}
              <label htmlFor={`texto-${m.id}`} className="visualmente-oculto">
                Texto del mensaje para {m.cliente}
              </label>
              <textarea
                id={`texto-${m.id}`}
                name="texto"
                rows={4}
                className={`campo burbuja ${m.canal === "whatsapp" ? "burbuja-whatsapp" : ""}`}
                defaultValue={conFirma(m.texto, cuenta.nombre)}
              />
              <div className="fila-acciones">
                <button type="submit" className="boton boton-primario boton-mediano">
                  Aprobar y enviar
                </button>
                <button type="submit" formAction={omitirMensaje} className="boton-terciario">
                  Omitir
                </button>
              </div>
            </form>
          ))}
        </section>
      )}

      {semanas.length === 0 && (
        <section className="tarjeta">
          <p className="vacio">No hay pólizas que venzan en los próximos {dias} días.</p>
        </section>
      )}

      {semanas.map((s) => (
        <section key={s.desde} aria-labelledby={`semana-${s.desde}`} className="tarjeta">
          <div className="lista-cabecera">
            <h2 id={`semana-${s.desde}`} className="lista-titulo">
              {s.titulo}
            </h2>
            <span className="texto-suave">
              {diaYMes(s.desde)} al {diaYMes(s.hasta)} · {s.items.length === 1 ? "1 póliza" : `${s.items.length} pólizas`} ·{" "}
              {pesos(s.items.reduce((t, i) => t + (i.poliza.prima ?? 0), 0))}
            </span>
          </div>
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta">
              <thead>
                <tr>
                  <th scope="col">Vence</th>
                  <th scope="col">Asegurado</th>
                  <th scope="col">Póliza</th>
                  <th scope="col">Compañía</th>
                  <th scope="col" className="numero">
                    Prima anual
                  </th>
                  <th scope="col">
                    <span className="visualmente-oculto">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.items.map(({ poliza: p, asegurado: a, dias: d, contactable }) => (
                  <tr key={p.id}>
                    <td>
                      <div className="tabular celda-fuerte">{fechaCorta(p.vigenciaHasta!)}</div>
                      <div className={`dias dias-${tonoDias(d)}`}>{d === 0 ? "hoy" : `en ${d} días`}</div>
                    </td>
                    <td>
                      <Link href={`/asegurados/${a.id}`} className="nombre-asegurado">
                        {a.nombre}
                      </Link>
                      <div className="celda-secundaria">{a.localidad}</div>
                    </td>
                    <td>
                      <div>
                        {p.ramo}
                        {p.bien && ` · ${p.bien}`}
                      </div>
                      {p.numero && <div className="celda-secundaria">Póliza {p.numero}</div>}
                    </td>
                    <td>{p.compania ?? "—"}</td>
                    <td className="numero tabular">{p.prima !== null ? pesos(p.prima) : "—"}</td>
                    <td>
                      <div className="acciones-rapidas acciones-derecha">
                        <Link href={`/asegurados/${a.id}`} className="boton boton-chico">
                          Ver ficha
                        </Link>
                        {contactable && (
                          <BotonAvisar
                            aseguradoId={a.id}
                            etiqueta={conAviso.has(a.id) ? "Revisar aviso" : "Avisar"}
                            className="boton boton-chico"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
