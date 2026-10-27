import { activarAgente, desactivarAgente } from "@/app/(app)/agentes/acciones";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";

/** Título del agente, si está activo y qué hace. Si está apagado, ofrece activarlo. */
export function EncabezadoAgente({
  agente,
  titulo,
  descripcion,
  activo,
  estado = "Activo",
  extra,
  children,
}: {
  agente: string;
  titulo: string;
  descripcion: string;
  activo: boolean;
  estado?: string;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <div className="titulo-fila">
            <h1 className="titulo">{titulo}</h1>
            {activo ? (
              <span className="pastilla pastilla-verde pastilla-activo">{estado}</span>
            ) : (
              <span className="pastilla pastilla-gris">Inactivo</span>
            )}
          </div>
          <p className="subtitulo descripcion-agente">{descripcion}</p>
          {extra}
        </div>
        {(children || activo) && (
          <div className="fila-acciones">
            {children}
            {activo && (
              <form action={desactivarAgente}>
                <input type="hidden" name="agente" value={agente} />
                <button type="submit" className="boton boton-mediano">Desactivar agente</button>
              </form>
            )}
          </div>
        )}
      </header>
      {!activo && (
        <section className="aviso-conexion" aria-labelledby={`activar-${agente}`}>
          <div className="aviso-conexion-texto">
            <h2 id={`activar-${agente}`} className="titulo-tarjeta">
              Este agente todavía no está trabajando
            </h2>
            <p className="texto-suave">
              Revisá lo que muestra con tus datos y activalo cuando quieras. Nada sale hacia tus asegurados sin que lo
              apruebes.
            </p>
          </div>
          <form action={activarAgente}>
            <input type="hidden" name="agente" value={agente} />
            <button type="submit" className="boton boton-primario">
              Activar agente
            </button>
          </form>
        </section>
      )}
    </>
  );
}

/** Lo que hizo el agente, lo más nuevo primero. */
export function Bitacora({ actividad }: { actividad: { id: number; fecha: Date; texto: string }[] }) {
  const hoy = diaEnArgentina(new Date());
  return (
    <section className="tarjeta" aria-label="Actividad del agente">
      {actividad.length === 0 ? (
        <p className="vacio">Todavía no hay actividad.</p>
      ) : (
        <ol className="bitacora">
          {actividad.map((a) => {
            const dia = diaEnArgentina(a.fecha);
            return (
              <li key={a.id}>
                <span className="texto-gris tabular">{dia === hoy ? `Hoy ${diaYHora(a.fecha).slice(6)}` : fechaCorta(dia)}</span>
                <span>{a.texto}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
