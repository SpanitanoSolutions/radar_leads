import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { PanelLateral } from "@/components/PanelLateral";
import { CONEXIONES, GRUPOS_CONEXIONES, vistaConexion } from "@/conexiones/catalogo";
import { PLANTILLAS_WHATSAPP } from "@/conexiones/whatsapp";
import { obtenerConexiones, obtenerCuenta } from "@/lib/datos";
import { ContenidoConexion, ContenidoWhatsApp, FormCuenta } from "./Paneles";
import "./configuracion.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PESTANAS = [
  { id: "conexiones", texto: "Conexiones" },
  { id: "cuenta", texto: "Mi cuenta" },
  { id: "equipo", texto: "Equipo" },
  { id: "notificaciones", texto: "Notificaciones" },
  { id: "facturacion", texto: "Facturación" },
] as const;

export default async function Configuracion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pestana = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "conexiones";
  const [filas, cuenta] = await Promise.all([obtenerConexiones(), obtenerCuenta()]);
  const fila = (clave: string) => filas.find((f) => f.clave === clave);
  const wa = fila("whatsapp");
  const waConectado = wa?.estado === "conectado";
  const panel = typeof sp.panel === "string" ? CONEXIONES.find((c) => c.clave === sp.panel) : undefined;

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Configuración</h1>
          <p className="subtitulo">
            Conectá las herramientas que usan tus agentes. Radar no guarda contraseñas y podés desconectar cualquier cuenta
            cuando quieras.
          </p>
        </div>
      </header>

      <Aviso codigo={sp.aviso} />

      <nav aria-label="Secciones de configuración" className="pestanas">
        {PESTANAS.map((p) => (
          <Link
            key={p.id}
            href={p.id === "conexiones" ? "/configuracion" : `/configuracion?tab=${p.id}`}
            aria-current={p.id === pestana ? "page" : undefined}
            className="pestana"
          >
            {p.texto}
          </Link>
        ))}
      </nav>

      {pestana === "conexiones" && (
        <>
          <p className="nota-info">
            Modo de prueba: todas las conexiones son simuladas. Los agentes preparan y registran los mensajes, pero
            todavía no sale nada hacia WhatsApp, el correo, las compañías ni los bancos.
          </p>

          {!waConectado && (
            <section className="aviso-conexion" aria-labelledby="t-wa">
              <div className="aviso-conexion-icono" aria-hidden="true">
                WA
              </div>
              <div className="aviso-conexion-texto">
                <h2 id="t-wa" className="titulo-tarjeta">
                  Conectá tu WhatsApp
                </h2>
                <p className="texto-suave">
                  Sin WhatsApp, los agentes no pueden avisar vencimientos, pedir datos para cotizar ni recibir denuncias de
                  siniestro de tus asegurados.
                </p>
              </div>
              <Link href="/configuracion?panel=whatsapp" scroll={false} className="boton boton-primario">
                Conectar WhatsApp
              </Link>
            </section>
          )}

          {GRUPOS_CONEXIONES.map((g) => (
            <section key={g.id} className="tarjeta" aria-labelledby={`grupo-${g.id}`}>
              <div className="lista-cabecera grupo-cabecera">
                <h2 id={`grupo-${g.id}`} className="lista-titulo">
                  {g.titulo}
                </h2>
                <p className="texto-suave">{g.detalle}</p>
              </div>
              {CONEXIONES.filter((c) => c.grupo === g.id).map((c) => {
                const v = vistaConexion(c, fila(c.clave));
                return (
                  <div key={c.clave} className="conexion">
                    <div className={`conexion-sigla ${v.estado === "conectado" ? "conexion-sigla-activa" : ""}`} aria-hidden="true">
                      {c.sigla}
                    </div>
                    <div className="conexion-texto">
                      <div className="titulo-fila">
                        <span className="celda-fuerte">{c.nombre}</span>
                        <span
                          className={`pastilla ${
                            v.estado === "conectado"
                              ? "pastilla-verde"
                              : v.estado === "pendiente" || v.estado === "en_proceso"
                                ? "pastilla-ambar"
                                : "pastilla-gris"
                          }`}
                        >
                          {v.estadoTexto}
                        </span>
                      </div>
                      <div className="texto-suave">{v.detalle}</div>
                      <div className="conexion-usan">
                        <span className="nota-pie">Lo usan:</span>
                        {c.usan.map((u) => (
                          <span key={u} className="etiqueta-ramo">
                            {u}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Link
                      href={`/configuracion?panel=${encodeURIComponent(c.clave)}`}
                      scroll={false}
                      className={v.primario ? "boton boton-primario boton-mediano" : "boton boton-mediano"}
                      id={`conexion-${c.clave}`}
                    >
                      {v.boton}
                      <span className="visualmente-oculto"> {c.nombre}</span>
                    </Link>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}

      {pestana === "cuenta" && <FormCuenta cuenta={cuenta} />}

      {pestana !== "conexiones" && pestana !== "cuenta" && (
        <section className="tarjeta">
          <p className="vacio">{PESTANAS.find((p) => p.id === pestana)?.texto}: próximamente.</p>
        </section>
      )}

      {panel && (
        <PanelLateral
          tituloId="panel-titulo"
          cerrarHref="/configuracion"
          volverA={`conexion-${panel.clave}`}
          ancho={520}
        >
          {panel.tipo === "whatsapp" ? (
            <ContenidoWhatsApp
              paso={wa?.estado === "conectado" ? "conectado" : wa?.estado === "en_proceso" ? "codigo" : "sin_conectar"}
              numero={String(wa?.datos.numero ?? "")}
              numeroSugerido={cuenta.telefono ?? ""}
              plantillas={PLANTILLAS_WHATSAPP}
            />
          ) : (
            <ContenidoConexion
              conexion={panel}
              conectada={fila(panel.clave)?.estado === "conectado" || Boolean(fila(panel.clave)?.datos.email)}
              porEmail={vistaConexion(panel, fila(panel.clave)).estado === "por_email"}
              datos={Object.fromEntries(Object.entries(fila(panel.clave)?.datos ?? {}).map(([k, v]) => [k, String(v ?? "")]))}
            />
          )}
        </PanelLateral>
      )}
    </>
  );
}
