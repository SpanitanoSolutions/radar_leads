import Image from "next/image";
import { IconoEscudo, IconoMoneda } from "./iconos";
import type { TipoConexion } from "@/conexiones/catalogo";

const LOGOS: Record<string, string> = {
  mapfre: "/logos/mapfre.svg",
  sancor: "/logos/sancor.svg",
  federacionpatronal: "/logos/federacion-patronal.png",
  lasegunda: "/logos/lasegunda.svg",
  fianzasycredito: "/logos/fianzasycredito.svg",
};

function logoDeCompania(compania?: string): string | undefined {
  const nombre = (compania ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return LOGOS[nombre];
}

function origen(tipo: TipoConexion, compania?: string): string | undefined {
  if (tipo === "portal") return logoDeCompania(compania);
  if (tipo === "whatsapp") return "/logos/whatsapp.svg";
  if (tipo === "mercadopago") return "/logos/mercadopago.svg";
  if (tipo === "google_calendar") return "/logos/googlecalendar.svg";
  return undefined;
}

export function IconoConexion({ tipo, compania }: { tipo: TipoConexion; compania?: string }) {
  const src = origen(tipo, compania);
  if (src) {
    return <Image src={src} alt="" aria-hidden="true" width={60} height={40} unoptimized className="conexion-imagen" />;
  }

  if (tipo === "email") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (tipo === "banco") return <IconoMoneda size={21} />;
  return <IconoEscudo size={21} />;
}
