/** Sección que todavía no está lista: se muestra en el menú pero no tiene contenido. */
export function EnPreparacion({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">{titulo}</h1>
          <p className="subtitulo">{detalle}</p>
        </div>
      </header>
      <section className="tarjeta">
        <p className="vacio">Esta sección se está armando. Muy pronto vas a poder usarla.</p>
      </section>
    </>
  );
}
