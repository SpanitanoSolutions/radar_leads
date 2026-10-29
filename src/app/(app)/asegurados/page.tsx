import { cookies } from "next/headers";
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { IconoChevron, IconoMas, IconoPuntos, IconoSubir } from "@/components/iconos";
import { Paginas } from "@/components/Paginas";
import {
  alertasDe,
  COOKIE_POR_PAGINA,
  filtrarAsegurados,
  hayFiltros,
  leerFiltrosAsegurados,
  paginar,
  porPaginaValido,
  resumirAsegurado,
  tonoDias,
  urlAsegurados,
  VISTAS,
} from "@/lib/asegurados";
import { obtenerAsegurados, obtenerFichaAsegurado } from "@/lib/datos-cartera";
import { diaEnArgentina, fechaCorta } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { borrarCarteraDeEjemplo } from "./actions";
import { FilasPorPagina } from "./FilasPorPagina";
import { FiltrosLista } from "./FiltrosLista";
import { LimpiarFiltros } from "./LimpiarFiltros";
import { ListaAsegurados, type FilaVista } from "./ListaAsegurados";
import { PanelAsegurado } from "./PanelAsegurado";
import "./asegurados.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function Asegurados({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const porGuardado = porPaginaValido((await cookies()).get(COOKIE_POR_PAGINA)?.value) ?? undefined;
  const filtros = leerFiltrosAsegurados(params, porGuardado);
  const ver = Number(params.ver) || null;
  const hoy = diaEnArgentina(new Date());
  const [todos, ficha] = await Promise.all([obtenerAsegurados(), ver ? obtenerFichaAsegurado(ver) : null]);

  const filas = todos.map((a) => resumirAsegurado(a, hoy));
  const visibles = filtrarAsegurados(filas, filtros);
  const pagina = paginar(visibles, filtros.pagina, filtros.por);
  const vista = VISTAS.find((v) => v.id === filtros.vista);
  const conFiltros = hayFiltros(filtros);
  const hayEjemplos = filas.some((f) => f.esEjemplo);
  const companias = [...new Set(filas.flatMap((f) => f.companias))].sort((a, b) => a.localeCompare(b, "es"));
  const localidades = [...new Set(filas.map((f) => f.localidad).filter((l): l is string => Boolean(l)))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  const urlActual = urlAsegurados(filtros, ver ? { ver } : {});

  const vistaFilas: FilaVista[] = pagina.filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    sub: [f.tipo === "empresa" ? "Empresa" : "Persona", f.localidad].filter(Boolean).join(" · "),
    documento: f.documento ?? "—",
    alertas: alertasDe(f),
    ramos: f.ramos.slice(0, 2),
    ramosMas: f.ramos.length > 2 ? `+${f.ramos.length - 2}` : "",
    compania: f.companias[0] ?? "—",
    companiasMas: f.companias.length > 1 ? `+${f.companias.length - 1}` : "",
    vence: f.vence ? fechaCorta(f.vence) : "—",
    diasTexto: f.dias !== null ? `en ${f.dias} días` : "Sin pólizas vigentes",
    diasTono: f.dias !== null ? tonoDias(f.dias) : "gris",
    prima: pesos(f.prima),
    href: urlAsegurados(filtros, { ver: f.id }),
  }));

  return (
    <>
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <div className="titulo-fila">
            <h1 className="titulo">Asegurados</h1>
            {hayEjemplos && <span className="pastilla pastilla-ambar">Datos de ejemplo</span>}
          </div>
          <p className="subtitulo">
            Administrá asegurados y pólizas desde un solo lugar. Consultá vencimientos, contacto y primas de cada persona.
          </p>
        </div>
        <div className="fila-acciones">
          <Link href="/importar" className="boton">
            <IconoSubir size={16} />
            Importar cartera
          </Link>
          <Link href="/asegurados/nuevo" className="boton">
            <IconoMas />
            Nuevo asegurado
          </Link>
          <details className="desplegable menu-desplegable">
            <summary className="boton">
              Exportar
              <IconoChevron />
            </summary>
            <div className="panel-desplegable lista-menu">
              <a href="/asegurados/exportar" download>
                Todos los asegurados (CSV)
              </a>
              {conFiltros && (
                <a href={`/asegurados/exportar${urlAsegurados(filtros).replace("/asegurados", "")}`} download>
                  Solo los de estos filtros (CSV)
                </a>
              )}
            </div>
          </details>
          <details className="desplegable menu-desplegable">
            <summary className="boton boton-cuadrado" aria-label="Más acciones">
              <IconoPuntos />
            </summary>
            <div className="panel-desplegable lista-menu">
              <Link href="/vencimientos">Ver vencimientos por semana</Link>
              <Link href="/importar">Importar otra planilla</Link>
              {hayEjemplos && (
                <form action={borrarCarteraDeEjemplo}>
                  <button type="submit" className="boton-texto boton-texto-peligro">
                    Borrar los datos de ejemplo
                  </button>
                </form>
              )}
            </div>
          </details>
        </div>
      </header>

      <Aviso codigo={params.aviso} />

      <section aria-label="Vistas rápidas" className="vistas">
        {VISTAS.map((v) => {
          const activa = filtros.vista === v.id;
          return (
            <Link
              key={v.id}
              href={urlAsegurados(filtros, { vista: activa ? "" : v.id })}
              scroll={false}
              className={activa ? "vista vista-activa" : "vista"}
              aria-current={activa ? "true" : undefined}
            >
              <span className="vista-titulo">{v.titulo}</span>
              <span className={`vista-numero vista-${v.tono}`}>{filas.filter(v.incluye).length}</span>
              <span className="vista-detalle">{v.detalle}</span>
            </Link>
          );
        })}
      </section>

      <section aria-label="Lista de asegurados" className="tarjeta lista">
        <div className="lista-cabecera">
          <div className="titulo-fila">
            <h2 className="lista-titulo">
              {conFiltros
                ? `${vista ? vista.titulo : "Resultados"} (${visibles.length} de ${filas.length})`
                : `Todos los asegurados (${filas.length})`}
            </h2>
            {conFiltros && <LimpiarFiltros />}
          </div>
        </div>

        <FiltrosLista filtros={filtros} companias={companias} localidades={localidades} />

        <ListaAsegurados filas={vistaFilas} abierto={ver} />

        <div className="lista-pie">
          <span className="tabular">
            {visibles.length ? `${pagina.desde}–${pagina.hasta} de ${visibles.length}` : "0"} asegurados
          </span>
          <Paginas pagina={pagina.pagina} paginas={pagina.paginas} href={(n) => urlAsegurados(filtros, { pagina: n })} />
          <FilasPorPagina filtros={filtros} primeraFila={pagina.desde} />
        </div>
      </section>

      {ficha && (
        <PanelAsegurado
          asegurado={ficha.asegurado}
          hoy={hoy}
          seguimiento={ficha.seguimiento}
          importacion={ficha.importacion}
          cerrarHref={urlAsegurados(filtros)}
          volver={urlActual}
        />
      )}
    </>
  );
}
