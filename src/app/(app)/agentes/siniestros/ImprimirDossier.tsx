"use client";

export function ImprimirDossier() {
  return <button type="button" className="boton boton-primario dossier-imprimir" onClick={() => window.print()}>Imprimir o guardar como PDF</button>;
}
