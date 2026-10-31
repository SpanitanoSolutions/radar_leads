import Link from "next/link";
import { listarClavesApi } from "@/agentes/cobranza/api";
import { Aviso } from "@/components/Aviso";
import { BASE_API, ejemploCurl, ejemploJs, ENDPOINTS, SECCIONES_API, type Endpoint } from "@/lib/cobranza/api-docs";
import { ESTADO_INFO, EVENTO_INFO } from "@/lib/cobranza/estados";
import { ESTADOS_CASO } from "@/lib/cobranza/tipos";
import { diaYHora } from "@/lib/fechas";
import { Migas } from "../Componentes";
import { revocarClave } from "./actions";
import { GenerarClave, Imprimir } from "./Claves";
import "../../agentes.css";
import "../cobranza.css";

export const instant = false;

function Codigo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <div className="cob-titulo-chico">{titulo}</div>
      <pre className="cob-prompt">{texto}</pre>
    </div>
  );
}

function Seccion({ id, titulo, children, ejemplos }: { id: string; titulo: string; children: React.ReactNode; ejemplos?: React.ReactNode }) {
  return (
    <section id={id} className="cob-api-seccion">
      <h2>{titulo}</h2>
      <div className="cob-api-dos">
        <div className="form-columna">{children}</div>
        {ejemplos && <div className="cob-api-ejemplos">{ejemplos}</div>}
      </div>
    </section>
  );
}

/** Las descripciones marcan el código con `backticks`. */
function ConCodigo({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("`").map((parte, i) =>
        i % 2 ? (
          <code key={i} className="cob-codigo-linea">
            {parte}
          </code>
        ) : (
          parte
        ),
      )}
    </>
  );
}

function Metodo({ m }: { m: Endpoint["metodo"] }) {
  return <span className={`cob-metodo cob-metodo-${m.toLowerCase()}`}>{m}</span>;
}

export default async function ApiCobranza({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sp = await searchParams;
  const base = (process.env.APP_URL || "https://www.un1qo.com").replace(/\/$/, "");
  const claves = await listarClavesApi();

  return (
    <>
      <Migas items={[{ texto: "Agente de Cobranza", href: "/agentes/cobranza" }, { texto: "API" }]} />
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <h1 className="titulo">API del Agente de Cobranza</h1>
          <p className="subtitulo descripcion-agente">Para conectar el agente con otras herramientas: leer los casos, disparar corridas y mandarle las respuestas de los asegurados.</p>
        </div>
        <div className="fila-acciones">
          <Imprimir />
        </div>
      </header>
      <Aviso codigo={sp.aviso} />

      <div className="cob-api">
        <nav aria-label="Secciones de la API" className="cob-subnav">
          {SECCIONES_API.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.texto}
            </a>
          ))}
        </nav>

        <div className="tarjeta">
          <Seccion
            id="primeros-pasos"
            titulo="Primeros pasos"
            ejemplos={<Codigo titulo="Probar la clave" texto={ejemploCurl(ENDPOINTS.find((e) => e.id === "configuracion-leer")!, base)} />}
          >
            <p>
              Todas las rutas empiezan con <code className="cob-codigo-linea">{base + BASE_API}</code>, reciben y devuelven JSON y piden una clave de la API.
            </p>
            <ol className="texto-suave">
              <li>Generá una clave acá abajo (Autenticación) y guardala en tu herramienta.</li>
              <li>Probala leyendo la configuración.</li>
              <li>Corré el agente en modo prueba con <code className="cob-codigo-linea">POST /corridas</code> y mirá el resultado en Ejecuciones.</li>
            </ol>
          </Seccion>

          <Seccion id="autenticacion" titulo="Autenticación" ejemplos={<Codigo titulo="Encabezado" texto={"Authorization: Bearer uniqo_…"} />}>
            <p>Cada pedido lleva la clave en el encabezado <code className="cob-codigo-linea">Authorization</code>. La clave se muestra una sola vez; en UNIQO queda solo su huella. Si se filtra, revocala y generá otra.</p>
            <GenerarClave />
            {claves.length > 0 && (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Clave</th>
                      <th scope="col">Creada</th>
                      <th scope="col">Último uso</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {claves.map((c) => (
                      <tr key={c.id}>
                        <td>{c.nombre}</td>
                        <td className="cob-codigo-linea">{c.prefijo}…</td>
                        <td className="tabular">{diaYHora(c.creadaEl)}</td>
                        <td className="tabular">{c.ultimoUsoEl ? diaYHora(c.ultimoUsoEl) : "Nunca"}</td>
                        <td>
                          <form action={revocarClave}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="boton-terciario">
                              Revocar
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>

          <Seccion id="errores" titulo="Errores" ejemplos={<Codigo titulo="409" texto={JSON.stringify({ error: { codigo: "corrida_en_curso", mensaje: "Ya hay una corrida en curso (42)." } }, null, 2)} />}>
            <p>Los errores vuelven como <code className="cob-codigo-linea">{"{ error: { codigo, mensaje } }"}</code>:</p>
            <ul className="texto-suave">
              <li>
                <strong>400</strong> datos inválidos o JSON mal formado.
              </li>
              <li>
                <strong>401</strong> falta la clave, no existe o fue revocada.
              </li>
              <li>
                <strong>403</strong> la clave no tiene permiso, o el agente está desactivado y la corrida sería real.
              </li>
              <li>
                <strong>404</strong> no existe (o el mensaje entrante no corresponde a un recibo abierto).
              </li>
              <li>
                <strong>409</strong> ya hay una corrida en curso, el caso ya está pagado o no se puede reactivar.
              </li>
              <li>
                <strong>500</strong> error inesperado: probá de nuevo en un rato.
              </li>
            </ul>
          </Seccion>

          <Seccion id="paginacion" titulo="Paginación" ejemplos={<Codigo titulo="Respuesta" texto={JSON.stringify({ datos: ["…"], pagina: 2, porPagina: 50, total: 113 }, null, 2)} />}>
            <p>
              Las listas aceptan <code className="cob-codigo-linea">pagina</code> (desde 1) y <code className="cob-codigo-linea">porPagina</code> (hasta 100, 50 por defecto) y devuelven <code className="cob-codigo-linea">total</code>.
            </p>
          </Seccion>

          <Seccion id="actividad" titulo="Actividad" ejemplos={<Codigo titulo="Un evento" texto={JSON.stringify({ tipo: "promesa", canal: null, resumen: "Prometió pagar el 07/11.", esPrueba: false, creadoEl: "2026-11-02T13:05:00.000Z" }, null, 2)} />}>
            <p>Todo lo que pasa en un caso (intentos, respuestas, promesas, escalados, errores) queda en su actividad: es la línea de tiempo del detalle y sale en <code className="cob-codigo-linea">GET /casos/:id</code>. Tipos:</p>
            <p className="texto-suave cob-mono">{Object.keys(EVENTO_INFO).join(" · ")}</p>
          </Seccion>

          {(["configuracion", "corridas", "casos", "universo", "entrantes"] as const).map((seccion) => (
            <div key={seccion} id={seccion}>
              {ENDPOINTS.filter((e) => e.seccion === seccion).map((e) => (
                <Seccion
                  key={e.id}
                  id={e.id}
                  titulo={e.titulo}
                  ejemplos={
                    <>
                      <Codigo titulo="cURL" texto={ejemploCurl(e, base)} />
                      <Codigo titulo="JavaScript" texto={ejemploJs(e, base)} />
                      <Codigo titulo="Respuesta" texto={JSON.stringify(e.respuesta, null, 2)} />
                    </>
                  }
                >
                  <p>
                    <Metodo m={e.metodo} />
                    <code className="cob-codigo-linea">{BASE_API + e.ruta}</code>
                  </p>
                  <p className="texto-suave">
                    <ConCodigo texto={e.descripcion} />
                  </p>
                  {e.parametros && (
                    <ul className="texto-suave">
                      {e.parametros.map(([nombre, tipo, d]) => (
                        <li key={nombre}>
                          <code className="cob-codigo-linea">{nombre}</code> ({tipo}): {d}
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.cuerpo && <pre className="cob-prompt">{JSON.stringify(e.cuerpo, null, 2)}</pre>}
                </Seccion>
              ))}
            </div>
          ))}

          <Seccion id="esquemas" titulo="Esquemas">
            <p>
              <strong>Estados del caso:</strong>
            </p>
            <ul className="texto-suave">
              {ESTADOS_CASO.map((e) => (
                <li key={e}>
                  <code className="cob-codigo-linea">{e}</code>: {ESTADO_INFO[e].descripcion}
                </li>
              ))}
            </ul>
            <p className="texto-suave">
              Un caso es un cobro: las cuotas del mismo asegurado, compañía y vencimiento. <code className="cob-codigo-linea">monto</code> suma las cuotas que la compañía no anuló; <code className="cob-codigo-linea">diasParaVencer</code> es negativo si está vencido; <code className="cob-codigo-linea">tramo</code> sale de la configuración. La configuración completa está en{" "}
              <Link href="/agentes/cobranza/configuracion">Configuración</Link>.
            </p>
          </Seccion>
        </div>
      </div>
    </>
  );
}
