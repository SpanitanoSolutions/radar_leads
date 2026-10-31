import Link from "next/link";
import { listarCorridas } from "@/agentes/cobranza/corridas";
import { Aviso } from "@/components/Aviso";
import { ejecutarAhora } from "../actions";
import { Migas } from "../Componentes";
import { Refrescar } from "../Refrescar";
import { TablaCorridas } from "./TablaCorridas";
import "../../agentes.css";
import "../cobranza.css";

export const instant = false;
export const maxDuration = 300;

export default async function Ejecuciones({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sp = await searchParams;
  const corridas = await listarCorridas(100);
  return (
    <>
      <Migas items={[{ texto: "Agente de Cobranza", href: "/agentes/cobranza" }, { texto: "Ejecuciones" }]} />
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <h1 className="titulo">Ejecuciones</h1>
          <p className="subtitulo descripcion-agente">Cada vez que corrió el agente: solo (cron), con &ldquo;Ejecutar ahora&rdquo;, con &ldquo;Probar&rdquo; o desde la API.</p>
        </div>
        <div className="fila-acciones">
          <Link href="/agentes/cobranza/instrucciones" className="boton boton-mediano">
            Ver agente
          </Link>
          <form action={ejecutarAhora}>
            <input type="hidden" name="prueba" value="1" />
            <button type="submit" className="boton boton-mediano">
              Probar
            </button>
          </form>
          <form action={ejecutarAhora}>
            <input type="hidden" name="volver" value="/agentes/cobranza" />
            <button type="submit" className="boton boton-primario boton-mediano">
              Ejecutar ahora
            </button>
          </form>
        </div>
      </header>
      <Aviso codigo={sp.aviso} />
      {corridas.some((r) => r.estado === "en_curso") && <Refrescar />}
      <section className="tarjeta" aria-label="Corridas">
        <TablaCorridas corridas={corridas} />
      </section>
    </>
  );
}
