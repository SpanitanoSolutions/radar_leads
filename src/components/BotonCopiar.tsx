"use client";

import { useState } from "react";

/** Copia un texto al portapapeles (para pegarlo en WhatsApp) y avisa que lo hizo. */
export function BotonCopiar({ texto, etiqueta = "Copiar mensaje" }: { texto: string; etiqueta?: string }) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "error">("listo");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      setEstado("error");
    }
    setTimeout(() => setEstado("listo"), 2500);
  }

  return (
    <button type="button" className="boton" onClick={copiar} aria-live="polite">
      {estado === "copiado" ? "¡Copiado!" : estado === "error" ? "No se pudo copiar" : etiqueta}
    </button>
  );
}
