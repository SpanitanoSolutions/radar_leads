import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { IconoAtras, IconoTelefono } from "@/components/iconos";
import {
  contactoDe,
  enlaceLlamada,
  esVigente,
  gruposDeVencimiento,
  iniciales,
  resumirAsegurado,
  tipoDocumento,
  tonoDias,
  unirConY,
} from "@/lib/asegurados";
import { enlaceWhatsApp } from "@/lib/contacto";
import { obtenerFichaAsegurado } from "@/lib/datos-cartera";
import { diaEnArgentina, diasEntre, fechaCorta } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { oportunidadesDe } from "@/lib/oportunidades";
import { nombreEtapa } from "@/lib/siniestros";
import { avisarVencimiento, guardarNota, prepararRenovacion, subirDocumento } from "../actions";
import { FormAsegurado } from "../FormAsegurado";
import "../asegurados.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PESTANAS = ["polizas", "siniestros", "notas", "documentos"] as const;
type Pestana = (typeof PESTANAS)[number];

export default async function FichaAsegurado({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const ficha = await obtenerFichaAsegurado(id);
  if (!ficha) notFound();
  const { asegurado: a, siniestros, notas, documentos } = ficha;
  const pestana: Pestana = PESTANAS.includes(sp.tab as Pestana) ? (sp.tab as Pestana) : "polizas";
  const base = `/asegurados/${id}`;

  if (sp.editar === "1") {
    return (
      <>
        <nav aria-label="Ruta" className="ruta">
          <Link href={base} className="volver">
            <IconoAtras />
            {a.nombre}
          </Link>
        </nav>
        <header className="encabezado">
          <h1 className="titulo">Editar asegurado</h1>
        </header>
        <FormAsegurado asegurado={a} cancelarHref={base} />
      </>
    );
  }

  const hoy = diaEnArgentina(new Date());
  const fila = resumirAsegurado(a, hoy);
  const vigentes = a.polizas.filter((p) => esVigente(p, hoy));
  const contacto = contactoDe(a);
  const [proximo] = gruposDeVencimiento(a.polizas, hoy, 1);
  const oportunidades = oportunidadesDe({ tipo: a.tipo, ...contacto, polizas: vigentes }, Number(hoy.slice(0, 4)));
  const whatsapp = contacto.telefono ? enlaceWhatsApp(contacto.telefono) : null;
  const companiasProximo = proximo ? [...new Set(proximo.polizas.map((p) => p.compania).filter((c): c is string => Boolean(c)))] : [];
  const volver = `${base}?tab=${pestana}`;

  const etiquetas: Record<Pestana, string> = {
    polizas: `Pólizas (${a.polizas.length})`,
    siniestros: `Siniestros (${siniestros.length})`,
    notas: `Notas y actividad (${notas.length})`,
    documentos: documentos.length ? `Documentos (${documentos.length})` : "Documentos",
  };

  return (
    <>
      <nav aria-label="Ruta" className="ruta">
        <Link href="/asegurados" className="volver">
          <IconoAtras />
          Asegurados
        </Link>
        <span aria-hidden="true" className="ruta-separador">
          /
        </span>
        <span className="ruta-actual">{a.nombre}</span>
      </nav>

      <Aviso codigo={sp.aviso} />

      <section className="tarjeta ficha-cabecera">
        <div className="ficha-identidad">
          <div className="avatar avatar-grande" aria-hidden="true">
            {iniciales(a.nombre)}
          </div>
          <div className="ficha-identidad-texto">
            <div className="titulo-fila">
              <h1 className="titulo titulo-ficha">{a.nombre}</h1>
              {a.esEjemplo && <span className="pastilla pastilla-ambar">Ejemplo</span>}
            </div>
            <div className="ficha-meta">
              <span>{a.tipo === "empresa" ? "Empresa" : "Persona"}</span>
              {a.documento && (
                <span>
                  {tipoDocumento(a)} {a.documento}
                </span>
              )}
              {a.localidad && <span>{a.localidad}</span>}
              {a.clienteDesde && <span>Cliente desde {a.clienteDesde}</span>}
            </div>
            <div className="ficha-chips">
              <span className="pastilla pastilla-gris">{vigentes.length === 1 ? "1 póliza" : `${vigentes.length} pólizas`}</span>
              <span className="pastilla pastilla-gris">Prima anual {pesos(fila.prima)}</span>
              {proximo && proximo.dias <= 30 && (
                <span className="pastilla pastilla-ambar-fuerte">
                  {proximo.polizas.length === 1 ? "1 póliza vence" : `${proximo.polizas.length} pólizas vencen`} en {proximo.dias}{" "}
                  días
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="fila-acciones">
          {contacto.telefono && (
            <a href={enlaceLlamada(contacto.telefono)} className="boton boton-primario">
              <IconoTelefono />
              Llamar
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="boton">
              WhatsApp
            </a>
          )}
          {contacto.email && (
            <a href={`mailto:${contacto.email}`} className="boton">
              Email
            </a>
          )}
          <Link href={`${base}?editar=1`} className="boton">
            Editar
          </Link>
        </div>
      </section>

      <div className="ficha-tarjetas">
        <section aria-labelledby="t-venc" className="tarjeta tarjeta-compacta">
          <h2 id="t-venc" className="titulo-tarjeta">
            Próximo vencimiento
          </h2>
          {proximo ? (
            <>
              <div className="proximo-fecha">
                <span className="tabular">{fechaCorta(proximo.fecha)}</span>
                <span className={`alerta alerta-${tonoDias(proximo.dias)}`}>
                  en {proximo.dias} días
                </span>
              </div>
              <p className="texto-suave">
                {proximo.polizas.length === 1 ? "1 póliza" : `${proximo.polizas.length} pólizas`}
                {companiasProximo.length ? ` de ${unirConY(companiasProximo)}` : ""} · {pesos(proximo.total)} anuales.
              </p>
              <div className="fila-acciones al-pie">
                <form action={prepararRenovacion}>
                  <input type="hidden" name="aseguradoId" value={a.id} />
                  <input type="hidden" name="fecha" value={proximo.fecha} />
                  <input type="hidden" name="volver" value={volver} />
                  <button type="submit" className="boton boton-primario boton-mediano">
                    Preparar renovación
                  </button>
                </form>
                {(contacto.telefono || contacto.email) && (
                  <form action={avisarVencimiento}>
                    <input type="hidden" name="aseguradoId" value={a.id} />
                    <input type="hidden" name="volver" value={volver} />
                    <button type="submit" className="boton boton-mediano">
                      {contacto.telefono ? "Avisar por WhatsApp" : "Avisar por email"}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <p className="texto-suave">No tiene pólizas vigentes con fecha de vencimiento.</p>
          )}
        </section>

        <section aria-labelledby="t-opor" className="tarjeta tarjeta-compacta">
          <div className="titulo-con-contador entre">
            <h2 id="t-opor" className="titulo-tarjeta">
              Oportunidades con este cliente
            </h2>
            <span className="contador-azul">{oportunidades.length}</span>
          </div>
          {oportunidades.length === 0 && <p className="texto-suave">Su cobertura está completa para lo que tiene asegurado.</p>}
          <div className="lista-oportunidades">
            {oportunidades.map((o) => (
              <div key={o.clave} className="oportunidad-chica">
                <div className="celda-fuerte">{o.titulo}</div>
                <div className="texto-suave">{o.detalle}</div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="t-contacto" className="tarjeta tarjeta-compacta">
          <h2 id="t-contacto" className="titulo-tarjeta">
            Contacto
          </h2>
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
            <dd className={a.domicilio ? undefined : "sin-dato-rojo"}>
              {[a.domicilio, a.localidad && a.domicilio !== a.localidad ? a.localidad : null].filter(Boolean).join(", ") ||
                "Sin dato"}
            </dd>
          </dl>
          {(!contacto.telefono || !contacto.email) && (
            <Link href={`${base}?editar=1`} className="boton-texto">
              Completar contacto
            </Link>
          )}
        </section>
      </div>

      <section className="tarjeta">
        <nav aria-label="Información del asegurado" className="pestanas pestanas-ficha">
          {PESTANAS.map((p) => (
            <Link key={p} href={`${base}?tab=${p}`} scroll={false} aria-current={p === pestana ? "page" : undefined} className="pestana">
              {etiquetas[p]}
            </Link>
          ))}
        </nav>

        {pestana === "polizas" && (
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta">
              <thead>
                <tr>
                  <th scope="col">Ramo</th>
                  <th scope="col">Compañía</th>
                  <th scope="col">N° de póliza</th>
                  <th scope="col">Bien asegurado</th>
                  <th scope="col">Vence</th>
                  <th scope="col" className="numero">
                    Prima anual
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {a.polizas.map((p) => {
                  const dias = p.vigenciaHasta ? diasEntre(hoy, p.vigenciaHasta) : null;
                  const estado = dias === null ? "Vigente" : dias < 0 ? "Vencida" : dias <= 30 ? "Por vencer" : "Vigente";
                  const clase = estado === "Vencida" ? "pastilla-gris" : estado === "Por vencer" ? "pastilla-ambar-fuerte" : "pastilla-verde";
                  return (
                    <tr key={p.id}>
                      <td className="celda-fuerte">{p.ramo}</td>
                      <td>{p.compania ?? "—"}</td>
                      <td className="tabular">{p.numero ?? "—"}</td>
                      <td>{[p.bien, p.cobertura].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="tabular">{p.vigenciaHasta ? fechaCorta(p.vigenciaHasta) : "—"}</td>
                      <td className="numero tabular">{p.prima !== null ? pesos(p.prima) : "—"}</td>
                      <td>
                        <span className={`pastilla ${clase}`}>{estado}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {a.polizas.length === 0 && <p className="vacio">No tiene pólizas cargadas. Sumalas importando la planilla.</p>}
          </div>
        )}

        {pestana === "siniestros" && (
          <div className="tabla-scroll">
            <table className="tabla tabla-compacta">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Póliza</th>
                  <th scope="col">Detalle</th>
                  <th scope="col">Compañía</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="numero">
                    Pagado
                  </th>
                </tr>
              </thead>
              <tbody>
                {siniestros.map((s) => {
                  const p = a.polizas.find((x) => x.id === s.polizaId);
                  return (
                    <tr key={s.id}>
                      <td className="tabular">{fechaCorta(diaEnArgentina(s.fecha))}</td>
                      <td>{[p?.ramo, p?.bien?.split(" · ").at(-1)].filter(Boolean).join(" · ")}</td>
                      <td>
                        <Link href={`/agentes/siniestros?ver=${s.id}${s.cerrado ? "&tab=cerrados" : ""}`}>{s.descripcion}</Link>
                      </td>
                      <td>{p?.compania ?? "—"}</td>
                      <td>
                        <span className={`pastilla ${s.cerrado ? "pastilla-verde" : "pastilla-azul"}`}>
                          {s.cerrado ? "Cerrado" : nombreEtapa(s.etapa)}
                        </span>
                      </td>
                      <td className="numero tabular">{s.montoPagado !== null ? pesos(s.montoPagado) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {siniestros.length === 0 && <p className="vacio">No tiene siniestros registrados.</p>}
          </div>
        )}

        {pestana === "notas" && (
          <div className="tarjeta-padding">
            <form action={guardarNota} className="form-columna">
              <input type="hidden" name="aseguradoId" value={a.id} />
              <input type="hidden" name="volver" value={volver} />
              <label htmlFor="nueva-nota" className="etiqueta">
                Nueva nota
              </label>
              <textarea
                id="nueva-nota"
                name="texto"
                rows={3}
                className="campo"
                placeholder="Ej.: quiere cotizar Integral para el depósito nuevo"
                required
              />
              <button type="submit" className="boton boton-primario boton-mediano alinear-inicio">
                Guardar nota
              </button>
            </form>
            <ol className="lista-notas">
              {notas.map((n) => (
                <li key={n.id}>
                  <span className="nota-fecha tabular">{fechaCorta(diaEnArgentina(n.fecha))}</span>
                  <span>{n.tipo === "nota" ? `Nota: ${n.texto}` : n.texto}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {pestana === "documentos" && (
          <div className="tarjeta-padding">
            {documentos.length === 0 ? (
              <p className="texto-suave centrado">Todavía no hay documentos. Subí pólizas, certificados o fotos del vehículo.</p>
            ) : (
              <ul className="lista-documentos">
                {documentos.map((d) => (
                  <li key={d.id}>
                    <a href={`/archivos/${d.archivoId}`} download>
                      {d.nombre}
                    </a>
                    <span className="texto-suave">
                      {Math.max(1, Math.round(d.tamano / 1024))} KB · {fechaCorta(diaEnArgentina(d.subidoEl))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={subirDocumento} className="form-fila centrado">
              <input type="hidden" name="aseguradoId" value={a.id} />
              <input type="hidden" name="volver" value={`${base}?tab=documentos`} />
              <label htmlFor="archivo-doc" className="visualmente-oculto">
                Documento
              </label>
              <input id="archivo-doc" type="file" name="archivo" className="campo campo-archivo" required />
              <button type="submit" className="boton boton-mediano">
                Subir documento
              </button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
