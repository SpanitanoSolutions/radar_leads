import { describe, expect, it } from "vitest";
import type { Lead, Sector } from "@/db/schema";
import { leadsVisibles } from "@/lib/filtros";
import { armarResumen, resumenEnHtml, resumenEnTexto, tituloResumen } from "./armar";
import { canalEmail, canalesDisponibles, urlDeLaApp } from "./canales";

const AHORA = new Date("2026-10-23T11:00:00Z"); // viernes 23/10, 8 h en Argentina
const HOY = "2026-10-23";
const AYER = new Date("2026-10-22T12:00:00Z");
const HACE_UNA_SEMANA = new Date("2026-10-16T12:00:00Z");

const sector: Sector = {
  id: "flotas",
  nombre: "Flotas",
  ejemplos: "",
  ramosTipicos: "",
  principal: true,
  activo: true,
  prioridad: "media",
  orden: 1,
};

let siguiente = 1;
const lead = (extra: Partial<Lead>) =>
  ({
    id: siguiente++,
    empresa: "Empresa",
    cuit: null,
    rubro: "Transporte de pasajeros",
    localidad: "Mar del Plata",
    zona: "mdp",
    sectorId: "flotas",
    motivo: "Sociedad nueva: transporte de pasajeros",
    descripcion: null,
    fuente: "Boletín Oficial PBA",
    fuenteUrl: null,
    fuenteReferencia: null,
    alcanceLicitacion: null,
    ramos: ["Flota"],
    scoreBase: 80,
    estado: "nuevo",
    nota: null,
    recordatorio: null,
    telefono: null,
    clave: "bo-pba:sociedad:x",
    textoClasificacion: null,
    fechaEvento: "2026-10-22",
    detectadoEl: AYER,
    esEjemplo: false,
    ...extra,
  }) as Lead;

const visibles = (leads: Lead[]) =>
  leadsVisibles(leads, [sector], { zonas: { mdp: true, costa: true, provincia: true }, licitaciones: { municipal: true, provincial: true, nacional: true } }, AHORA);

describe("armarResumen", () => {
  const leads = [
    lead({ empresa: "Vieja de score alto", scoreBase: 95, detectadoEl: HACE_UNA_SEMANA, fechaEvento: "2026-10-16" }),
    lead({ empresa: "Nueva A", scoreBase: 70, telefono: "(0223) 15-555-1234" }),
    lead({ empresa: "Nueva B", scoreBase: 85 }),
    lead({ empresa: "Ya llamada", scoreBase: 90, estado: "llamado" }),
    lead({ empresa: "Pospuesta", scoreBase: 90, recordatorio: "2026-10-30" }),
    lead({ empresa: "Recordar hoy", scoreBase: 60, estado: "llamado", recordatorio: HOY, nota: "Pidió que lo llame el viernes" }),
    lead({ empresa: "Recordatorio vencido", scoreBase: 60, estado: "reunion", recordatorio: "2026-10-20" }),
    lead({ empresa: "Cerrada con recordatorio", estado: "cerrado", recordatorio: HOY }),
  ];
  const r = armarResumen(visibles(leads), { dia: HOY, ahora: AHORA, productor: "Jorge Pérez" });

  it("los mejores: sin contactar ni posponer, primero los detectados en las últimas 24 h", () => {
    expect(r.mejores.map((i) => [i.empresa, i.nuevoHoy])).toEqual([
      ["Nueva B", true],
      ["Nueva A", true],
      ["Vieja de score alto", false],
    ]);
    expect(r.mejores[1]).toMatchObject({ telefono: "(0223) 15-555-1234", cuando: "Publicado ayer" });
    expect(r.mejores[0].guion).toMatch(/^Buen día, ¿cómo le va\? Le habla Jorge Pérez/);
  });

  it("los recordatorios de hoy y los vencidos de leads abiertos, el más viejo primero", () => {
    expect(r.recordatorios.map((x) => [x.empresa, x.vencido])).toEqual([
      ["Recordatorio vencido", true],
      ["Recordar hoy", false],
    ]);
    expect(r.recordatorios[1].nota).toBe("Pidió que lo llame el viernes");
  });

  it("como mucho cinco", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => lead({ empresa: `L${i}`, scoreBase: 70 + i }));
    expect(armarResumen(visibles(muchos), { dia: HOY, ahora: AHORA }).mejores).toHaveLength(5);
  });

  it("texto y HTML para el email, con enlaces a la ficha y el contenido escapado", () => {
    expect(tituloResumen(r)).toBe("Radar de leads · 23/10: 3 leads para hoy y 2 recordatorios");
    const texto = resumenEnTexto(r, "https://radar.example");
    expect(texto).toContain("• Nueva A (score 70)");
    expect(texto).toContain("Tel. (0223) 15-555-1234");
    expect(texto).toContain("Vencido (era para el 20/10)");
    expect(texto).toMatch(/https:\/\/radar\.example\/leads\/\d+/);
    const html = resumenEnHtml(
      armarResumen(visibles([lead({ empresa: "Pérez & Hijos <SRL>" })]), { dia: HOY, ahora: AHORA }),
      "https://radar.example",
    );
    expect(html).toContain("Pérez &amp; Hijos &lt;SRL&gt;");
    expect(html).not.toContain("<SRL>");
  });
});

describe("canales del resumen", () => {
  it("email con Resend: autenticación, destinatarios, asunto y cuerpo", async () => {
    const pedidos: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, init });
      return new Response(JSON.stringify({ id: "x" }));
    }) as unknown as typeof fetch;
    const canal = canalEmail({ apiKey: "re_123", destinos: ["papa@example.com"], remitente: "Radar <r@example.com>", fetch: fetchFalso });
    const resumen = armarResumen(visibles([lead({ empresa: "Gobblack SA" })]), { dia: HOY, ahora: AHORA });
    await canal.enviar(resumen, "https://radar.example");
    expect(pedidos[0].url).toBe("https://api.resend.com/emails");
    expect(pedidos[0].init.headers).toMatchObject({ Authorization: "Bearer re_123" });
    const cuerpo = JSON.parse(String(pedidos[0].init.body));
    expect(cuerpo).toMatchObject({ from: "Radar <r@example.com>", to: ["papa@example.com"], subject: tituloResumen(resumen) });
    expect(cuerpo.html).toContain("Gobblack SA");
    expect(cuerpo.text).toContain("Gobblack SA");
  });

  it("si Resend responde con error, el envío falla", async () => {
    const fetchFalso = (async () => new Response("invalid api key", { status: 401 })) as unknown as typeof fetch;
    const canal = canalEmail({ apiKey: "x", destinos: ["a@b.c"], remitente: "r", fetch: fetchFalso });
    await expect(canal.enviar(armarResumen([], { dia: HOY }), "")).rejects.toThrow(/401/);
  });

  it("sin key o sin destinatario no hay canal: el resumen solo se muestra en /resumen", () => {
    expect(canalesDisponibles({})).toEqual([]);
    expect(canalesDisponibles({ RESEND_API_KEY: "re_1" })).toEqual([]);
    const [canal] = canalesDisponibles({ RESEND_API_KEY: "re_1", RESUMEN_EMAIL_DESTINO: "a@b.com, c@d.com" });
    expect(canal.nombre).toBe("email a a@b.com, c@d.com");
  });

  it("URL de la app para los enlaces", () => {
    expect(urlDeLaApp({ APP_URL: "https://radar.example/" })).toBe("https://radar.example");
    expect(urlDeLaApp({ VERCEL_PROJECT_PRODUCTION_URL: "radar-leads-pink.vercel.app" })).toBe(
      "https://radar-leads-pink.vercel.app",
    );
    expect(urlDeLaApp({})).toBe("");
  });
});
