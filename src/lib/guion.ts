import type { TipoEvento } from "./evento";

// "Cómo arrancar la conversación": un mensaje corto, de usted y en castellano
// rioplatense, armado con plantillas según qué pasó y a qué se dedica la
// empresa. Sirve para la llamada y para mandar por WhatsApp.

export type DatosGuion = {
  empresa: string;
  tipoEvento: TipoEvento;
  sectorId: string;
  /** Rubro mostrado; en transporte dice el tipo ("Transporte de pasajeros"). */
  rubro: string;
  localidad: string;
  motivo: string;
  diasEvento: number | null;
  /** Nombre del productor (NOMBRE_PRODUCTOR); sin él, el saludo no lo menciona. */
  productor?: string;
};

function saludo(productor?: string): string {
  return productor
    ? `Buen día, ¿cómo le va? Le habla ${productor}, productor asesor de seguros de Mar del Plata.`
    : "Buen día, ¿cómo le va? Soy productor asesor de seguros, acá en Mar del Plata.";
}

/** La pregunta que abre la charla según a qué se dedica la empresa. */
function pregunta(sectorId: string, rubro: string): string {
  const r = rubro.toLowerCase();
  if (sectorId === "flotas") {
    if (/pasajeros|sanitario|escolar/.test(r)) return "¿Ya tienen cubiertos los vehículos y a las personas que trasladan?";
    if (/carga/.test(r)) return "¿Ya tienen asegurada la flota y la mercadería que van a mover?";
    return "¿Ya tienen cubiertos los vehículos?";
  }
  if (sectorId === "construccion") return "Para las obras van a necesitar RC, ART y el seguro de la obra: ¿ya lo tienen resuelto?";
  if (sectorId === "industria") return "¿Ya tienen asegurada la planta y la ART del personal?";
  if (sectorId === "salud") return "¿Ya cuentan con la cobertura de responsabilidad profesional?";
  return "¿Ya tienen el seguro del local y la ART del personal?";
}

/** "Ganó licitación nacional: Refacción de contrapisos…" → "Refacción de contrapisos…". */
function objetoDeLicitacion(motivo: string): string {
  const objeto = motivo.replace(/^[^:]*:\s*/, "").replace(/…$/, "").trim();
  return objeto.charAt(0).toLowerCase() + objeto.slice(1);
}

function cuerpo(d: DatosGuion): string {
  switch (d.tipoEvento) {
    case "licitacion": {
      const objeto = objetoDeLicitacion(d.motivo);
      if (d.diasEvento !== null && d.diasEvento > 30) {
        return `Vi que ${d.empresa} ganó la licitación de ${objeto}. ${pregunta(d.sectorId, d.rubro)}`;
      }
      return (
        `Vi que ${d.empresa} ganó hace poco la licitación de ${objeto}, ¡felicitaciones! ` +
        "¿Ya tienen resuelto el seguro de caución para firmar el contrato?"
      );
    }
    case "sociedad":
      return `Vi en el Boletín Oficial que ${d.empresa} se constituyó hace poco, ¡felicitaciones! ${pregunta(d.sectorId, d.rubro)}`;
    case "transferencia":
      return (
        `Vi que ${d.empresa} tomó el fondo de comercio de ${d.rubro.toLowerCase()} en ${d.localidad}. ` +
        "Con el cambio de titular hay que rehacer los seguros del local y la ART: ¿ya lo tienen encaminado?"
      );
    default:
      return `Trabajo con empresas de la zona y me pareció que les podía ser útil. ${pregunta(d.sectorId, d.rubro)}`;
  }
}

export function guionContacto(d: DatosGuion): string {
  return [saludo(d.productor), cuerpo(d), "Si le parece, le preparo una propuesta sin compromiso."].join(" ");
}
