import { describe, expect, it } from "vitest";
import { ahoraDe, cuandoAviso, documentosPara, esNuevo, kpisSiniestros, textoReclamo, type SiniestroParaReglas } from "./siniestros";

const AHORA = new Date("2026-10-27T12:20:00-03:00");
const base: SiniestroParaReglas = {
  etapa: "aviso",
  fecha: new Date("2026-10-26T22:40:00-03:00"),
  creadoEl: new Date("2026-10-26T22:51:00-03:00"),
  avisoDe: "Carolina por WhatsApp",
  denuncia: null,
  denunciaEnviadaEl: null,
  ultimaNovedadCompaniaEl: null,
  reclamoEnviadoEl: null,
  recordatorioEnviadoEl: null,
  inspeccionEl: null,
  montoAprobado: null,
  montoPagado: null,
  pagadoEl: null,
  cerrado: false,
  cerradoEl: null,
  resolucion: null,
};
const ctx = { ahora: AHORA, compania: "Sancor", contacto: "Carolina" };

describe("documentación según el tipo", () => {
  it("auto con tercero, hogar por agua, robo y cristales", () => {
    expect(documentosPara("choque_tercero")).toContain("Datos y póliza del tercero");
    expect(documentosPara("agua")).toContain("Presupuesto del arreglo");
    expect(documentosPara("robo")).toContain("Denuncia policial");
    expect(documentosPara("cristales")).toContain("Fotos del cristal roto");
    expect(documentosPara("desconocido")).toEqual(documentosPara("otro"));
  });
});

describe("ahoraDe", () => {
  it("con la denuncia armada, pide aprobarla y enviarla", () => {
    const a = ahoraDe({ ...base, denuncia: [{ campo: "Causa", valor: "Filtración" }] }, ["Presupuesto del arreglo"], ctx);
    expect(a).toMatchObject({ tono: "accion", titulo: "La denuncia está lista para mandar a Sancor", acciones: ["enviarDenuncia", "editarDenuncia"] });
    expect(a.texto).toContain("Carolina avisó ayer a la noche por WhatsApp");
  });

  it("plazo de denuncia de 3 días desde el hecho", () => {
    const a = ahoraDe(
      { ...base, etapa: "documentacion", fecha: new Date("2026-10-25T17:50:00-03:00"), avisoDe: "Diego por WhatsApp", denunciaEnviadaEl: AHORA },
      ["Denuncia firmada por el asegurado"],
      { ...ctx, compania: "Mapfre" },
    );
    expect(a.tono).toBe("accion");
    expect(a.titulo).toBe("Falta un documento para presentar");
    expect(a.texto).toBe(
      "Diego mandó todo menos denuncia firmada por el asegurado. Mapfre la pide dentro de los 3 días del hecho y el plazo vence mañana.",
    );
    const vencido = ahoraDe({ ...base, etapa: "documentacion", fecha: new Date("2026-10-20T10:00:00-03:00") }, ["Fotos"], ctx);
    expect(vencido.tono).toBe("alerta");
  });

  it("más de 14 días sin novedades de la compañía propone reclamar", () => {
    const a = ahoraDe(
      {
        ...base,
        etapa: "compania",
        denunciaEnviadaEl: new Date("2026-10-13T09:10:00-03:00"),
        ultimaNovedadCompaniaEl: new Date("2026-10-12T15:40:00-03:00"),
      },
      [],
      { ...ctx, compania: "Federación Patronal" },
    );
    expect(a).toMatchObject({ tono: "alerta", titulo: "15 días sin novedades de la compañía", acciones: ["enviarReclamo", "verReclamo"] });
    const reciente = ahoraDe({ ...base, etapa: "compania", ultimaNovedadCompaniaEl: new Date("2026-10-20T10:00:00-03:00") }, [], ctx);
    expect(reciente.tono).toBe("espera");
  });

  it("inspección agendada, indemnización aprobada y cerrado", () => {
    expect(
      ahoraDe({ ...base, etapa: "inspeccion", inspeccionEl: new Date("2026-10-29T10:00:00-03:00") }, [], { ...ctx, contacto: "Raúl Benítez" })
        .titulo,
    ).toBe("Inspección agendada para el jueves 29/10 a las 10:00");
    expect(ahoraDe({ ...base, etapa: "liquidacion", montoAprobado: 1250000 }, [], { ...ctx, compania: "Mapfre" }).tono).toBe("ok");
    const cerrado = ahoraDe(
      {
        ...base,
        cerrado: true,
        fecha: new Date("2026-09-28T09:00:00-03:00"),
        cerradoEl: new Date("2026-10-06T16:00:00-03:00"),
        resolucion: "parabrisas reemplazado",
      },
      [],
      ctx,
    );
    expect(cerrado).toMatchObject({ titulo: "Cerrado · parabrisas reemplazado el 06/10", texto: "Trámite resuelto en 8 días." });
  });
});

describe("otras reglas", () => {
  it("cuándo avisó y si es nuevo", () => {
    expect(cuandoAviso(new Date("2026-10-27T08:15:00-03:00"), AHORA)).toBe("hoy a la mañana");
    expect(cuandoAviso(new Date("2026-10-12T15:40:00-03:00"), AHORA)).toBe("el 12/10");
    expect(esNuevo(base, AHORA)).toBe(true);
    expect(esNuevo({ ...base, creadoEl: new Date(AHORA.getTime() - 24 * 3_600_000) }, AHORA)).toBe(false);
    expect(esNuevo({ ...base, creadoEl: new Date(AHORA.getTime() + 1_000) }, AHORA)).toBe(false);
    expect(esNuevo({ ...base, denunciaEnviadaEl: AHORA }, AHORA)).toBe(false);
  });

  it("arma el reclamo con la firma pendiente", () => {
    const texto = textoReclamo(
      { numeroCompania: "FP-2026-310442", descripcion: "Choque en estacionamiento", fecha: new Date("2026-10-12T15:20:00-03:00"), denunciaEnviadaEl: new Date("2026-10-13T09:10:00-03:00") },
      "Escuela de Conducir Faro SRL",
    );
    expect(texto).toContain("siniestro FP-2026-310442 de Escuela de Conducir Faro SRL");
    expect(texto).toContain("completa desde el 13/10");
    expect(texto.endsWith("{productor}")).toBe(true);
  });

  it("KPIs: abiertos, atención, documentación y promedio de cierre de los últimos 6 meses", () => {
    const k = kpisSiniestros(
      [
        { cerrado: false, etapa: "aviso", aseguradoId: 1, atencion: true, fecha: AHORA, cerradoEl: null },
        { cerrado: false, etapa: "compania", aseguradoId: 2, atencion: false, fecha: AHORA, cerradoEl: null },
        { cerrado: true, etapa: "pago", aseguradoId: 3, atencion: false, fecha: new Date("2026-09-28T09:00:00-03:00"), cerradoEl: new Date("2026-10-06T16:00:00-03:00") },
        { cerrado: true, etapa: "pago", aseguradoId: 4, atencion: false, fecha: new Date("2026-09-04T08:00:00-03:00"), cerradoEl: new Date("2026-10-15T12:00:00-03:00") },
      ],
      AHORA,
    );
    expect(k).toEqual({ abiertos: 2, asegurados: 2, atencion: 1, juntandoDocumentacion: 1, promedioCierre: 25 });
  });
});
