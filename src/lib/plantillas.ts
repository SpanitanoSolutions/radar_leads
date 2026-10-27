// Plantillas de mensajes con variables entre llaves: {nombre}, {compañía},
// {ramo}, {cuota}, {monto}, {vence}, {medios de pago}, {fin de gracia},
// {productor}. Los borradores se guardan con {productor} sin completar, así
// toman el nombre que esté cargado en "Mi cuenta" al momento de enviarlos.

export type Variables = Record<string, string | null | undefined>;

/** Reemplaza las variables conocidas y deja las desconocidas como estaban. */
export function completarPlantilla(plantilla: string, variables: Variables): string {
  return plantilla.replace(/\{([^{}]+)\}/g, (entera, nombre: string) => {
    const valor = variables[nombre.trim()];
    return valor === null || valor === undefined || valor === "" ? entera : valor;
  });
}

/** Firma del productor para los mensajes. Si no cargó su nombre, queda un recordatorio visible. */
export function firma(nombre: string | null | undefined): string {
  return nombre?.trim() || "[Nombre del productor]";
}

/** Completa solo la firma: lo que se muestra y lo que se envía de un borrador. */
export function conFirma(texto: string, productor: string | null | undefined): string {
  return completarPlantilla(texto, { productor: firma(productor) });
}

/** "Gómez, Lucía" → "Lucía"; "Transportes Del Atlántico SRL" queda igual. */
export function nombreDePila(nombre: string, esEmpresa: boolean): string {
  if (esEmpresa) return nombre;
  const [apellido, pila] = nombre.split(",").map((s) => s.trim());
  return (pila || apellido).split(/\s+/)[0];
}
