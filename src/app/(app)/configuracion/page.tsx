import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { IconoConexion } from "@/components/IconoConexion";
import { PanelLateral } from "@/components/PanelLateral";
import { CONEXIONES, GRUPOS_CONEXIONES, vistaConexion } from "@/conexiones/catalogo";
import { whatsapp } from "@/conexiones/whatsapp";
import { ALCANCE_CONEXIONES } from "@/lib/conectores/companias";
import { listarCredenciales } from "@/lib/conectores/credenciales";
import { simulacionHabilitada } from "@/lib/conectores/registro";
import { obtenerConexiones, obtenerCuenta } from "@/lib/datos";
import { ContenidoConexion, ContenidoWhatsApp, FormCuenta, FormEquipo } from "./Paneles";
import "./configuracion.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PESTANAS = [
  { id: "conexiones", texto: "Conexiones" },
  { id: "cuenta", texto: "Mi cuenta" },
  { id: "equipo", texto: "Mi equipo" },
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
  const [filas, cuenta, estadoWa, credenciales] = await Promise.all([
    obtenerConexiones(),
    obtenerCuenta(),
    whatsapp.estado(),
    listarCredenciales(ALCANCE_CONEXIONES),
  ]);
  const claves = credenciales.filter((c) => c.estado === "activa").length;
  const fila = (clave: string) => {
    const original = filas.find((f) => f.clave === clave);
    if (!original) return undefined;
    const datos = Object.fromEntries(Object.entries(original.datos).filter(([nombre]) => nombre !== "credencialesCifradas"));
    const esOAuth = ["email", "google_calendar", "mercadopago"].includes(clave);
    const conectorPendiente = original.tipo === "portal" || original.tipo === "banco";
    // "en_proceso" sin token es una autorización que se cayó: se muestra con su motivo.
    const oauthSinToken = esOAuth && typeof original.datos.credencialesCifradas !== "string" && original.estado !== "en_proceso";
    const whatsappSinValidar = clave === "whatsapp" && original.datos.validadoReal !== true;
    const estado =
      conectorPendiente || oauthSinToken || whatsappSinValidar || (clave === "whatsapp" && estadoWa.paso !== "conectado")
        ? "sin_conectar"
        : original.estado;
    return { ...original, estado, datos };
  };
  const waConectado = estadoWa.paso === "conectado";
  const panel = typeof sp.panel === "string" ? CONEXIONES.find((c) => c.clave === sp.panel) : undefined;

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">{pestana === "equipo" ? "Mi equipo" : pestana === "cuenta" ? "Mi cuenta" : "Configuración"}</h1>
          <p className="subtitulo">
            {pestana === "equipo"
              ? "Administrá el nombre y el logo de tu asociación aseguradora."
              : pestana === "cuenta"
                ? "Actualizá los datos del productor que aparecen en tu perfil y firman los mensajes."
                : "Conectá las herramientas que usan tus agentes. UNIQO no guarda contraseñas y podés desconectar cualquier cuenta cuando quieras."}
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
            Las conexiones OAuth de Google y Mercado Pago y WhatsApp Cloud API requieren credenciales oficiales en el servidor. Las compañías de seguros y los bancos necesitan sus APIs y autorizaciones comerciales.
          </p>

          {!waConectado && (
            <section className="aviso-conexion" aria-labelledby="t-wa">
              <div className="aviso-conexion-icono" aria-hidden="true">
                <IconoConexion tipo="whatsapp" />
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
              {g.id === "companias" && (
                <div className="conexion">
                  <div className="conexion-icono" aria-hidden="true">
                    <IconoConexion tipo="portal" />
                  </div>
                  <div className="conexion-texto">
                    <div className="titulo-fila">
                      <span className="celda-fuerte">Conexiones con las compañías</span>
                      <span className={`pastilla ${simulacionHabilitada() ? "pastilla-ambar" : "pastilla-gris"}`}>
                        {simulacionHabilitada() ? "Simuladas para probar" : "Por correo o carga manual"}
                      </span>
                    </div>
                    <div className="texto-suave">
                      Por qué canal se conecta cada compañía, el usuario y la clave de su portal, y si la conexión anda.{" "}
                      {claves ? `Tenés ${claves === 1 ? "1 usuario y clave guardado" : `${claves} usuarios y claves guardados`}.` : "Todavía no guardaste usuarios ni claves de portales."}
                    </div>
                    <div className="conexion-usan">
                      <span className="nota-pie">Lo usan:</span>
                      {["Cotización", "Validador de pagos", "Siniestros"].map((u) => (
                        <span key={u} className="etiqueta-ramo">
                          {u}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link href="/configuracion/companias" className="boton boton-mediano" id="conexion-companias">
                    Administrar<span className="visualmente-oculto"> las conexiones con las compañías</span>
                  </Link>
                </div>
              )}
              {CONEXIONES.filter((c) => c.grupo === g.id).map((c) => {
                const v = vistaConexion(c, fila(c.clave));
                return (
                  <div key={c.clave} className="conexion">
                    <div className={`conexion-icono ${v.estado === "conectado" ? "conexion-icono-activa" : ""}`} aria-hidden="true">
                      <IconoConexion tipo={c.tipo} />
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
                    {c.tipo === "banco" ? (
                      <span className="boton boton-mediano" aria-disabled="true">{v.boton}</span>
                    ) : (
                      <Link
                        href={`/configuracion?panel=${encodeURIComponent(c.clave)}`}
                        scroll={false}
                        className={v.primario ? "boton boton-primario boton-mediano" : "boton boton-mediano"}
                        id={`conexion-${c.clave}`}
                      >
                        {v.boton}
                        <span className="visualmente-oculto"> {c.nombre}</span>
                      </Link>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}

      {pestana === "cuenta" && <FormCuenta cuenta={cuenta} />}
      {pestana === "equipo" && <FormEquipo cuenta={cuenta} />}

      {pestana !== "conexiones" && pestana !== "cuenta" && pestana !== "equipo" && (
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
              paso={estadoWa.paso}
              numero={estadoWa.paso === "conectado" ? estadoWa.numero : ""}
              numeroSugerido={cuenta.telefono ?? ""}
              plantillas={estadoWa.paso === "conectado" ? estadoWa.plantillas : []}
            />
          ) : (
            <ContenidoConexion
              conexion={panel}
              conectada={fila(panel.clave)?.estado === "conectado"}
              datos={Object.fromEntries(Object.entries(fila(panel.clave)?.datos ?? {}).map(([k, v]) => [k, String(v ?? "")]))}
            />
          )}
        </PanelLateral>
      )}
    </>
  );
}
