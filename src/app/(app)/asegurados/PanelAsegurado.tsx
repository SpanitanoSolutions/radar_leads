import Link from "next/link";
import { IconoSiguiente, IconoTelefono } from "@/components/iconos";
import { PanelLateral } from "@/components/PanelLateral";
import type { Importacion } from "@/db/schema";
import {
  contactoDe,
  enlaceLlamada,
  esVigente,
  gruposDeVencimiento,
  iniciales,
  resumirAsegurado,
  subtituloAsegurado,
  tonoDias,
  type AseguradoConPolizas,
} from "@/lib/asegurados";
import { enlaceWhatsApp } from "@/lib/contacto";
import { diaEnArgentina, diasEntre, fechaCorta } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { oportunidadesDe } from "@/lib/oportunidades";
import { AsistenteWhatsApp } from "./AsistenteWhatsApp";
import { BotonAvisar } from "./BotonAvisar";
import { alternarSeguimiento, pedirCotizacionOportunidad, prepararRenovacion } from "./actions";

const CLASE_TIPO = {
  "Mejora de cobertura": "pastilla-ambar-fuerte",
  "Venta cruzada": "pastilla-azul",
  "Dato faltante": "pastilla-gris",
} as const;

export function PanelAsegurado({
  asegurado: a,
  hoy,
  seguimiento,
  importacion,
  cerrarHref,
  volver,
}: {
  asegurado: AseguradoConPolizas;
  hoy: string;
  seguimiento: Set<string>;
  importacion: Importacion | null;
  cerrarHref: string;
  /** URL actual, para volver después de cada acción. */
  volver: string;
}) {
  const fila = resumirAsegurado(a, hoy);
  const vigentes = a.polizas.filter((p) => esVigente(p, hoy)).sort((x, y) => (x.vigenciaHasta ?? "").localeCompare(y.vigenciaHasta ?? ""));
  const contacto = contactoDe(a);
  const grupos = gruposDeVencimiento(a.polizas, hoy);
  const oportunidades = oportunidadesDe({ tipo: a.tipo, ...contacto, polizas: vigentes }, Number(hoy.slice(0, 4)));
  const whatsapp = contacto.telefono ? enlaceWhatsApp(contacto.telefono) : null;

  return (
    <PanelLateral tituloId="panel-titulo" cerrarHref={cerrarHref} volverA={`abrir-${a.id}`}>
      <div className="panel-cabecera">
        <div className="panel-identidad">
          <div className="avatar" aria-hidden="true">
            {iniciales(a.nombre)}
          </div>
          <div className="panel-identidad-texto">
            <h2 id="panel-titulo" className="panel-titulo">
              {a.nombre}
            </h2>
            <div className="panel-sub">{subtituloAsegurado(a)}</div>
          </div>
        </div>
        <div className="fila-acciones">
          {contacto.telefono && (
            <a href={enlaceLlamada(contacto.telefono)} className="boton boton-primario boton-mediano">
              <IconoTelefono size={15} />
              Llamar
            </a>
          )}
          {whatsapp && (
            <a href="#asistente-whatsapp" className="boton boton-mediano">
              Escribir WhatsApp
            </a>
          )}
          {contacto.email && (
            <a href={`mailto:${contacto.email}`} className="boton boton-mediano">
              Email
            </a>
          )}
          <Link href={`/asegurados/${a.id}`} className="enlace-ficha">
            Abrir ficha completa
            <IconoSiguiente size={14} />
          </Link>
        </div>
      </div>

      <div className="panel-cuerpo">
        <div className="panel-stats">
          <div className="stat">
            <div className="stat-titulo">Pólizas</div>
            <div className="stat-valor">{vigentes.length}</div>
          </div>
          <div className="stat">
            <div className="stat-titulo">Prima anual</div>
            <div className="stat-valor tabular">{pesos(fila.prima)}</div>
          </div>
          <div className="stat">
            <div className="stat-titulo">Próximo vencimiento</div>
            <div className={`stat-valor ${fila.dias !== null ? `texto-${tonoDias(fila.dias)}` : ""}`}>
              {fila.dias !== null ? `en ${fila.dias} días` : "Sin fecha"}
            </div>
          </div>
        </div>

        <AsistenteWhatsApp
          nombre={a.nombre}
          telefono={contacto.telefono}
          proximoVencimiento={fila.vence ? fechaCorta(fila.vence) : null}
        />

        <section aria-labelledby="t-venc" className="panel-seccion">
          <h3 id="t-venc" className="panel-seccion-titulo">
            Próximos vencimientos
          </h3>
          {grupos.length === 0 && <p className="texto-suave">No tiene pólizas vigentes con fecha de vencimiento.</p>}
          {grupos.map((g) => {
            const urgente = g.dias <= 30;
            return (
              <div key={g.fecha} className={urgente ? "vencimiento vencimiento-urgente" : "vencimiento"}>
                <div className="vencimiento-cabecera">
                  <div className="vencimiento-fecha">
                    <span className="tabular">{fechaCorta(g.fecha)}</span>
                    <span className={`dias-fuerte texto-${tonoDias(g.dias)}`}>en {g.dias} días</span>
                  </div>
                  <span className="texto-suave">
                    {g.polizas.length === 1 ? "1 póliza" : `${g.polizas.length} pólizas`} · {pesos(g.total)}
                  </span>
                </div>
                <ul className="lista-simple">
                  {g.polizas.map((p) => (
                    <li key={p.id}>
                      {p.ramo} · {p.bien ?? "Sin detalle"} ({p.compania ?? "sin compañía"})
                    </li>
                  ))}
                </ul>
                {urgente && (
                  <div className="fila-acciones">
                    <form action={prepararRenovacion}>
                      <input type="hidden" name="aseguradoId" value={a.id} />
                      <input type="hidden" name="fecha" value={g.fecha} />
                      <input type="hidden" name="volver" value={volver} />
                      <button type="submit" className="boton boton-primario boton-chico-alto">
                        Preparar renovación
                      </button>
                    </form>
                    <BotonAvisar aseguradoId={a.id} etiqueta="Avisar al cliente" className="boton boton-chico-alto" />
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section aria-labelledby="t-opor" className="panel-seccion">
          <div className="titulo-con-contador">
            <h3 id="t-opor" className="panel-seccion-titulo">
              Oportunidades de mejora
            </h3>
            <span className="contador-azul">{oportunidades.length}</span>
          </div>
          {oportunidades.length === 0 && (
            <p className="texto-suave">Su cobertura está completa para lo que tiene asegurado.</p>
          )}
          {oportunidades.map((o) => {
            const en = seguimiento.has(o.clave);
            return (
              <div key={o.clave} className="oportunidad">
                <div className="oportunidad-cabecera">
                  <span className={`pastilla ${CLASE_TIPO[o.tipo]}`}>{o.tipo}</span>
                  <span className="oportunidad-titulo">{o.titulo}</span>
                </div>
                <p className="oportunidad-detalle">{o.detalle}</p>
                <div className="fila-acciones">
                  <form action={alternarSeguimiento}>
                    <input type="hidden" name="aseguradoId" value={a.id} />
                    <input type="hidden" name="clave" value={o.clave} />
                    <button
                      type="submit"
                      className={en ? "boton boton-chico-alto boton-en-seguimiento" : "boton boton-chico-alto"}
                      aria-pressed={en}
                    >
                      {en ? "En seguimiento" : "Agregar a seguimiento"}
                    </button>
                  </form>
                  {o.ramo && (
                    <form action={pedirCotizacionOportunidad}>
                      <input type="hidden" name="aseguradoId" value={a.id} />
                      <input type="hidden" name="clave" value={o.clave} />
                      <input type="hidden" name="volver" value={volver} />
                      <button type="submit" className="boton-texto">
                        Pedir cotización
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section aria-labelledby="t-pol" className="panel-seccion">
          <h3 id="t-pol" className="panel-seccion-titulo">
            Pólizas ({vigentes.length})
          </h3>
          <div className="lista-polizas">
            {vigentes.map((p) => {
              const porVencer = p.vigenciaHasta !== null && diasEntre(hoy, p.vigenciaHasta) <= 30;
              return (
                <div key={p.id} className="poliza-item">
                  <div className="poliza-item-cabecera">
                    <span className="celda-fuerte">
                      {p.ramo}{" "}
                      {(p.cobertura || p.producto) && <span className="texto-suave-normal">· {p.cobertura || p.producto}</span>}
                    </span>
                    <span className={`pastilla ${porVencer ? "pastilla-ambar-fuerte" : "pastilla-verde"}`}>
                      {porVencer ? "Por vencer" : "Vigente"}
                    </span>
                  </div>
                  {(p.bien || p.sumaAsegurada !== null) && (
                    <div className="poliza-item-bien">
                      {[p.bien, p.sumaAsegurada !== null && `Suma asegurada ${pesos(p.sumaAsegurada)}`].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div className="poliza-item-pie">
                    <span>
                      {p.compania ?? "Sin compañía"}
                      {p.numero && ` · Póliza ${p.numero}`}
                    </span>
                    <span className="tabular">
                      {p.vigenciaHasta && `Vence ${fechaCorta(p.vigenciaHasta)}`}
                      {p.premio !== null
                        ? ` · Premio ${pesos(p.premio)}/año`
                        : p.prima !== null && ` · Prima ${pesos(p.prima)}/año`}
                    </span>
                  </div>
                  {p.datosCompania && p.datosCompania.length > 0 && (
                    <div className="poliza-item-pie">
                      {p.datosCompania.map((d) => `${d.etiqueta}: ${d.valor}`).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="t-cont" className="panel-seccion">
          <h3 id="t-cont" className="panel-seccion-titulo">
            Datos de contacto
          </h3>
          <dl className="datos">
            {a.contactoNombre && (
              <>
                <dt>Responsable</dt>
                <dd>{a.contactoNombre}</dd>
              </>
            )}
            <dt>Teléfono</dt>
            <dd className={contacto.telefono ? undefined : "sin-dato-rojo"}>{contacto.telefono ?? "Sin dato"}</dd>
            <dt>Email</dt>
            <dd className={contacto.email ? undefined : "sin-dato-rojo"}>{contacto.email ?? "Sin dato"}</dd>
            <dt>Dirección</dt>
            <dd className={a.domicilio ? undefined : "sin-dato-rojo"}>{a.domicilio ?? "Sin dato"}</dd>
          </dl>
        </section>

        {importacion && (
          <p className="nota-pie">
            Datos importados el {fechaCorta(diaEnArgentina(importacion.fecha))} desde {importacion.archivo}.
          </p>
        )}
      </div>
    </PanelLateral>
  );
}
