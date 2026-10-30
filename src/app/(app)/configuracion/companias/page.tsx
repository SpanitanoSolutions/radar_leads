import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { IconoConexion } from "@/components/IconoConexion";
import { db, schema } from "@/db";
import { ORDEN_CANALES } from "@/lib/conectores/canales";
import { ALCANCE_CONEXIONES, conexionesGuardadas } from "@/lib/conectores/companias";
import { listarCredenciales } from "@/lib/conectores/credenciales";
import { registroConectores } from "@/lib/conectores/registro";
import type { CodigoErrorConector } from "@/lib/conectores/tipos";
import {
  AGENTES_CONECTORES,
  agenteDe,
  canalesEnUso,
  capacidadesDelAgente,
  listaCompanias,
  modoDeCanales,
  resumenCompania,
  TEXTO_ERROR,
  TITULO_CANAL,
  type AgenteConector,
} from "@/lib/conectores/vista";
import { obtenerNombresCompanias, obtenerPlantillasListado } from "@/lib/datos-validador";
import { COMPANIAS, companiaCanonica } from "@/lib/importacion";
import { FormOrdenCanales, PlantillaDeImportacion, SeccionCredenciales, TablaCanales, TablaCapacidades, urlCompanias, type Ubicacion } from "./Secciones";
import "../configuracion.css";
import "./companias.css";

// Configuración → Conexiones con las compañías ("Pantalla común" de
// docs/specs/conectores.md). La misma para los tres agentes: con ?agente=
// muestra solo lo de ese agente.

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const unico = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : "");

/** Cómo se nombra cada agente en una frase: "la configuración del Validador de pagos". */
const NOMBRE_EN_FRASE: Record<AgenteConector, { de: string; para: string }> = {
  cotizacion: { de: "de Cotización", para: "para Cotización" },
  validador: { de: "del Validador de pagos", para: "para el Validador de pagos" },
  siniestros: { de: "de Siniestros", para: "para Siniestros" },
};

/** "portal:ok" o "portal:credencial_vencida" → lo que dio "Probar conexión". */
function leerPrueba(valor: string) {
  const [canal, resultado] = valor.split(":");
  const tipo = ORDEN_CANALES.find((c) => c === canal);
  if (!tipo || !resultado) return null;
  if (resultado === "ok") return { canal: tipo, ok: true as const };
  return resultado in TEXTO_ERROR ? { canal: tipo, ok: false as const, codigo: resultado as CodigoErrorConector } : null;
}

export default async function ConexionesCompanias({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const agente = agenteDe(unico(sp.agente));
  const [{ canales, salud }, credenciales, cartera, aseguradoras, plantillas] = await Promise.all([
    conexionesGuardadas(ALCANCE_CONEXIONES),
    listarCredenciales(ALCANCE_CONEXIONES),
    obtenerNombresCompanias(),
    db.select({ nombre: schema.cotizacionAseguradoras.nombre, contactos: schema.cotizacionAseguradoras.contactos, activa: schema.cotizacionAseguradoras.activa }).from(schema.cotizacionAseguradoras),
    obtenerPlantillasListado(),
  ]);

  const nombres = listaCompanias(COMPANIAS, cartera, aseguradoras.map((a) => a.nombre), credenciales.map((c) => c.compania), canales.map((c) => c.compania));
  const de = <T extends { compania: string }>(filas: T[], nombre: string) => filas.filter((f) => companiaCanonica(f.compania) === nombre);
  const vistaDe = (nombre: string) => {
    const conectores = registroConectores.conectoresPara(nombre).map((c) => ({ tipo: c.tipo, capacidades: c.capacidades }));
    const modo = modoDeCanales(canales.find((c) => c.compania === nombre)?.canales);
    const suya = de(salud, nombre);
    return { conectores, modo, salud: suya, resumen: resumenCompania({ modo, conectores, salud: suya, agente }) };
  };

  const pedida = companiaCanonica(unico(sp.cia));
  const seleccionada = nombres.includes(pedida) ? pedida : (nombres.find((n) => de(credenciales, n).length) ?? nombres[0]);
  const u: Ubicacion = { compania: seleccionada, agente };
  const vista = vistaDe(seleccionada);
  const suyas = capacidadesDelAgente(agente);
  const conectoresDelAgente = vista.conectores.filter((c) => c.capacidades.some((cap) => suyas.includes(cap)));
  const enUso = canalesEnUso(vista.modo, conectoresDelAgente.map((c) => c.tipo));
  const agentes = AGENTES_CONECTORES.filter((a) => !agente || a.id === agente);
  const credencialesSuyas = de(credenciales, seleccionada);
  const prueba = leerPrueba(unico(sp.prueba));
  const deCotizacion = aseguradoras.filter((a) => companiaCanonica(a.nombre) === seleccionada);
  const volver = agente ? AGENTES_CONECTORES.find((a) => a.id === agente)! : null;

  return (
    <>
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          {volver ? (
            <Link href={`/agentes/${volver.id}/configuracion`} className="volver">
              ← Volver a la configuración {NOMBRE_EN_FRASE[volver.id].de}
            </Link>
          ) : (
            <Link href="/configuracion" className="volver">
              ← Configuración
            </Link>
          )}
          <h1 className="titulo">Conexiones con las compañías</h1>
          <p className="subtitulo">
            Cómo se conecta UNIQO con cada compañía: por qué canal, con qué usuario y clave, y si la conexión anda. Es la misma para los tres agentes.
          </p>
        </div>
      </header>

      <Aviso codigo={sp.aviso} />
      {prueba && (
        <p className={`aviso aviso-${prueba.ok ? "ok" : "error"}`} role={prueba.ok ? "status" : "alert"}>
          {prueba.ok
            ? `${TITULO_CANAL[prueba.canal]} de ${seleccionada}: respondió bien.`
            : `${TITULO_CANAL[prueba.canal]} de ${seleccionada}: ${TEXTO_ERROR[prueba.codigo]}.${prueba.codigo === "credencial_vencida" ? " Cambiá la contraseña y volvé a probar: mientras tanto los agentes no lo usan." : ""}`}
        </p>
      )}

      <nav aria-label="Agentes" className="chips cias-agentes">
        {[{ id: null, nombre: "Todos los agentes" }, ...AGENTES_CONECTORES].map((a) => (
          <Link key={a.id ?? "todos"} href={urlCompanias({ compania: seleccionada, agente: a.id })} scroll={false} className="chip" aria-current={a.id === agente ? "true" : undefined}>
            {a.nombre}
          </Link>
        ))}
      </nav>

      <div className="cias">
        <nav aria-label="Compañías" className="tarjeta cias-lista">
          <div className="lista-cabecera">
            <span className="lista-titulo">Compañías</span>
            <span className="contador-gris">{nombres.length}</span>
          </div>
          <ul>
            {nombres.map((nombre) => {
              const r = nombre === seleccionada ? vista.resumen : vistaDe(nombre).resumen;
              return (
                <li key={nombre}>
                  <Link href={urlCompanias({ compania: nombre, agente })} aria-current={nombre === seleccionada ? "page" : undefined} className="cias-item">
                    <span className={`cias-punto cias-punto-${r.tono}`}>
                      {nombre}
                      <span className="visualmente-oculto">: {r.texto}</span>
                    </span>
                    <span className="texto-suave tabular">{de(credenciales, nombre).length || ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-labelledby="t-compania" className="tarjeta tarjeta-padding cias-detalle">
          <div className="cias-encabezado">
            <div className="conexion-icono" aria-hidden="true">
              <IconoConexion tipo="portal" compania={seleccionada} />
            </div>
            <h2 id="t-compania" className="titulo-seccion">
              {seleccionada}
            </h2>
            <span className={`pastilla pastilla-${vista.resumen.tono}`}>{vista.resumen.texto}</span>
          </div>

          <section aria-labelledby="t-canales" className="cias-bloque">
            <h3 id="t-canales" className="titulo-tarjeta">
              Cómo se conecta
            </h3>
            {conectoresDelAgente.length ? (
              <>
                <TablaCanales u={u} conectores={conectoresDelAgente} enUso={enUso} salud={vista.salud} />
                <TablaCapacidades agentes={agentes} conectores={conectoresDelAgente} />
              </>
            ) : (
              <>
                <p className="texto-suave">Todavía no hay conexión automática con {seleccionada}{agente ? ` ${NOMBRE_EN_FRASE[agente].para}` : ""}. Mientras tanto:</p>
                <ul className="cias-sin-conexion">
                  {agentes.map((a) => (
                    <li key={a.id}>
                      <span className="celda-fuerte">{a.nombre}:</span> {a.sinConexion}.
                    </li>
                  ))}
                </ul>
                <p className="nota-pie">Cuando la compañía se conecte, acá vas a ver sus canales, qué puede hacer cada agente y si la conexión anda.</p>
              </>
            )}
          </section>

          <section aria-labelledby="t-orden" className="cias-bloque">
            <h3 id="t-orden" className="titulo-tarjeta">
              Orden de los canales
            </h3>
            <FormOrdenCanales u={u} modo={vista.modo} />
          </section>

          <section aria-labelledby="t-credenciales" className="cias-bloque">
            <h3 id="t-credenciales" className="titulo-tarjeta">
              Usuario y clave del portal
            </h3>
            <p className="nota-pie">
              Las contraseñas se guardan cifradas y no se vuelven a mostrar. Son las mismas para los tres agentes.
              {vista.conectores.some((c) => c.tipo === "portal") ? "" : ` Todavía no hay conexión con el portal de ${seleccionada}: por ahora solo quedan guardadas.`}
            </p>
            <SeccionCredenciales u={u} credenciales={credencialesSuyas} editando={Number(unico(sp.editar)) || null} />
          </section>

          {(!agente || agente === "cotizacion") && (
            <section aria-labelledby="t-cotizacion" className="cias-bloque">
              <h3 id="t-cotizacion" className="titulo-tarjeta">
                Correo para cotizar
              </h3>
              {deCotizacion.length ? (
                deCotizacion.map((a) => {
                  const correos = a.contactos.map((c) => c.email).filter(Boolean);
                  return (
                    <p key={a.nombre} className="texto-suave">
                      {deCotizacion.length > 1 && <span className="celda-fuerte">{a.nombre}{a.activa ? "" : " (desactivada)"}: </span>}
                      {correos.length
                        ? `Si no hay conexión automática, Cotización prepara el correo a ${correos.join(", ")} para que lo apruebes.`
                        : "Falta el correo de contacto: sin él, Cotización no puede pedirle cotizaciones por correo."}
                    </p>
                  );
                })
              ) : (
                <p className="texto-suave">{seleccionada} no está entre las aseguradoras de Cotización.</p>
              )}
              <Link href="/agentes/cotizacion/configuracion" className="boton-texto">
                Aseguradoras y contactos en la configuración de Cotización
              </Link>
            </section>
          )}

          {(!agente || agente === "validador") && (
            <section aria-labelledby="t-plantilla" className="cias-bloque">
              <h3 id="t-plantilla" className="titulo-tarjeta">
                Plantilla de los listados del Validador
              </h3>
              <PlantillaDeImportacion
                u={u}
                plantillas={plantillas.filter((p) => companiaCanonica(p.compania) === seleccionada && p.orgId === null && p.producerId === null)}
              />
            </section>
          )}
        </section>
      </div>
    </>
  );
}
