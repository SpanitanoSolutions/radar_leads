import Link from "next/link";
import type { CobranzaCorrida } from "@/db/schema";
import { diaYHora } from "@/lib/fechas";
import { Chip } from "../Componentes";

const ORIGEN = { cron: "Automática", manual: "Ejecutar ahora", api: "API", prueba: "Probar" } as const;
const ESTADO = {
  en_curso: { texto: "En curso", tono: "azul" },
  ok: { texto: "Ok", tono: "verde" },
  con_errores: { texto: "Con errores", tono: "ambar" },
  error: { texto: "Falló", tono: "rojo" },
} as const;

export function duracion(desde: Date, hasta: Date | null): string {
  if (!hasta) return "—";
  const s = Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function ChipCorrida({ estado }: { estado: CobranzaCorrida["estado"] }) {
  return <Chip texto={ESTADO[estado].texto} tono={ESTADO[estado].tono} />;
}

/** Inicio, duración, recibos procesados, contactos, errores y si fue en modo prueba (spec 5). */
export function TablaCorridas({ corridas }: { corridas: CobranzaCorrida[] }) {
  if (!corridas.length) return <p className="vacio">Todavía no corrió nunca. Probalo con &ldquo;Ejecutar ahora&rdquo; o &ldquo;Probar&rdquo;.</p>;
  return (
    <div className="tabla-scroll">
      <table className="tabla cob-tabla">
        <thead>
          <tr>
            <th scope="col">Inicio</th>
            <th scope="col">Origen</th>
            <th scope="col">Estado</th>
            <th scope="col">Duración</th>
            <th scope="col" className="numero">
              Recibos
            </th>
            <th scope="col" className="numero">
              Contactos
            </th>
            <th scope="col" className="numero">
              Errores
            </th>
            <th scope="col">Modo prueba</th>
            <th scope="col">Resumen</th>
          </tr>
        </thead>
        <tbody>
          {corridas.map((r) => (
            <tr key={r.id} className="cob-fila">
              <td className="tabular">
                <Link href={`/agentes/cobranza/ejecuciones/${r.id}`} className="cob-fila-enlace celda-fuerte">
                  {diaYHora(r.iniciadaEl)}
                </Link>
                <div className="cob-mono cob-secundaria">#{r.id}</div>
              </td>
              <td>{ORIGEN[r.origen]}</td>
              <td>
                <ChipCorrida estado={r.estado} />
              </td>
              <td className="tabular">{duracion(r.iniciadaEl, r.terminadaEl)}</td>
              <td className="numero tabular">{r.procesados}</td>
              <td className="numero tabular">{r.contactados}</td>
              <td className={`numero tabular${r.errores ? " texto-rojo" : ""}`}>{r.errores}</td>
              <td>{r.modoPrueba ? <Chip texto="Sí" tono="ambar" /> : "No"}</td>
              <td className="texto-suave">{r.resumen ?? "…"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
