import { z } from "zod";
import { pesos } from "@/lib/formato";

// La IA de Cotización lee, redacta y explica, pero nunca decide. Lo que lee de un
// PDF queda sin confirmar hasta que el productor lo revisa, y los correos son
// borradores para aprobar. Acá están los esquemas, las instrucciones y lo que el
// código verifica de cada respuesta. El llamado está en src/agentes/cotizacion/ia.ts.

export const OPERACIONES_IA_COTIZACION = {
  extraerRespuesta: "extraer_respuesta",
  redactarCorreo: "redactar_correo",
  chat: "chat",
} as const;

// ---------- Respuesta de una compañía (PDF) ----------

export const esquemaRespuestaCompaniaIA = z.object({
  /** El premio: lo que paga el cliente por la vigencia, con impuestos y gastos. */
  primaTotal: z.number().nullable(),
  primaNeta: z.number().nullable(),
  gastos: z.number().nullable(),
  impuestos: z.number().nullable(),
  franquicia: z.string().nullable(),
  sumaAsegurada: z.number().nullable(),
  vigencia: z.string().nullable(),
  condiciones: z.string().nullable(),
  coberturas: z.array(z.object({ nombre: z.string(), valor: z.string().nullable() })),
  riesgoCotizado: z.object({
    cuitCuil: z.string().nullable(),
    marca: z.string().nullable(),
    modelo: z.string().nullable(),
    anio: z.string().nullable(),
    codigoPostal: z.string().nullable(),
  }),
});
export type RespuestaCompaniaIA = z.infer<typeof esquemaRespuestaCompaniaIA>;

export const SISTEMA_EXTRACCION = `Leés la cotización que mandó una compañía de seguros argentina (el PDF adjunto) y pasás sus datos al formato pedido.
- primaTotal: el premio, lo que paga el cliente por la vigencia cotizada, con impuestos y gastos. Si hay varios planes, usá el que coincide con la cobertura pedida; si no se puede saber, el primero.
- primaNeta: la prima sin impuestos ni gastos. gastos: gastos de explotación y derecho de emisión. impuestos: IVA, sellados y tasas.
- Los montos van como número, sin símbolo ni separador de miles: "$ 1.234.567,89" es 1234567.89.
- franquicia, vigencia y condiciones, como figuran en el PDF. coberturas: cada cobertura con su suma o detalle.
- riesgoCotizado: los datos del riesgo que figuran en la cotización (CUIT o CUIL, marca, modelo, año y código postal).
- Lo que el PDF no diga va en null o en una lista vacía. No calcules ni inventes nada: el productor revisa y confirma todo.`;

export function mensajeExtraccion(datos: { compania: string; ramo: string; tipo: string }): string {
  return `Compañía: ${datos.compania}. Ramo: ${datos.ramo}. Tipo de solicitud: ${datos.tipo}. Leé la cotización del PDF adjunto.`;
}

/** Lo leído, verificado por código, con la forma que espera registrarResultadoCotizacion(). */
export type RespuestaLeida = {
  precio: number;
  primaNeta: number | null;
  gastos: number;
  impuestos: number;
  franquicia: string | null;
  sumaAsegurada: number | null;
  vigencia: string | null;
  condiciones: string | null;
  coberturas: { nombre: string; valor?: string }[];
  riesgoCotizado: Record<string, string>;
};

const monto = (valor: number | null) => valor !== null && Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null;
const texto = (valor: string | null, largo: number) => valor?.trim().slice(0, largo) || null;

/**
 * Sin una prima total positiva no hay respuesta para el comparativo: devuelve null
 * y el productor la carga a mano. Los montos que no son positivos quedan vacíos y
 * los textos se recortan.
 */
export function respuestaLeida(datos: RespuestaCompaniaIA): RespuestaLeida | null {
  const precio = monto(datos.primaTotal);
  if (precio === null) return null;
  const riesgoCotizado = Object.fromEntries(Object.entries(datos.riesgoCotizado)
    .flatMap(([campo, valor]) => {
      const limpio = texto(valor, 120);
      return limpio ? [[campo, limpio]] : [];
    }));
  return {
    precio,
    primaNeta: monto(datos.primaNeta),
    gastos: monto(datos.gastos) ?? 0,
    impuestos: monto(datos.impuestos) ?? 0,
    franquicia: texto(datos.franquicia, 200),
    sumaAsegurada: monto(datos.sumaAsegurada),
    vigencia: texto(datos.vigencia, 120),
    condiciones: texto(datos.condiciones, 1000),
    coberturas: datos.coberturas.flatMap((cobertura) => {
      const nombre = texto(cobertura.nombre, 120);
      if (!nombre) return [];
      const valor = texto(cobertura.valor, 200);
      return [valor ? { nombre, valor } : { nombre }];
    }).slice(0, 40),
    riesgoCotizado,
  };
}

/** Lo que se guarda como borrador para revisar en la pestaña Agente. */
export function resumenLectura(compania: string, leida: RespuestaLeida | null): string {
  if (!leida) return `La IA leyó el PDF de ${compania}, pero no encontró la prima total. Cargá la respuesta a mano.`;
  const lineas = [
    `Respuesta de ${compania} (falta tu confirmación)`,
    `Prima total: ${pesos(leida.precio)}`,
    leida.primaNeta !== null ? `Prima neta: ${pesos(leida.primaNeta)}` : null,
    leida.gastos ? `Gastos: ${pesos(leida.gastos)}` : null,
    leida.impuestos ? `Impuestos: ${pesos(leida.impuestos)}` : null,
    leida.sumaAsegurada !== null ? `Suma asegurada: ${pesos(leida.sumaAsegurada)}` : null,
    leida.franquicia ? `Franquicia: ${leida.franquicia}` : null,
    leida.vigencia ? `Vigencia: ${leida.vigencia}` : null,
    leida.condiciones ? `Condiciones: ${leida.condiciones}` : null,
    leida.coberturas.length ? `Coberturas: ${leida.coberturas.map((c) => c.valor ? `${c.nombre} (${c.valor})` : c.nombre).join("; ")}` : null,
  ];
  return lineas.filter(Boolean).join("\n");
}

// ---------- Correo a una compañía ----------

export const esquemaCorreoIA = z.object({ cuerpo: z.string() });

export const SISTEMA_CORREO = `Mejorás el borrador del correo con el que un productor asesor de seguros argentino le pide una cotización a una compañía.
- Español rioplatense, profesional y breve.
- Conservá todos los datos del borrador (cliente, CUIT, bien, coberturas, plazos, nombres y firma): no agregues ni saques ninguno.
- Devolvé solo el cuerpo del correo, sin asunto.
- Es un borrador: el productor lo revisa y lo aprueba antes de que salga.`;

/** Un cuerpo vacío no reemplaza al borrador que había. */
export function cuerpoVerificado(cuerpo: string): string | null {
  return cuerpo.trim().slice(0, 8000) || null;
}

// ---------- Chat sobre una solicitud ----------

export const esquemaChatIA = z.object({
  respuesta: z.string(),
  /** Datos que faltan para responder mejor o para completar la comparación. */
  faltan: z.array(z.string()),
});
export type ChatIA = z.infer<typeof esquemaChatIA>;

export const SISTEMA_CHAT = `Sos el asistente de cotización de UNIQO para productores asesores de seguros de Argentina.
- Respondé en español rioplatense con voseo, claro y breve.
- Usá solo los datos de la solicitud que te pasan. Si falta algo para responder, ponelo en "faltan".
- Las respuestas sin confirmar todavía no cuentan en el comparativo: si las mencionás, aclaralo.
- No digas que enviaste correos ni que cambiaste algo: sugerís, y el productor decide.`;

export function textoDeChat(datos: ChatIA): string | null {
  const respuesta = datos.respuesta.trim().slice(0, 6000);
  if (!respuesta) return null;
  const faltan = datos.faltan.map((f) => f.trim()).filter(Boolean).slice(0, 10);
  return faltan.length ? `${respuesta}\n\nPara completar falta:\n${faltan.map((f) => `- ${f}`).join("\n")}` : respuesta;
}
