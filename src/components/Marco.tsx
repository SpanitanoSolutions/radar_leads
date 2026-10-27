"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import type { Cuenta } from "@/lib/datos";
import {
  armarMenu,
  estaActivo,
  fechaCorta,
  itemConfiguracion,
  type ContadoresMenu,
  type Icono,
  type ItemMenu,
} from "@/lib/menu";
import {
  IconoAyuda,
  IconoCalculadora,
  IconoCalendario,
  IconoCerrar,
  IconoEngranaje,
  IconoEscudo,
  IconoFlechas,
  IconoGrafico,
  IconoGrilla,
  IconoMenu,
  IconoMoneda,
  IconoRadar,
  IconoSubir,
  IconoTarjeta,
  IconoUsuarios,
} from "./iconos";

const ICONOS: Record<Icono, (props: { size?: number }) => React.ReactNode> = {
  usuarios: IconoUsuarios,
  calendario: IconoCalendario,
  subir: IconoSubir,
  calculadora: IconoCalculadora,
  tarjeta: IconoTarjeta,
  escudo: IconoEscudo,
  moneda: IconoMoneda,
  flechas: IconoFlechas,
  grafico: IconoGrafico,
  radar: IconoRadar,
  grilla: IconoGrilla,
  engranaje: IconoEngranaje,
};

/**
 * Barra superior y menú lateral de todas las pantallas privadas.
 * En celular el menú se esconde detrás de un botón y se abre como panel.
 */
export function Marco({
  cuenta,
  contadores,
  children,
}: {
  cuenta: Cuenta;
  contadores: ContadoresMenu;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;
    menu.current?.querySelector<HTMLElement>("a")?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const productor = [cuenta.nombre, cuenta.organizacion].filter(Boolean).join(" · ");
  const importacion = contadores.ultimaImportacion;

  return (
    <div className="app">
      <a href="#contenido" className="saltar">
        Ir al contenido
      </a>
      <header className="barra">
        <button
          ref={boton}
          type="button"
          className="barra-icono boton-menu"
          aria-expanded={abierto}
          aria-controls="menu-principal"
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? <IconoCerrar /> : <IconoMenu />}
          <span className="visualmente-oculto">Menú</span>
        </button>
        <Link href="/" className="barra-marca">
          <span className="marca-icono marca-icono-chico" aria-hidden="true">
            <IconoRadar size={16} />
          </span>
          <span className="barra-nombre">Radar</span>
          <span className="barra-producto">Cartera de seguros</span>
        </Link>
        {productor && (
          <>
            <span className="barra-separador" aria-hidden="true" />
            <span className="barra-productor">{productor}</span>
          </>
        )}
        <div className="barra-acciones">
          <Link href="/ayuda" className="barra-icono" aria-label="Ayuda">
            <IconoAyuda />
          </Link>
          <form action={cerrarSesion}>
            <button type="submit" className="barra-salir">
              Salir
            </button>
          </form>
        </div>
      </header>

      <div className="cuerpo">
        {abierto && <div className="velo" aria-hidden="true" onClick={cerrar} />}
        <nav
          ref={menu}
          id="menu-principal"
          className="lateral"
          data-abierto={abierto}
          aria-label="Navegación principal"
        >
          {armarMenu(contadores).map((grupo) => (
            <div key={grupo.id} className="menu-grupo" role="group" aria-labelledby={`menu-${grupo.id}`}>
              <div id={`menu-${grupo.id}`} className="menu-titulo">
                {grupo.titulo}
              </div>
              {grupo.items.map((item) => (
                <ItemDelMenu key={item.href} item={item} pathname={pathname} alElegir={() => setAbierto(false)} />
              ))}
            </div>
          ))}
          <div className="menu-pie">
            <div className="ultima-importacion">
              <div className="ultima-importacion-titulo">Última importación</div>
              <div>
                {importacion
                  ? [fechaCorta(importacion.fecha), importacion.archivo].filter(Boolean).join(" · ")
                  : "Todavía no importaste tu cartera"}
              </div>
            </div>
            <ItemDelMenu
              item={itemConfiguracion(contadores)}
              pathname={pathname}
              alElegir={() => setAbierto(false)}
            />
          </div>
        </nav>
        <main id="contenido" className="contenido" tabIndex={-1}>
          {children}
          <footer className="firma-app">
            <span>Powered by</span>
            <strong>Spanitano Solutions</strong>
          </footer>
        </main>
      </div>
    </div>
  );
}

function ItemDelMenu({ item, pathname, alElegir }: { item: ItemMenu; pathname: string; alElegir: () => void }) {
  const Icono = ICONOS[item.icono];
  return (
    <Link
      href={item.href}
      className="menu-item"
      aria-current={estaActivo(item, pathname) ? "page" : undefined}
      onClick={alElegir}
    >
      <Icono />
      <span>{item.texto}</span>
      {item.contador && (
        <>
          <span className={`menu-contador menu-contador-${item.contador.tono}`} aria-hidden="true">
            {item.contador.valor}
          </span>
          <span className="visualmente-oculto">: {item.contador.descripcion}</span>
        </>
      )}
      {item.configurar && <span className="menu-configurar">Configurar</span>}
    </Link>
  );
}
