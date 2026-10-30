"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import logoUniqo from "@/app/icon.png";
import { cerrarSesion } from "@/app/login/actions";
import type { Cuenta } from "@/lib/datos";
import {
  armarMenu,
  estaActivo,
  fechaCorta,
  type ContadoresMenu,
  type Icono,
  type ItemMenu,
} from "@/lib/menu";
import {
  IconoAyuda,
  IconoBuscar,
  IconoCampana,
  IconoCalculadora,
  IconoCalendario,
  IconoChevron,
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

// El tema vive en <html data-theme>: lo fija el script de layout.tsx antes de
// hidratar. Se lee de ahí y se escucha su cambio, sin copiarlo a un estado.
function suscribirTema(avisar: () => void) {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observador.disconnect();
}
const temaOscuroEnPagina = () => document.documentElement.dataset.theme === "dark";
const temaOscuroEnServidor = () => false;

/**
 * Barra superior y menú lateral de todas las pantallas privadas.
 * En celular el menú se esconde detrás de un botón y se abre como panel.
 */
export function Marco({
  cuenta,
  contadores,
  notificaciones,
  children,
}: {
  cuenta: Cuenta;
  contadores: ContadoresMenu;
  notificaciones: { comprobantes: number; cobranza: number; cotizaciones: number; siniestros: number; cuotasVencidas: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const temaOscuro = useSyncExternalStore(suscribirTema, temaOscuroEnPagina, temaOscuroEnServidor);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const campoBusqueda = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const buscarConAtajo = (evento: KeyboardEvent) => {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        campoBusqueda.current?.focus();
      }
    };
    document.addEventListener("keydown", buscarConAtajo);
    return () => document.removeEventListener("keydown", buscarConAtajo);
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
    // Solo los menús desplegables. Una sección plegable con un formulario no se
    // cierra sola: si estaba arriba, todo lo de abajo subía al apretar y el clic
    // caía en otro lado (pasaba con "Es este cobro: confirmar" en el Validador).
    const MENUS_ABIERTOS = "details.barra-desplegable[open], details.desplegable[open]";
    const cerrarFuera = (evento: PointerEvent) => {
      const destino = evento.target;
      if (!(destino instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>(MENUS_ABIERTOS).forEach((detalle) => {
        if (!detalle.contains(destino)) detalle.open = false;
      });
    };
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      const abiertas = Array.from(document.querySelectorAll<HTMLDetailsElement>(MENUS_ABIERTOS));
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

  const nombrePerfil = cuenta.nombre?.trim() || "Mi cuenta";
  const nombreEquipo = cuenta.organizacion?.trim() || "Mi equipo";
  const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toLocaleUpperCase("es-AR") || "U";
  const importacion = contadores.ultimaImportacion;
  const avisos = [
    { href: "/agentes/validador?tab=revisar", texto: "Comprobantes por revisar", cantidad: notificaciones.comprobantes },
    { href: "/agentes/cobranza", texto: "Mensajes para aprobar", cantidad: notificaciones.cobranza },
    { href: "/agentes/cotizacion?estado=atencion", texto: "Cotizaciones con atención", cantidad: notificaciones.cotizaciones },
    { href: "/agentes/siniestros", texto: "Siniestros abiertos", cantidad: notificaciones.siniestros },
    { href: "/agentes/validador?bloque=vencidos", texto: "Cuotas vencidas", cantidad: notificaciones.cuotasVencidas },
  ].filter((aviso) => aviso.cantidad > 0);
  const totalAvisos = avisos.reduce((suma, aviso) => suma + aviso.cantidad, 0);

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
          <Image src={logoUniqo} alt="UNIQO" width={34} height={34} loading="eager" className="barra-logo" />
          <span className="barra-producto">Tecnología aplicada a seguros</span>
        </Link>
        <span className="barra-separador" aria-hidden="true" />
        <div className="barra-equipo">
          {cuenta.logoEmpresa ? (
            <Image
              src="/api/logo-empresa"
              alt=""
              width={36}
              height={36}
              unoptimized
              className="barra-logo-empresa"
            />
          ) : (
            <span className="barra-equipo-iniciales" aria-hidden="true">{iniciales(nombreEquipo)}</span>
          )}
          <span className="barra-equipo-nombre">{nombreEquipo}</span>
        </div>
        <form action="/buscar" method="get" className="barra-busqueda" role="search">
          <IconoBuscar />
          <label htmlFor="buscar-global" className="visualmente-oculto">Buscar cliente, póliza o siniestro</label>
          <input
            ref={campoBusqueda}
            id="buscar-global"
            type="search"
            name="q"
            placeholder="Buscar cliente, póliza o siniestro..."
            aria-keyshortcuts="Control+K Meta+K"
            autoComplete="off"
          />
          <kbd aria-hidden="true">⌘ K</kbd>
        </form>
        <div className="barra-acciones">
          <button
            type="button"
            className="barra-icono"
            aria-label={temaOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-pressed={temaOscuro}
            title={temaOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            onClick={alternarTema}
          >
            {temaOscuro ? <IconoSol /> : <IconoLuna />}
          </button>
          <Link href="/ayuda" className="barra-icono" aria-label="Ayuda">
            <IconoAyuda />
          </Link>
          <details className="barra-desplegable barra-notificaciones">
            <summary className="barra-icono" aria-label={`Notificaciones${totalAvisos ? `: ${totalAvisos} pendientes` : ""}`}>
              <IconoCampana />
              {totalAvisos > 0 && <span className="barra-notificaciones-badge">{totalAvisos > 99 ? "99+" : totalAvisos}</span>}
            </summary>
            <div className="barra-menu-panel barra-notificaciones-panel">
              <div className="barra-menu-titulo">
                <strong>Notificaciones</strong>
                <span>{totalAvisos ? `${totalAvisos} pendientes` : "Al día"}</span>
              </div>
              {avisos.length ? avisos.map((aviso) => (
                <Link key={aviso.href} href={aviso.href} onClick={(evento) => evento.currentTarget.closest("details")?.removeAttribute("open")}>
                  <span>{aviso.texto}</span><strong>{aviso.cantidad}</strong>
                </Link>
              )) : <p className="barra-notificaciones-vacio">No tenés asuntos pendientes.</p>}
            </div>
          </details>
          <details className="barra-desplegable barra-perfil">
            <summary className="barra-perfil-resumen" aria-label={`Opciones de ${nombrePerfil}`}>
              <span className="barra-perfil-avatar" aria-hidden="true">{iniciales(nombrePerfil)}</span>
              <span className="barra-perfil-datos">
                <strong>{nombrePerfil}</strong>
                <small>{nombreEquipo}</small>
              </span>
              <IconoChevron />
            </summary>
            <div className="barra-menu-panel barra-perfil-panel">
              <p className="barra-menu-encabezado">{nombrePerfil}</p>
              <Link href="/configuracion?tab=cuenta" onClick={(evento) => evento.currentTarget.closest("details")?.removeAttribute("open")}>Mi cuenta</Link>
              <Link href="/configuracion" onClick={(evento) => evento.currentTarget.closest("details")?.removeAttribute("open")}>Configuración general</Link>
              <Link href="/ayuda" onClick={(evento) => evento.currentTarget.closest("details")?.removeAttribute("open")}>Ayuda</Link>
              <button type="button" className="barra-menu-tema" onClick={alternarTema}>
                {temaOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              </button>
              <form action={cerrarSesion} onSubmit={(evento) => evento.currentTarget.closest("details")?.removeAttribute("open")}>
                <button type="submit" className="barra-menu-salir">Cerrar sesión</button>
              </form>
            </div>
          </details>
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
            <Link href="/importar#historial" className="ultima-importacion" aria-label="Abrir historial de importaciones" onClick={() => setAbierto(false)}>
              <IconoSubir />
              <span className="ultima-importacion-contenido">
                <span className="ultima-importacion-titulo">Última importación</span>
                <span>
                  {importacion
                    ? [fechaCorta(importacion.fecha), importacion.archivo, importacion.filas ? `${importacion.filas.toLocaleString("es-AR")} registros` : null].filter(Boolean).join(" · ")
                    : "Todavía no importaste tu cartera"}
                </span>
              </span>
              <span className="ultima-importacion-flecha" aria-hidden="true">›</span>
            </Link>
          </div>
        </nav>
        <main id="contenido" className="contenido" tabIndex={-1}>
          {children}
          <footer className="firma-app">
            <p>
              Powered by <strong>Spanitano Solutions</strong>
            </p>
            <p>© {new Date().getFullYear()} Spanitano Solutions. Todos los derechos reservados.</p>
            <p className="firma-app-enlaces">
              <Link href="/terminos">Términos y condiciones</Link>
              <Link href="/privacidad">Política de privacidad</Link>
            </p>
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
