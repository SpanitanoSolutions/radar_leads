import { describe, expect, it } from "vitest";
import { elegirCandidato, mismaLocalidad, parecidoDeNombre } from "./coincidencia";
import { buscarCandidatos, candidatosDeRespuesta, contactoDeLugar } from "./places";
import { busquedasDeHoy } from ".";

// Respuestas simuladas con la forma de Places API (New): Text Search con los
// campos id, displayName, formattedAddress, addressComponents y businessStatus.
const RESPUESTA_TEXT_SEARCH = {
  places: [
    {
      id: "ChIJ-otro",
      displayName: { text: "Senderos Turismo" },
      formattedAddress: "Av. Colón 1234, B7600 Mar del Plata, Provincia de Buenos Aires, Argentina",
      addressComponents: [{ longText: "Mar del Plata", types: ["locality", "political"] }],
      businessStatus: "OPERATIONAL",
    },
    {
      id: "ChIJ-senderos",
      displayName: { text: "Senderos de la Costa S.A." },
      formattedAddress: "Rivadavia 2500, B7600 Mar del Plata, Provincia de Buenos Aires, Argentina",
      addressComponents: [
        { longText: "Mar del Plata", types: ["locality", "political"] },
        { longText: "General Pueyrredón", types: ["administrative_area_level_2", "political"] },
      ],
      businessStatus: "OPERATIONAL",
    },
  ],
};

const candidatos = candidatosDeRespuesta(RESPUESTA_TEXT_SEARCH);

describe("coincidencia con Google Maps", () => {
  it("compara las palabras que identifican a la empresa, sin el tipo societario", () => {
    expect(parecidoDeNombre("Senderos de la Costa S.A.", "Senderos de la Costa")).toBe(1);
    expect(parecidoDeNombre("SENDEROS DE LA COSTA S.A.", "Senderos Turismo")).toBe(0.5);
    expect(parecidoDeNombre("Gobblack SA", "Transporte Gobblack")).toBe(1);
    expect(parecidoDeNombre("Newport 4539 Mdq SA", "Newport4539 Desarrollos")).toBeCloseTo(2 / 3);
    expect(parecidoDeNombre("Feian SA", "Hogar Necochea")).toBe(0);
  });

  it("reconoce la misma localidad aunque Google diga el partido o una localidad vecina del mismo partido", () => {
    expect(mismaLocalidad("Mar del Plata", candidatos[1])).toBe(true);
    expect(mismaLocalidad("Batán", { direccion: "Ruta 88 km 8, Batán, General Pueyrredón", localidades: [] })).toBe(true);
    expect(mismaLocalidad("Tandil", candidatos[1])).toBe(false);
  });

  it("verificado: casi todo el nombre y la misma localidad; elige el mejor candidato", () => {
    expect(elegirCandidato({ empresa: "Senderos de la Costa S.A.", localidad: "Mar del Plata" }, candidatos)).toEqual({
      id: "ChIJ-senderos",
      estado: "verificado",
    });
  });

  it("posible: medio nombre en la misma localidad", () => {
    expect(
      elegirCandidato({ empresa: "Senderos del Sur SA", localidad: "Mar del Plata" }, [candidatos[0]]),
    ).toEqual({ id: "ChIJ-otro", estado: "posible" });
  });

  it("no guarda nada si la localidad no coincide, si el nombre no se parece o si el negocio cerró", () => {
    expect(elegirCandidato({ empresa: "Senderos de la Costa S.A.", localidad: "Tandil" }, candidatos)).toBeNull();
    expect(elegirCandidato({ empresa: "Gobblack SA", localidad: "Mar del Plata" }, candidatos)).toBeNull();
    expect(
      elegirCandidato({ empresa: "Senderos de la Costa S.A.", localidad: "Mar del Plata" }, [
        { ...candidatos[1], cerrado: true },
      ]),
    ).toBeNull();
  });

  it("sin localidad conocida no pasa de 'posible', y descarta CABA", () => {
    const lead = { empresa: "Senderos de la Costa S.A.", localidad: "Provincia de Buenos Aires" };
    expect(elegirCandidato(lead, [candidatos[1]])).toEqual({ id: "ChIJ-senderos", estado: "posible" });
    expect(
      elegirCandidato(lead, [{ ...candidatos[1], direccion: "Florida 100, C1005 Ciudad Autónoma de Buenos Aires, Argentina" }]),
    ).toBeNull();
  });
});

describe("cliente de Places API (New)", () => {
  it("Text Search: pide solo los campos necesarios, en español y para Argentina", async () => {
    const pedidos: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, init });
      return new Response(JSON.stringify(RESPUESTA_TEXT_SEARCH), { status: 200 });
    }) as unknown as typeof fetch;

    const resultado = await buscarCandidatos("Senderos de la Costa S.A.", "Mar del Plata", { apiKey: "k", fetch: fetchFalso });
    expect(resultado.map((c) => c.id)).toEqual(["ChIJ-otro", "ChIJ-senderos"]);
    expect(pedidos[0].url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(pedidos[0].init.headers).toMatchObject({
      "X-Goog-Api-Key": "k",
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus",
    });
    expect(JSON.parse(String(pedidos[0].init.body))).toEqual({
      textQuery: "Senderos de la Costa S.A., Mar del Plata, Buenos Aires, Argentina",
      languageCode: "es",
      regionCode: "AR",
      pageSize: 5,
    });
  });

  it("Place Details: devuelve el contacto sin cachear la respuesta", async () => {
    let init: RequestInit | undefined;
    const fetchFalso = (async (_url: string, i: RequestInit) => {
      init = i;
      return new Response(
        JSON.stringify({
          displayName: { text: "Senderos de la Costa" },
          nationalPhoneNumber: "0223 495-1234",
          internationalPhoneNumber: "+54 223 495-1234",
          websiteUri: "https://www.senderosdelacosta.com.ar/",
          formattedAddress: "Rivadavia 2500, Mar del Plata",
          googleMapsUri: "https://maps.google.com/?cid=1",
          userRatingCount: 37,
        }),
      );
    }) as unknown as typeof fetch;
    expect(await contactoDeLugar("ChIJ-senderos", { apiKey: "k", fetch: fetchFalso })).toEqual({
      nombre: "Senderos de la Costa",
      telefono: "0223 495-1234",
      telefonoInternacional: "+54 223 495-1234",
      web: "https://www.senderosdelacosta.com.ar/",
      direccion: "Rivadavia 2500, Mar del Plata",
      mapa: "https://maps.google.com/?cid=1",
      resenas: 37,
    });
    expect(init?.cache).toBe("no-store");
  });

  it("un error de Google se informa, no se traga", async () => {
    const fetchFalso = (async () => new Response("API key not valid", { status: 400 })) as unknown as typeof fetch;
    await expect(buscarCandidatos("X", "Y", { apiKey: "mala", fetch: fetchFalso })).rejects.toThrow(/400/);
  });
});

describe("límite diario de búsquedas", () => {
  it("cuenta las búsquedas de hoy según el registro de la última ejecución", () => {
    expect(busquedasDeHoy("2026-10-22:12", "2026-10-22")).toBe(12);
    expect(busquedasDeHoy("2026-10-21:50", "2026-10-22")).toBe(0); // otro día: arranca de cero
    expect(busquedasDeHoy(null, "2026-10-22")).toBe(0);
  });
});
