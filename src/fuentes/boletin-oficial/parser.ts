import {
  calcularScoreBase,
  clasificar,
  esCuitDeEmpresa,
  fechaLegible,
  formatearCuit,
  normalizar,
  oracion,
  quitarDatosPersonales,
  ramosTransferencia,
  recortar,
  tituloPropio,
} from "../clasificacion";
import { buscarLugar, zonaDeLocalidad } from "../localidades";
import type { LeadCapturado } from "../tipos";

// Boletín Oficial de la Provincia de Buenos Aires: una edición por día hábil,
// en PDF. De la Sección Oficial se toman las constituciones de sociedades (SA,
// SRL, SAS…) y las transferencias de fondo de comercio a una sociedad.
//
// Los avisos traen nombres, DNI y domicilios de socios y vendedores: de cada
// aviso se guarda solo la razón social, la localidad de la sede o del local y
// el objeto o rubro (Ley 25.326).

export const URL_BOLETIN = "https://boletinoficial.gba.gob.ar";
export const FUENTE = "Boletín Oficial PBA";

export type Edicion = { numero: number; fecha: string; urlOficial: string };

/** Ediciones del listado "Ediciones anteriores", de la más nueva a la más vieja. */
export function leerEdiciones(html: string): Edicion[] {
  const ediciones: Edicion[] = [];
  const bloques = html.split(/BOLET[ÍI]N N° /).slice(1);
  for (const bloque of bloques) {
    const cabecera = /^(\d+) - (\d{2})\/(\d{2})\/(\d{4})/.exec(bloque);
    const oficial = /OFICIAL<\/h5>[\s\S]*?href="(\/secciones\/\d+\/ver)"/.exec(bloque);
    if (!cabecera || !oficial) continue;
    const numero = Number(cabecera[1]);
    if (ediciones.some((e) => e.numero === numero)) continue;
    ediciones.push({
      numero,
      fecha: `${cabecera[4]}-${cabecera[3]}-${cabecera[2]}`,
      urlOficial: URL_BOLETIN + oficial[1],
    });
  }
  return ediciones.sort((a, b) => b.numero - a.numero);
}

/** Marca de comienzo de página que la captura agrega al texto de cada página del PDF. */
export const MARCA_PAGINA = /^=====PAGINA (\d+)$/;

export function marcaDePagina(numero: number): string {
  return `=====PAGINA ${numero}`;
}

/** Quita encabezados y pies de página que cortan los avisos (las marcas de página quedan). */
export function limpiarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/BOLET[ÍI]N OFICIAL DE LA PROVINCIA DE BUENOS AIRES\n[^\n]*>[^\n]*\nSECCI[ÓO]N OFICIAL > p[áa]gina \d+\n?/g, "")
    .replace(/^Secci[óo]n\s*\n?Oficial(?=\n|◢)/gm, "");
}

/** Página en que termina un texto, según la última marca de página que contiene. */
function ultimaPagina(texto: string, actual: number): number {
  let pagina = actual;
  for (const m of texto.matchAll(/^=====PAGINA (\d+)$/gm)) pagina = Number(m[1]);
  return pagina;
}

export type Seccion = { texto: string; pagina: number };

/** Secciones del boletín ("SOCIEDADES", "TRANSFERENCIAS"…) con su texto y la página donde empiezan. */
export function separarSecciones(texto: string): Map<string, Seccion> {
  const secciones = new Map<string, Seccion>();
  const [antes, ...partes] = limpiarTexto(texto).split("◢");
  let pagina = ultimaPagina(antes, 1);
  for (const parte of partes) {
    const salto = parte.indexOf("\n");
    const titulo = parte.slice(0, salto).trim().toUpperCase();
    const previa = secciones.get(titulo);
    secciones.set(titulo, {
      texto: (previa?.texto ?? "") + parte.slice(salto + 1),
      pagina: previa?.pagina ?? pagina,
    });
    pagina = ultimaPagina(parte, pagina);
  }
  return secciones;
}

export type Aviso = { titulo: string | null; texto: string; pagina: number };

const INICIO_AVISO = /^POR \d+ D[ÍI]AS? ?-/;

/** Une las líneas del PDF en un párrafo, reparando palabras cortadas con guión. */
function unirLineas(lineas: string[]): string {
  return lineas
    .join("\n")
    .replace(/([a-záéíóúñ])-\n([a-záéíóúñ])/g, "$1$2")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/**
 * Separa una sección en avisos. Cada aviso empieza con "POR N DÍA(S) -"; en
 * Sociedades la línea anterior es la razón social. Cada aviso recuerda la
 * página del PDF donde empieza.
 */
export function separarAvisos(seccion: Seccion, conTitulo: boolean): Aviso[] {
  const avisos: { titulo: string | null; lineas: string[]; pagina: number }[] = [];
  let pagina = seccion.pagina;
  const lineas = seccion.texto.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const linea of lineas) {
    const marca = MARCA_PAGINA.exec(linea);
    if (marca) {
      pagina = Number(marca[1]);
    } else if (INICIO_AVISO.test(linea)) {
      const anterior = avisos.at(-1);
      const titulo = conTitulo ? (anterior ? anterior.lineas.pop() : undefined) ?? null : null;
      avisos.push({ titulo, lineas: [linea], pagina });
    } else if (avisos.length) {
      avisos.at(-1)!.lineas.push(linea);
    } else if (conTitulo) {
      // Razón social del primer aviso de la sección.
      avisos.push({ titulo: null, lineas: [linea], pagina });
    }
  }
  return avisos
    .filter((a) => INICIO_AVISO.test(a.lineas[0] ?? ""))
    .map((a) => ({ titulo: a.titulo, texto: unirLineas(a.lineas), pagina: a.pagina }));
}

/**
 * Puntos de un edicto numerado ("1) socios… 2) fecha…", "1- …", "1. …").
 * No corta en "un (1) director" ni en fechas como "1-9-26".
 */
export function itemsNumerados(texto: string): string[] {
  return texto
    .split(/(?:^|[\s;,])\d{1,2}\s?(?:\)\s*|[-.]\s+)(?!\d{6})/)
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Puntos que hablan de una persona (socios, autoridades): nunca se usan. */
const DATOS_DE_PERSONA =
  /\b(D\.?\s?N\.?\s?I|CUI[TL]\s*:?\s*2[0347]|nacid[oa]|solter[oa]|casad[oa]|divorciad[oa]|viud[oa]|domiciliad[oa]|dom(icilio|\.)? real|hij[oa] de)/i;

const NO_ES_CONSTITUCION =
  /\b(asamblea|reunion de socios|acta de (directorio|reunion)|renuncia\w*|designa\w*|reforma\w*|aumento de capital|cambio de (sede|domicilio)|disolu\w*|disolver|liquidac\w*|cesion de cuotas|prorroga\w*|transformacion|fusion)\b/;

/** ¿El aviso publica la constitución de una sociedad nueva? */
export function esConstitucion(texto: string): boolean {
  const t = normalizar(texto);
  const inicio = t.slice(0, 260);
  if (/\b(complementari\w*|rectific\w*|subsana\w*|modificacion|fe de erratas)\b/.test(inicio)) return false;
  if (NO_ES_CONSTITUCION.test(inicio)) return false;

  // "Se constituyó…", "Constitución:", "Const. SRL", "constituyen el 23/09/2026 'X SA'";
  // no "constituyen domicilio especial" ni la calle "Constitución 1234".
  for (const m of t.slice(0, 700).matchAll(/\b(constitu\w*|const\. ?(de )?(soc\w*|s\.?r\.?l|s\.?a\.?s?)\b|se const\.)/g)) {
    const despues = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
    if (!/^\s*(domicilio|dom\.|\d|n\s?[°º])/.test(despues)) return true;
  }

  // Muchos edictos no lo dicen: listan socios, objeto, capital y plazo (art. 10 LGS),
  // a veces solo numerados.
  const tienePlazo = /\b(duracion|plazo)\b|\b\d+ anos\b/.test(t);
  if (/\bobjeto\b/.test(t) && /\bcapital\b/.test(t) && tienePlazo) return true;
  return tienePlazo && itemsNumerados(texto).length >= 5;
}

/** Texto del objeto social, sin datos de personas. */
export function extraerObjeto(texto: string): string | null {
  const m =
    /\bobjeto(?: social)?\s*[:.-]?\s*(.{15,}?)(?=\s\d{1,2}\s?[-)°.]\s|\s\d{1,2}\)|\b(?:capital|duraci[óo]n|plazo|administraci[óo]n|direcci[óo]n|sede|domicilio)\b|$)/i.exec(
      texto,
    );
  let objeto = m?.[1];
  if (!objeto) {
    // Edicto numerado sin la palabra "objeto": es el punto más largo que no habla de personas.
    objeto = itemsNumerados(texto)
      .filter((i) => !DATOS_DE_PERSONA.test(i))
      .sort((a, b) => b.length - a.length)[0];
    if (!objeto || objeto.length < 60) return null;
  }
  return quitarDatosPersonales(objeto).replace(/[\s,;:.-]+$/, "") || null;
}

/** Fragmento del aviso que describe la sede o el domicilio social. */
export function extraerSede(texto: string): string | null {
  const m =
    /\b(?:sede(?: social)?|domicilio (?:social|legal|de la sociedad)|dom\. social)\s*[:.-]?\s*(?:en\s+)?(?:(?:la )?calle\s+)?(.{4,200}?)(?=\.\s|;|\s\d{1,2}\s?[-)]\s|$)/i.exec(
      texto,
    );
  if (m && buscarLugar(m[1])) return m[1];
  // Edicto numerado: el primer punto con una dirección que no sea la de un socio.
  return (
    itemsNumerados(texto).find(
      (i) => i.length <= 200 && /\d/.test(i) && !DATOS_DE_PERSONA.test(i) && buscarLugar(i) !== null,
    ) ??
    m?.[1] ??
    null
  );
}

const SOCIEDAD =
  /(?:\bS\.?\s?A\.?\s?S\.?|\bS\.?\s?R\.?\s?L\.?|\bS\.?\s?A\.?\s?U\.?|\bS\.?\s?C\.?\s?S\.?|\bS\.?\s?A\.?|Sociedad (?:An[óo]nima|de Responsabilidad (?:Limitada|Ltda\.?)|por Acciones Simplificada|en Comandita\b[^,;]*)|Cooperativa\b[^,;]*)\s*$/i;

/** ¿Es la razón social de una sociedad (y no el nombre de una persona)? */
export function esRazonSocial(nombre: string): boolean {
  return SOCIEDAD.test(nombre.replace(/[\s"”“-]+$/g, "").replace(/-?en formaci[óo]n-?$/i, "").trim());
}

/** "POR 5 DÍAS - Gral. San Martín. La firma…" → "Gral. San Martín". */
export function localidadDeEncabezado(texto: string): string | null {
  const resto = texto.replace(INICIO_AVISO, "").trim();
  const partes = resto.split(/\.\s+/);
  let localidad = partes[0];
  for (let i = 1; i < partes.length && /\b(Gral|Cnel|Pte|Alte|Dr|Ing|Sta|Pdo|Cdro|V)$/.test(localidad); i++) {
    localidad += `. ${partes[i]}`;
  }
  localidad = localidad.trim();
  return localidad.length > 1 && localidad.length <= 40 ? localidad : null;
}

/** Sociedad que compra el fondo de comercio, o null si el comprador es una persona. */
export function compradorDeTransferencia(texto: string): { nombre: string; cuit: string | null } | null {
  const verbo = /\b(transfiere|tranfiere|transfieren|cede|ceden|vende|venden)\b/i.exec(texto);
  if (!verbo) return null;
  const resto = texto.slice(verbo.index);
  const candidato =
    /(?:\ba favor de|\s+a)\s+(?:la (?:firma|sociedad|empresa)\s+)?["“]?([A-ZÁÉÍÓÚÑ0-9][^,;:"”]{1,90}?)["”]?(?=,|\s+CUIT|\s+con domicilio|\s+el fondo|\s+la habilitaci|\s+representad|\s+-|\s+\(|\.\s|$)/.exec(
      resto,
    );
  if (!candidato) return null;
  const nombre = candidato[1].trim();
  if (!esRazonSocial(nombre)) return null;
  const despues = resto.slice(candidato.index + candidato[0].length, candidato.index + candidato[0].length + 40);
  const cuit = /CUIT\s*(?:N\s?[°º]\s*)?:?\s*([\d-\s]{11,15})/.exec(despues);
  const cuitFormateado = cuit ? formatearCuit(cuit[1]) : null;
  return {
    nombre: nombre.replace(/\s*-?en formaci[óo]n-?$/i, "").trim(),
    cuit: cuitFormateado && esCuitDeEmpresa(cuitFormateado) ? cuitFormateado : null,
  };
}

/** Rubro del fondo de comercio transferido. */
export function rubroDeTransferencia(texto: string): string | null {
  const fin = String.raw`(?=,|;|\.\s|\s+denominad|\s+a favor|\s+sit[oa]\b|\s+sitio\b|\s+ubicad|\s+cuya|\s+con domicilio|\s+en (?:la )?(?:calle|av\.?|avenida)\b|$)`;
  const m =
    new RegExp(String.raw`\brubros?\s*:?\s*(.{3,120}?)` + fin, "i").exec(texto) ??
    new RegExp(String.raw`\bfondo de comercio (?:de|del rubro)\s+(.{3,80}?)` + fin, "i").exec(texto);
  return m ? oracion(quitarDatosPersonales(m[1]).replace(/[\s,;:.-]+$/, "")) : null;
}

/**
 * Enlace a la página exacta del aviso en el PDF (los navegadores abren el
 * PDF en esa página con #page=N) y cómo encontrarlo a mano.
 */
export function ubicacionDelAviso(aviso: Aviso, edicion: Edicion, seccion: string) {
  return {
    fuenteUrl: `${edicion.urlOficial}#page=${aviso.pagina}`,
    fuenteReferencia:
      `Boletín Oficial N° ${edicion.numero} del ${fechaLegible(edicion.fecha)} · Sección Oficial · ` +
      `${seccion} · página ${aviso.pagina}`,
  };
}

function claveDe(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function sociedadALead(aviso: Aviso, edicion: Edicion, seccion = "Sociedades"): LeadCapturado | null {
  if (!aviso.titulo || !esConstitucion(aviso.texto)) return null;
  const empresa = tituloPropio(aviso.titulo.replace(/[“”"]/g, ""));
  const objeto = extraerObjeto(aviso.texto);
  const sede = extraerSede(aviso.texto);
  const lugar = sede ? buscarLugar(sede) : null;
  const localidad = lugar?.nombre ?? "Provincia de Buenos Aires";
  const zona = lugar?.zona ?? "provincia";
  // La razón social también cuenta: "Transporte…", "Construcciones…".
  const c = clasificar(objeto ?? aviso.texto, { nombre: empresa });
  const sector = c.sector;
  const cuit = /\bCUIT\s*:?\s*(3[034]-?\s?\d{8}-?\s?\d)/.exec(aviso.texto.slice(0, 300));

  return {
    clave: `bo-pba:sociedad:${claveDe(empresa)}`,
    empresa,
    cuit: cuit ? formatearCuit(cuit[1]) : null,
    rubro: c.rubro,
    localidad,
    zona,
    sectorId: sector,
    // Solo el objeto social: el resto del edicto trae datos de los socios.
    textoClasificacion: objeto,
    motivo: `Sociedad nueva: ${c.rubro.toLowerCase()}`,
    descripcion:
      `Publicó su constitución en el Boletín Oficial de la Provincia el ${fechaLegible(edicion.fecha)}` +
      (lugar ? `, con sede en ${localidad}` : "") +
      `. Una empresa recién creada necesita contratar sus seguros antes de empezar a operar.` +
      (objeto ? ` Objeto: ${recortar(objeto, 400)}` : ""),
    fuente: FUENTE,
    ...ubicacionDelAviso(aviso, edicion, seccion),
    fechaEvento: edicion.fecha,
    ramos: c.ramos,
    scoreBase: calcularScoreBase("sociedad", { sector, zona }),
  };
}

export function transferenciaALead(aviso: Aviso, edicion: Edicion): LeadCapturado | null {
  const comprador = compradorDeTransferencia(aviso.texto);
  if (!comprador) return null;
  const empresa = tituloPropio(comprador.nombre);
  const encabezado = localidadDeEncabezado(aviso.texto);
  const localidad = encabezado ? tituloPropio(encabezado) : "Provincia de Buenos Aires";
  const zona = zonaDeLocalidad(localidad);
  const rubro = rubroDeTransferencia(aviso.texto);
  const c = clasificar(rubro ?? aviso.texto, { nombre: empresa });
  const sector = c.sector;

  return {
    clave: `bo-pba:transferencia:${claveDe(empresa)}:${claveDe(localidad)}`,
    empresa,
    cuit: comprador.cuit,
    rubro: rubro ? recortar(rubro, 60) : c.rubro,
    localidad,
    zona,
    sectorId: sector,
    textoClasificacion: rubro,
    motivo: "Compró un fondo de comercio",
    descripcion:
      `Publicó la compra de un fondo de comercio${rubro ? ` (${recortar(rubro, 120).toLowerCase()})` : ""} en ` +
      `${localidad} en el Boletín Oficial de la Provincia el ${fechaLegible(edicion.fecha)}. ` +
      `Con el cambio de dueño hay que rehacer los seguros del local y la ART del personal.`,
    fuente: FUENTE,
    ...ubicacionDelAviso(aviso, edicion, "Transferencias"),
    fechaEvento: edicion.fecha,
    ramos: ramosTransferencia(c),
    scoreBase: calcularScoreBase("transferencia", { sector, zona }),
  };
}

/** Leads de una edición a partir del texto de su Sección Oficial. */
export function leadsDeBoletin(texto: string, edicion: Edicion): LeadCapturado[] {
  const secciones = separarSecciones(texto);
  const leads: LeadCapturado[] = [];
  for (const [titulo, contenido] of secciones) {
    if (titulo.startsWith("SOCIEDADES")) {
      const seccion = titulo === "SOCIEDADES" ? "Sociedades" : "Sociedades por Acciones Simplificadas";
      for (const aviso of separarAvisos(contenido, true)) {
        const lead = sociedadALead(aviso, edicion, seccion);
        if (lead) leads.push(lead);
      }
    } else if (titulo === "TRANSFERENCIAS") {
      for (const aviso of separarAvisos(contenido, false)) {
        const lead = transferenciaALead(aviso, edicion);
        if (lead) leads.push(lead);
      }
    }
  }
  return leads;
}
