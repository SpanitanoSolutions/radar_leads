"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Vueltas de 3 segundos, hasta 5 minutos: lo que tarda como mucho una corrida. */
const MAXIMO_VUELTAS = 100;

/** Mientras la corrida está en curso, vuelve a pedir la página para mostrar lo nuevo. */
export function Refrescar() {
  const router = useRouter();
  useEffect(() => {
    let vueltas = 0;
    const id = setInterval(() => {
      vueltas++;
      if (vueltas > MAXIMO_VUELTAS) clearInterval(id);
      else router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
