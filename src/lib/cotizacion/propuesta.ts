import { mejorResultadoConfirmado } from "@/lib/cotizacion";
import { pesos } from "@/lib/formato";
import { coberturasPorFila, FILAS_COBERTURA, type Cobertura } from "./comparativo";
import type { ImagenPdf } from "./logo-pdf";
import type { DocumentoPdf } from "./propuesta-pdf";

// Lo que dice cada PDF de Cotización: la propuesta para el cliente (criterio 6:
// con la marca de la cuenta y en borrador hasta que el productor la apruebe) y
// el comparativo exportado. El dibujo está en propuesta-pdf.ts.

export type Cuenta = { organizacion: string | null; nombre: string | null; telefono: string | null; email: string | null };

export type ResultadoPdf = {
  envioId: number;
  primaTotal: number;
  moneda: string;
  franquicia: string | null;
  vigencia: string | null;
  coberturas: Cobertura[];
  confirmado: boolean;
};

type EnvioPdf = { id: number; compania: string; estado: string; paqueteId: number | null };
type SolicitudPdf = { numero: number; cliente: string; ramo: string; bien: string | null };

const PIE = "Documento preliminar: no es una póliza ni una cobertura vigente. Las condiciones finales las confirma cada compañía al emitir.";

function precio(valor: number, moneda: string): string {
  return moneda === "USD" ? `US$ ${valor.toLocaleString("es-AR")}` : pesos(valor);
}

function marcaDe(cuenta: Cuenta): DocumentoPdf["marca"] {
  const contacto = [cuenta.telefono, cuenta.email].filter(Boolean).join(" · ");
  return { organizacion: cuenta.organizacion || cuenta.nombre || "Productor de seguros", productor: cuenta.nombre, contacto: contacto || null };
}

/**
 * La propuesta para el cliente: solo las respuestas confirmadas, de la más
 * barata a la más cara, con "Mejor precio" en la primera, y las coberturas que
 * informó cada compañía.
 */
export function documentoPropuesta(datos: {
  solicitud: SolicitudPdf;
  envios: EnvioPdf[];
  resultados: ResultadoPdf[];
  nombrePaquete: Map<number, string>;
  cuenta: Cuenta;
  logo: ImagenPdf | null;
  fecha: string;
}): DocumentoPdf {
  const porEnvio = new Map(datos.envios.map((envio) => [envio.id, envio]));
  const confirmadas = datos.resultados.filter((resultado) => resultado.confirmado && porEnvio.has(resultado.envioId))
    .sort((a, b) => a.primaTotal - b.primaTotal);
  const mejor = mejorResultadoConfirmado(confirmadas);
  const nombre = (resultado: ResultadoPdf) => {
    const envio = porEnvio.get(resultado.envioId)!;
    const paquete = envio.paqueteId == null ? null : datos.nombrePaquete.get(envio.paqueteId);
    return paquete ? `${envio.compania} · ${paquete}` : envio.compania;
  };
  const coberturas = confirmadas.flatMap((resultado) => {
    const filas = coberturasPorFila(resultado.coberturas);
    const partes = [
      ...FILAS_COBERTURA.flatMap((fila) => (filas[fila.id] ? [`${fila.etiqueta}: ${filas[fila.id]}`] : [])),
      ...(filas.otras ? [`Otras: ${filas.otras}`] : []),
    ];
    return partes.length ? [`${porEnvio.get(resultado.envioId)!.compania}. ${partes.join(". ")}.`] : [];
  });
  return {
    titulo: `Propuesta de seguro para ${datos.solicitud.cliente}`,
    subtitulo: `Solicitud ${datos.solicitud.numero} · ${datos.solicitud.ramo}${datos.solicitud.bien ? ` · ${datos.solicitud.bien}` : ""}`,
    introduccion: "Estas son las opciones que cotizamos con las compañías, de la más económica a la más cara. La prima total es lo que se paga por la vigencia, con impuestos y gastos.",
    marca: marcaDe(datos.cuenta),
    logo: datos.logo,
    tabla: {
      columnas: [
        { titulo: "Compañía", ancho: 150 },
        { titulo: "Prima total", ancho: 95, derecha: true },
        { titulo: "Franquicia", ancho: 120 },
        { titulo: "Vigencia", ancho: 130 },
      ],
      filas: confirmadas.map((resultado) => ({
        celdas: [nombre(resultado), precio(resultado.primaTotal, resultado.moneda), resultado.franquicia ?? "A confirmar", resultado.vigencia ?? "A confirmar"],
        ...(mejor?.envioId === resultado.envioId ? { destacada: true, etiqueta: "Mejor precio" } : {}),
      })),
    },
    secciones: coberturas.length ? [{ titulo: "Coberturas informadas", lineas: coberturas }] : [],
    pie: PIE,
    fecha: datos.fecha,
  };
}

/** El comparativo exportado: todas las compañías, con su estado y si la respuesta está confirmada. */
export function documentoComparativo(datos: {
  solicitud: SolicitudPdf;
  filas: { compania: string; estado: string; resultado: ResultadoPdf | null }[];
  cuenta: Cuenta;
  logo: ImagenPdf | null;
  fecha: string;
}): DocumentoPdf {
  const mejor = mejorResultadoConfirmado(datos.filas.flatMap((fila) => (fila.resultado ? [fila.resultado] : [])));
  return {
    titulo: `Comparativa de la solicitud ${datos.solicitud.numero}`,
    subtitulo: `${datos.solicitud.cliente} · ${datos.solicitud.ramo}${datos.solicitud.bien ? ` · ${datos.solicitud.bien}` : ""}`,
    marca: marcaDe(datos.cuenta),
    logo: datos.logo,
    tabla: {
      columnas: [
        { titulo: "Compañía", ancho: 140 },
        { titulo: "Estado", ancho: 95 },
        { titulo: "Prima total", ancho: 90, derecha: true },
        { titulo: "Franquicia", ancho: 95 },
        { titulo: "Confirmada", ancho: 75 },
      ],
      filas: datos.filas.map((fila) => ({
        celdas: [
          fila.compania,
          fila.estado,
          fila.resultado ? precio(fila.resultado.primaTotal, fila.resultado.moneda) : "—",
          fila.resultado?.franquicia ?? "—",
          fila.resultado ? (fila.resultado.confirmado ? "Sí" : "Falta confirmar") : "—",
        ],
        ...(fila.resultado && mejor && fila.resultado.envioId === mejor.envioId ? { destacada: true, etiqueta: "Mejor precio" } : {}),
      })),
    },
    pie: PIE,
    fecha: datos.fecha,
  };
}
