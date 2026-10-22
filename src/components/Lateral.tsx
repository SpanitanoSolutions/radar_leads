"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { IconoGrilla, IconoLista, IconoRadar } from "./iconos";

const ITEMS = [
  { href: "/", texto: "Leads del día", Icono: IconoLista, activo: (p: string) => p === "/" || p.startsWith("/leads") },
  { href: "/sectores", texto: "Mis sectores", Icono: IconoGrilla, activo: (p: string) => p.startsWith("/sectores") },
];

export function Lateral() {
  const pathname = usePathname();
  return (
    <nav className="lateral" aria-label="Navegación principal">
      <div className="marca">
        <span className="marca-icono" aria-hidden="true">
          <IconoRadar />
        </span>
        <span className="marca-nombre">Radar de leads</span>
      </div>
      <div className="menu">
        {ITEMS.map(({ href, texto, Icono, activo }) => (
          <Link
            key={href}
            href={href}
            className="menu-item"
            aria-current={activo(pathname) ? "page" : undefined}
          >
            <Icono />
            {texto}
          </Link>
        ))}
      </div>
      <div className="lateral-pie">
        <form action={cerrarSesion}>
          <button type="submit" className="boton-salir">
            Cerrar sesión
          </button>
        </form>
      </div>
    </nav>
  );
}
