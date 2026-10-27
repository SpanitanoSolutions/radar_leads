import type { CandidatoLugar } from "./coincidencia";

// Google Places API (New). Los términos de Google Maps Platform no permiten
// guardar el contenido de Places (teléfono, dirección, web, reseñas) salvo el
// place ID: se guarda solo el ID y los datos se piden en el momento de mostrarlos.

const BASE = "https://places.googleapis.com/v1/places";

type Fetch = typeof fetch;

type LugarTextSearch = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  businessStatus?: string;
};

/** Convierte la respuesta de Text Search en candidatos para evaluar la coincidencia. */
export function candidatosDeRespuesta(respuesta: { places?: LugarTextSearch[] }): CandidatoLugar[] {
  return (respuesta.places ?? []).map((p) => ({
    id: p.id,
    nombre: p.displayName?.text ?? "",
    direccion: p.formattedAddress ?? "",
    localidades: (p.addressComponents ?? [])
      .filter((c) => c.types?.some((t) => t === "locality" || t === "administrative_area_level_2" || t === "sublocality"))
      .map((c) => c.longText ?? ""),
    cerrado: p.businessStatus === "CLOSED_PERMANENTLY",
  }));
}

/** Busca la empresa por razón social y localidad (Text Search, campos Pro). */
export async function buscarCandidatos(
  empresa: string,
  localidad: string,
  { apiKey, fetch: pedir = fetch }: { apiKey: string; fetch?: Fetch },
): Promise<CandidatoLugar[]> {
  const respuesta = await pedir(`${BASE}:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus",
    },
    body: JSON.stringify({
      textQuery: `${empresa}, ${localidad}, Buenos Aires, Argentina`,
      languageCode: "es",
      regionCode: "AR",
      pageSize: 5,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuesta.ok) throw new Error(`Places Text Search respondió ${respuesta.status}: ${await respuesta.text()}`);
  return candidatosDeRespuesta(await respuesta.json());
}

export type ContactoGoogle = {
  nombre: string | null;
  telefono: string | null;
  telefonoInternacional: string | null;
  web: string | null;
  direccion: string | null;
  mapa: string | null;
  resenas: number | null;
};

type DetallesPlace = {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  userRatingCount?: number;
};

export function contactoDeRespuesta(d: DetallesPlace): ContactoGoogle {
  return {
    nombre: d.displayName?.text ?? null,
    telefono: d.nationalPhoneNumber ?? null,
    telefonoInternacional: d.internationalPhoneNumber ?? null,
    web: d.websiteUri ?? null,
    direccion: d.formattedAddress ?? null,
    mapa: d.googleMapsUri ?? null,
    resenas: d.userRatingCount ?? null,
  };
}

/**
 * Datos de contacto del lugar, pedidos cada vez que se muestran (Place
 * Details, campos Enterprise). No se guardan ni se cachean.
 */
export async function contactoDeLugar(
  placeId: string,
  { apiKey, fetch: pedir = fetch }: { apiKey: string; fetch?: Fetch },
): Promise<ContactoGoogle> {
  const respuesta = await pedir(`${BASE}/${encodeURIComponent(placeId)}?languageCode=es&regionCode=AR`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "displayName,nationalPhoneNumber,internationalPhoneNumber,websiteUri,formattedAddress,googleMapsUri,userRatingCount",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!respuesta.ok) throw new Error(`Places Details respondió ${respuesta.status}`);
  return contactoDeRespuesta(await respuesta.json());
}
