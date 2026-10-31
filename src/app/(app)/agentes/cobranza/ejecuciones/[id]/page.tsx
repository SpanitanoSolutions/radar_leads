import Link from "next/link";
import { notFound } from "next/navigation";
import { eventosDeCorrida, obtenerCorrida } from "@/agentes/cobranza/corridas";
import { Aviso } from "@/components/Aviso";
import { NOMBRE_CANAL } from "@/lib/cobranza/configuracion";
import { TEXTO_OMISION, type MotivoOmision } from "@/lib/cobranza/reglas";
import { diaYHora } from "@/lib/fechas";
import { Chip, ChipEvento, Migas } from "../../Componentes";
import { Refrescar } from "../../Refrescar";
import { ChipCorrida, duracion } from "../TablaCorridas";
import "../../../agentes.css";
import "../../cobranza.css";

export const instant = false;

const OMISION_EXTRA: Record<string, string> = {
  limite: "superaba el máximo de recibos de la corrida",
  tiempo: "se terminó el tiempo de la corrida (sigue en la próxima)",
};

export default async function Corrida({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const [{ id: textoId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(textoId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const corrida = await obtenerCorrida(id);
  if (!corrida) notFound();
  const eventos = await eventosDeCorrida(id);
  const omitidos = Object.entries(corrida.detalle.omitidos ?? {}).sort((a, b) => b[1] - a[1]);
  const enCurso = corrida.estado === "en_curso";

  return (
    <>
      <Migas items={[{ texto: "Agente de Cobranza", href: "/agentes/cobranza" }, { texto: "Ejecuciones", href: "/agentes/cobranza/ejecuciones" }, { texto: `#${corrida.id}` }]} />
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <div className="titulo-fila">
            <h1 className="titulo">Corrida del {diaYHora(corrida.iniciadaEl)}</h1>
            <ChipCorrida estado={corrida.estado} />
            {corrida.modoPrueba && <Chip texto="Modo prueba" tono="ambar" />}
          </div>
          <p className="subtitulo descripcion-agente">{enCurso ? "El agente está trabajando. Esta página se actualiza sola." : (corrida.resumen ?? "")}</p>
        </div>
        <div className="fila-acciones">
          <Link href="/agentes/cobranza" className="boton boton-mediano">
            Ver tablero
          </Link>
        </div>
      </header>
      <Aviso codigo={sp.aviso} />
      {enCurso && <Refrescar />}

      <section aria-label="Números de la corrida" className="kpis-agente cob-kpis">
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Recibos procesados</span>
          <span className="kpi-agente-valor tabular">{corrida.procesados}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Contactos</span>
          <span className="kpi-agente-valor tabular">{corrida.contactados}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Escalados</span>
          <span className="kpi-agente-valor tabular">{corrida.detalle.escalados ?? 0}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Errores</span>
          <span className={`kpi-agente-valor tabular${corrida.errores ? " texto-rojo" : ""}`}>{corrida.errores}</span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Duración · IA</span>
          <span className="kpi-agente-valor tabular">{duracion(corrida.iniciadaEl, corrida.terminadaEl)}</span>
          <span className="cob-mono cob-kpi-monto">
            {corrida.conIa ? `Con IA · US$ ${(corrida.costoIaUsd ?? 0).toFixed(4)}` : "Plantillas, sin IA"}
          </span>
        </div>
      </section>

      {(corrida.detalle.aviso || omitidos.length > 0 || (corrida.detalle.errores ?? []).length > 0) && (
        <section className="tarjeta tarjeta-padding" aria-label="Lo que no se hizo">
          {corrida.detalle.aviso && <p className="nota-caja">{corrida.detalle.aviso}</p>}
          {omitidos.length > 0 && (
            <>
              <h2 className="cob-titulo-chico">A quiénes no les escribió y por qué</h2>
              <ul className="texto-suave">
                {omitidos.map(([motivo, n]) => (
                  <li key={motivo}>
                    <span className="tabular celda-fuerte">{n}</span> {TEXTO_OMISION[motivo as MotivoOmision] ?? OMISION_EXTRA[motivo] ?? motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(corrida.detalle.errores ?? []).length > 0 && (
            <>
              <h2 className="cob-titulo-chico">Errores</h2>
              <ul className="texto-suave">
                {corrida.detalle.errores!.map((e, i) => (
                  <li key={i}>
                    {e.casoId ? <Link href={`/agentes/cobranza/${e.casoId}?tab=seguimiento`}>Caso #{e.casoId}</Link> : "Corrida"}: {e.mensaje}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="tarjeta" aria-label="Lo que hizo">
        <h2 className="titulo-tarjeta cob-titulo-seccion">Lo que hizo ({eventos.length})</h2>
        {eventos.length === 0 ? (
          <p className="vacio">{enCurso ? "Todavía nada…" : "No escribió a nadie en esta corrida."}</p>
        ) : (
          <ol className="cob-linea">
            {eventos.map((e) => (
              <li key={e.id} className="cob-evento">
                <span className="cob-evento-fecha tabular">{diaYHora(e.creadoEl)}</span>
                <div className="cob-evento-cuerpo">
                  <div className="titulo-fila">
                    <Link href={`/agentes/cobranza/${e.casoId}?tab=seguimiento`} className="celda-fuerte">
                      {e.asegurado}
                    </Link>
                    <ChipEvento tipo={e.tipo} />
                    {e.esPrueba && <Chip texto="Modo prueba" tono="ambar" />}
                    {e.canal && <span className="cob-mono cob-secundaria">{NOMBRE_CANAL[e.canal]}</span>}
                  </div>
                  <p className="cob-evento-resumen">{e.resumen}</p>
                  {typeof e.datos.texto === "string" && (
                    <details className="cob-evento-texto">
                      <summary>{typeof e.datos.para === "string" && e.datos.para ? `Mensaje · ${e.datos.para}` : "Mensaje"}</summary>
                      <p>{e.datos.texto}</p>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
