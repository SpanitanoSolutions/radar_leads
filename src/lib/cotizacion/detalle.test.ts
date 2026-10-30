import { describe, expect, it } from "vitest";
import {
  archivosPorCompania,
  atencionDeLaSolicitud,
  borradorVisible,
  pasosDeLaSolicitud,
  proximoSeguimiento,
  seguimientosActivos,
  tablaContactos,
  textoProximo,
  textoTabulado,
  type ContextoEnvios,
  type EnvioDetalle,
} from "./detalle";

const base: EnvioDetalle = {
  id: 1, compania: "Sancor", estado: "pendiente", estadoBorrador: "pendiente", canalUsado: null, numeroCompania: null,
  folio: null, paqueteId: null, ultimoError: null, preguntasPendientes: null, intentos: [], proximoSeguimiento: null,
  cantidadSeguimientos: 0, ultimaActividad: new Date("2026-10-30T13:00:00Z"),
};
const envio = (cambios: Partial<EnvioDetalle>): EnvioDetalle => ({ ...base, ...cambios });
const ctxVacio = (): ContextoEnvios => ({ cotizando: new Set(), sinEnviar: new Set(), consultas: new Map(), nombrePaquete: new Map(), resultados: new Map() });

// 4/11/2026 a las 00:00 de Argentina, como guarda el próximo seguimiento.
const miercoles = new Date("2026-11-04T03:00:00Z");

describe("Contactos: borrador y próximo seguimiento", () => {
  it("dice qué pasa con el correo de cada compañía", () => {
    const ctx = ctxVacio();
    ctx.sinEnviar.add(3);
    ctx.cotizando.add(4);
    expect(borradorVisible(envio({ id: 1 }), ctx)).toBe("Para aprobar");
    expect(borradorVisible(envio({ id: 2, estadoBorrador: "aprobado" }), ctx)).toBe("Aprobado y enviado");
    expect(borradorVisible(envio({ id: 3, estadoBorrador: "aprobado" }), ctx)).toBe("Aprobado · sin enviar");
    expect(borradorVisible(envio({ id: 4 }), ctx)).toBe("Esperá la cotización automática");
    expect(borradorVisible(envio({ id: 5, estadoBorrador: "omitido", canalUsado: "portal" }), ctx)).toBe("No hace falta");
    expect(borradorVisible(envio({ id: 6, estadoBorrador: "omitido" }), ctx)).toBe("Omitido");
  });

  it("el próximo seguimiento es el del correo o la consulta de una cotización que tarda, en el día argentino", () => {
    const ctx = ctxVacio();
    ctx.consultas.set(2, miercoles);
    expect(proximoSeguimiento(envio({ id: 1, estado: "enviado", proximoSeguimiento: miercoles }), ctx)).toEqual({ dia: "2026-11-04", tipo: "seguimiento" });
    expect(proximoSeguimiento(envio({ id: 2, estado: "enviado", canalUsado: "api" }), ctx)).toEqual({ dia: "2026-11-04", tipo: "consulta" });
    expect(textoProximo({ dia: "2026-11-04", tipo: "consulta" })).toBe("04/11/2026 · consulta a la compañía");
    expect(textoProximo(null)).toBe("—");
  });

  it("no hay próximo seguimiento si la compañía ya respondió, rechazó o se está cotizando", () => {
    const ctx = ctxVacio();
    ctx.resultados.set(1, { envioId: 1, primaTotal: 100, confirmado: false });
    ctx.cotizando.add(3);
    expect(proximoSeguimiento(envio({ id: 1, estado: "enviado", proximoSeguimiento: miercoles }), ctx)).toBeNull();
    expect(proximoSeguimiento(envio({ id: 2, estado: "rechazado", proximoSeguimiento: miercoles }), ctx)).toBeNull();
    expect(proximoSeguimiento(envio({ id: 3, proximoSeguimiento: miercoles }), ctx)).toBeNull();
  });

  it("la tabla para Copiar y Excel lleva las columnas de la spec, sin tabuladores ni saltos dentro de una celda", () => {
    const ctx = ctxVacio();
    ctx.nombrePaquete.set(9, "Terceros completo");
    const filas = tablaContactos([
      envio({ id: 1, paqueteId: 9, estado: "en_seguimiento", estadoBorrador: "aprobado", cantidadSeguimientos: 1, proximoSeguimiento: miercoles, folio: "F-1" }),
      envio({ id: 2, compania: "Rivadavia", estado: "requiere_atencion", preguntasPendientes: "¿Uso\tdel vehículo?" }),
    ], ctx);
    expect(filas[0]).toEqual(["Aseguradora", "Estado", "Borrador", "Folio", "Paquete", "Próximo seguimiento", "Seguimientos", "Preguntas", "Última actividad"]);
    expect(filas[1]).toEqual(["Sancor", "En seguimiento", "Aprobado y enviado", "F-1", "Terceros completo", "04/11/2026", "1", "", "30/10 10:00"]);
    // La pregunta va en su columna y no se repite en el estado.
    expect(filas[2].slice(0, 2)).toEqual(["Rivadavia", "Requiere atención"]);
    const texto = textoTabulado(filas);
    expect(texto.split("\n")).toHaveLength(3);
    expect(texto.split("\n")[2].split("\t")[7]).toBe("¿Uso del vehículo?");
  });
});

describe("panel del detalle", () => {
  it("Requiere atención junta lo que espera algo del productor", () => {
    const ctx = ctxVacio();
    ctx.resultados.set(1, { envioId: 1, primaTotal: 100, confirmado: false });
    ctx.sinEnviar.add(3);
    ctx.cotizando.add(6);
    const avisos = atencionDeLaSolicitud([
      envio({ id: 1, compania: "Sancor", estado: "enviado", estadoBorrador: "omitido" }),
      envio({ id: 2, compania: "Rivadavia", estado: "requiere_atencion", preguntasPendientes: "¿Uso del vehículo?" }),
      envio({ id: 3, compania: "La Segunda", estadoBorrador: "aprobado", ultimoError: "No salió: tu correo no está conectado." }),
      envio({ id: 4, compania: "Mapfre" }),
      envio({ id: 5, compania: "Allianz" }),
      envio({ id: 6, compania: "Zurich" }),
      envio({ id: 7, compania: "Meridional", estado: "requiere_atencion", estadoBorrador: "aprobado" }),
    ], ctx);
    expect(avisos).toEqual([
      { compania: "Sancor", motivo: "Respondió: falta tu confirmación.", pestana: "cotizaciones" },
      { compania: "Rivadavia", motivo: "Pide un dato: ¿Uso del vehículo?", pestana: "contactos" },
      { compania: "La Segunda", motivo: "No salió: tu correo no está conectado.", pestana: "contactos" },
      { compania: "Meridional", motivo: "Llegó al máximo de seguimientos sin responder.", pestana: "contactos" },
      { compania: null, motivo: "2 correos esperan tu aprobación.", pestana: "contactos" },
    ]);
  });

  it("los seguimientos activos van del más próximo al más lejano", () => {
    const ctx = ctxVacio();
    ctx.consultas.set(2, new Date("2026-11-02T03:00:00Z"));
    const activos = seguimientosActivos([
      envio({ id: 1, compania: "Sancor", estado: "en_seguimiento", cantidadSeguimientos: 1, proximoSeguimiento: miercoles }),
      envio({ id: 2, compania: "San Cristóbal", estado: "enviado", canalUsado: "api" }),
      envio({ id: 3, compania: "Mapfre", estado: "cotizado", proximoSeguimiento: miercoles }),
    ], ctx, 3);
    expect(activos.map((a) => [a.compania, a.proximo.dia, a.proximo.tipo, `${a.cantidad} de ${a.maximo}`])).toEqual([
      ["San Cristóbal", "2026-11-02", "consulta", "0 de 3"],
      ["Sancor", "2026-11-04", "seguimiento", "1 de 3"],
    ]);
  });

  it("los archivos se agrupan por compañía y paquete, primero los de la solicitud", () => {
    const grupos = archivosPorCompania(
      [{ id: 1, envioId: 2 }, { id: 2, envioId: null }, { id: 3, envioId: 1 }, { id: 4, envioId: 2 }],
      [{ id: 1, compania: "Sancor", paqueteId: 9 }, { id: 2, compania: "Mapfre", paqueteId: null }],
      new Map([[9, "Terceros completo"]]),
    );
    expect(grupos.map((g) => [g.titulo, g.archivos.map((a) => a.id)])).toEqual([
      ["De la solicitud", [2]],
      ["Mapfre", [1, 4]],
      ["Sancor · Terceros completo", [3]],
    ]);
  });
});

describe("línea de tiempo de la pestaña Agente", () => {
  const solicitud = { creadoEl: new Date("2026-10-28T12:00:00Z"), ramo: "Automotor", tipo: "negocio_nuevo", estado: "esperando", completadoEl: null };

  it("recién creada: los pasos de preparación hechos y lo demás pendiente", () => {
    const pasos = pasosDeLaSolicitud({ solicitud, envios: [envio({ id: 1 }), envio({ id: 2, compania: "Mapfre", paqueteId: 3 })], eventos: [], propuestas: [], ctx: ctxVacio() });
    expect(pasos.map((p) => [p.titulo, p.estado])).toEqual([
      ["Crear la solicitud", "hecho"],
      ["Elegir las aseguradoras", "hecho"],
      ["Preparar los pedidos", "hecho"],
      ["Pedir las cotizaciones", "pendiente"],
      ["Recibir las respuestas", "pendiente"],
      ["Revisar y comparar", "pendiente"],
      ["Propuesta para el cliente", "pendiente"],
      ["Cerrar la solicitud", "pendiente"],
    ]);
    expect(pasos[1].detalle).toBe("2 aseguradoras del ramo · 1 con paquete");
  });

  it("con respuestas, propuesta y la solicitud completada", () => {
    const ctx = ctxVacio();
    ctx.resultados.set(1, { envioId: 1, primaTotal: 912000, confirmado: true });
    ctx.resultados.set(2, { envioId: 2, primaTotal: 950000, confirmado: false });
    const autorizada = new Date("2026-10-29T12:00:00Z");
    const pasos = pasosDeLaSolicitud({
      solicitud: { ...solicitud, completadoEl: new Date("2026-10-30T12:00:00Z") },
      envios: [
        envio({ id: 1, estado: "cotizado", canalUsado: "api", estadoBorrador: "omitido" }),
        envio({ id: 2, compania: "Mapfre", estado: "enviado", canalUsado: "correo", estadoBorrador: "aprobado" }),
      ],
      eventos: [{ tipo: "cotizacion_autorizada", fecha: autorizada }],
      propuestas: [{ estado: "borrador", creadoEl: new Date("2026-10-30T10:00:00Z") }],
      ctx,
    });
    const porTitulo = Object.fromEntries(pasos.map((p) => [p.titulo, p]));
    expect(porTitulo["Pedir las cotizaciones"]).toMatchObject({ estado: "hecho", fecha: autorizada });
    expect(porTitulo["Recibir las respuestas"]).toMatchObject({ estado: "hecho", detalle: "2 de 2 respondieron." });
    expect(porTitulo["Revisar y comparar"].estado).toBe("en_curso");
    expect(porTitulo["Revisar y comparar"].detalle).toMatch(/^Mejor precio: Sancor, \$\s?912\.000 · 1 respuesta espera tu confirmación\.$/);
    expect(porTitulo["Propuesta para el cliente"].estado).toBe("en_curso");
    expect(porTitulo["Cerrar la solicitud"]).toMatchObject({ estado: "hecho", detalle: "Completada." });
  });
});
