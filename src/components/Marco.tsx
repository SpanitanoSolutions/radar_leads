"use client";

import Image from "next/image";
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
  IconoSol,
  IconoLuna,
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
  const [temaOscuro, setTemaOscuro] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);

  useEffect(() => {
    setTemaOscuro(document.documentElement.dataset.theme === "dark");
  }, []);

  function alternarTema() {
    const nuevoTema = temaOscuro ? "light" : "dark";
    document.documentElement.dataset.theme = nuevoTema;
    document.documentElement.style.colorScheme = nuevoTema;
    try {
      localStorage.setItem("uniqo-theme", nuevoTema);
    } catch {
      // El tema sigue activo durante esta sesión aunque el navegador bloquee el almacenamiento.
    }
    setTemaOscuro(nuevoTema === "dark");
  }

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

  useEffect(() => {
    const cerrarFuera = (evento: PointerEvent) => {
      const destino = evento.target;
      if (!(destino instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((detalle) => {
        if (!detalle.contains(destino)) detalle.open = false;
      });
    };
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      const abiertas = Array.from(document.querySelectorAll<HTMLDetailsElement>("details[open]"));
      if (!abiertas.length) return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      const activa = abiertas.find((detalle) => detalle.contains(document.activeElement)) ?? abiertas.at(-1)!;
      abiertas.forEach((detalle) => { detalle.open = false; });
      activa.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", cerrarFuera, true);
    document.addEventListener("keydown", cerrarConEscape, true);
    return () => {
      document.removeEventListener("pointerdown", cerrarFuera, true);
      document.removeEventListener("keydown", cerrarConEscape, true);
    };
  }, []);

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
          <span className="barra-nombre">
            UNI<span className="barra-nombre-q">Q</span>O
          </span>
          <span className="barra-producto">Administración de seguros</span>
        </Link>
        {(productor || cuenta.logoEmpresa) && (
          <>
            <span className="barra-separador" aria-hidden="true" />
            <span className="barra-cuenta">
              {cuenta.logoEmpresa && (
                <Image
                  src="/api/logo-empresa"
                  alt={cuenta.organizacion ? `Logo de ${cuenta.organizacion}` : "Logo de la empresa"}
                  width={32}
                  height={32}
                  unoptimized
                  className="barra-logo-empresa"
                />
              )}
              {productor && <span className="barra-productor">{productor}</span>}
            </span>
          </>
        )}
        <div className="barra-acciones">
          <button
            type="button"
            className="barra-icono"
            aria-label="Modo oscuro"
            aria-pressed={temaOscuro}
            title={temaOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            onClick={alternarTema}
          >
            {temaOscuro ? <IconoSol /> : <IconoLuna />}
          </button>
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
