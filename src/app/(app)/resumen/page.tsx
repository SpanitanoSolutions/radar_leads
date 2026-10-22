import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BotonCopiar } from "@/components/BotonCopiar";
import { enlaceTelefono } from "@/lib/contacto";
import { diaYMes, fechaLarga, haceCuanto } from "@/lib/fechas";
import { resumenDeHoy, FUENTE_RESUMEN } from "@/resumen";
import { canalesDisponibles } from "@/resumen/canales";
import type { ItemResumen } from "@/resumen/armar";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function ResumenDelDia() {
  const resumen = await resumenDeHoy();
  const canales = canalesDisponibles();
  const [ultimoEnvio] = await db.select().from(schema.capturas).where(eq(schema.capturas.fuente, FUENTE_RESUMEN));

  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Resumen del día</h1>
          <p className="subtitulo">
            {fechaLarga()} · {canales.length ? `Se envía a las 8 por ${canales.map((c) => c.nombre).join(", ")}` : "Se arma cada mañana a las 8"}
          </p>
        </div>
      </header>

      {!canales.length && (
        <p className="nota-info">
          Para recibirlo por email, cargá RESEND_API_KEY y RESUMEN_EMAIL_DESTINO en Vercel. Mientras tanto, queda acá.
        </p>
      )}
      {ultimoEnvio && (
        <p className="nota-info">
          Último resumen: {haceCuanto(ultimoEnvio.ejecutadoEl).toLowerCase()}
          {ultimoEnvio.error ? ` · No se pudo enviar: ${ultimoEnvio.error}` : ""}.
        </p>
      )}

      <section className="tarjeta tarjeta-padding" aria-labelledby="t-mejores">
        <h2 id="t-mejores" className="titulo-seccion">
          Los mejores para llamar hoy
        </h2>
        {resumen.mejores.length ? (
          resumen.mejores.map((i) => <Tarjeta key={i.id} item={i} />)
        ) : (
          <p className="vacio">No hay leads nuevos sin contactar.</p>
        )}
      </section>

      <section className="tarjeta tarjeta-padding" aria-labelledby="t-recordatorios">
        <h2 id="t-recordatorios" className="titulo-seccion">
          Recordatorios
        </h2>
        {resumen.recordatorios.length ? (
          resumen.recordatorios.map((r) => (
            <Tarjeta
              key={r.id}
              item={r}
              extra={
                <span className={`pastilla ${r.vencido ? "pastilla-ambar" : "pastilla-azul"}`}>
                  {r.vencido ? `Vencido: era para el ${diaYMes(r.fecha)}` : "Para hoy"}
                </span>
              }
              nota={r.nota}
            />
          ))
        ) : (
          <p className="vacio">No hay recordatorios para hoy.</p>
        )}
      </section>
    </>
  );
}

function Tarjeta({ item, extra, nota }: { item: ItemResumen; extra?: React.ReactNode; nota?: string | null }) {
  return (
    <article className="item-resumen">
      <div className="titulo-fila">
        <Link href={`/leads/${item.id}`} className="celda-principal">
          {item.empresa}
        </Link>
        <span className="pastilla pastilla-gris">score {item.score}</span>
        {item.nuevoHoy && <span className="pastilla pastilla-azul">Nuevo</span>}
        {extra}
      </div>
      <div>
        {item.motivo}
        {item.cuando && <span className="celda-secundaria"> · {item.cuando}</span>}
      </div>
      <div className="celda-secundaria">
        {item.localidad}
        {item.telefono && (
          <>
            {" · "}
            <a href={enlaceTelefono(item.telefono)}>{item.telefono}</a>
          </>
        )}
        {nota && ` · Nota: ${nota}`}
      </div>
      <p className="guion">{item.guion}</p>
      <BotonCopiar texto={item.guion} />
    </article>
  );
}
