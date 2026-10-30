"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Vueltas de 3 segundos: si la lectura tarda más de 3 minutos, la retoma el cron y se ve al volver a entrar. */
const MAXIMO_VUELTAS = 60;

/** Mientras la IA lee un PDF en segundo plano, vuelve a pedir la página para mostrar lo que leyó. */
export function ActualizarMientrasLee() {
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
