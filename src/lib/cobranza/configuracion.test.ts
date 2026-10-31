import { describe, expect, it } from "vitest";
import { aplicarCambios, CONFIG_POR_DEFECTO, combinar, filaDeConfig, resolverConfigCobranza } from "./configuracion";
import { rangoDeTramo, idParaTramo, tramoDe, TRAMOS_POR_DEFECTO } from "./tramos";

describe("configuración de Cobranza", () => {
  it("sin fila usa los valores de la spec, con el modo prueba prendido", () => {
    const c = resolverConfigCobranza(null);
    expect(c.modoPrueba).toBe(true);
    expect(c.pedirAprobacion).toBe(true);
    expect(c.maxIntentos).toBe(5);
    expect(c.diasGraciaPromesa).toBe(3);
    expect(c.horaEjecucion).toBe("10:00");
    expect(c.diasPermitidos).toEqual([1, 2, 3, 4, 5]);
    expect([c.ventanaDesde, c.ventanaHasta]).toEqual(["09:00", "18:00"]);
    expect(c.tramos.map((t) => t.id)).toEqual(["por_vencer_lejos", "por_vencer", "vencido_reciente", "vencido_urgente", "vencido_critico"]);
    expect(c.canales.telefono.habilitado).toBe(false);
  });

  it("no comparte objetos con los valores por defecto", () => {
    const c = resolverConfigCobranza(null);
    c.tramos[0].nombre = "cambiado";
    c.filtros.companias.push("Sancor");
    expect(CONFIG_POR_DEFECTO.tramos[0].nombre).toBe("Por vencer en más de 15 días");
    expect(resolverConfigCobranza({}).filtros.companias).toEqual([]);
  });

  it("una fila pisa solo lo que tiene cargado; lo inválido vuelve al valor por defecto", () => {
    const c = resolverConfigCobranza({ maxIntentos: 3, horaEjecucion: "25:00", zonaHoraria: "Marte/Olympus", modoPrueba: false, canales: { email: { habilitado: false } } });
    expect(c.maxIntentos).toBe(3);
    expect(c.horaEjecucion).toBe("10:00");
    expect(c.zonaHoraria).toBe("America/Argentina/Buenos_Aires");
    expect(c.modoPrueba).toBe(false);
    expect(c.canales.email.habilitado).toBe(false);
    expect(c.canales.email.instrucciones).toBe(CONFIG_POR_DEFECTO.canales.email.instrucciones);
    expect(c.canales.whatsapp.habilitado).toBe(true);
  });

  it("guardar y volver a leer da la misma configuración", () => {
    const c = resolverConfigCobranza({ reglasGenerales: "Firmar con mi nombre.", pruebaEmail: "yo@prueba.com" });
    expect(resolverConfigCobranza(filaDeConfig(c))).toEqual(c);
  });

  it("aplica cambios parciales y valida el resultado completo", () => {
    const base = resolverConfigCobranza(null);
    const ok = aplicarCambios(base, { maxIntentos: 4, prueba: { email: "yo@prueba.com" }, canales: { telefono: { habilitado: true } } });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.config.maxIntentos).toBe(4);
      expect(ok.config.prueba.email).toBe("yo@prueba.com");
      expect(ok.config.prueba.maxRecibos).toBe(3);
      expect(ok.config.canales.telefono.habilitado).toBe(true);
      expect(ok.config.canales.whatsapp.habilitado).toBe(true);
    }
    const mal = aplicarCambios(base, { ventanaDesde: "19:00", maxIntentos: 0, prueba: { email: "no-es-correo" } });
    expect(mal.ok).toBe(false);
    if (!mal.ok) expect(mal.errores.join(" | ")).toMatch(/maxIntentos.*\| .*prueba\.email.*\| .*ventana/);
    expect(aplicarCambios(base, "hola").ok).toBe(false);
  });

  it("rechaza tramos con ids repetidos o rangos invertidos", () => {
    const base = resolverConfigCobranza(null);
    const repetidos = aplicarCambios(base, { tramos: [TRAMOS_POR_DEFECTO[0], TRAMOS_POR_DEFECTO[0]] });
    expect(repetidos.ok).toBe(false);
    const invertido = aplicarCambios(base, { tramos: [{ ...TRAMOS_POR_DEFECTO[1], minDias: 10, maxDias: 2 }] });
    expect(invertido.ok).toBe(false);
  });

  it("combinar ignora claves desconocidas y reemplaza listas enteras", () => {
    expect(combinar({ a: 1, b: { c: [1, 2], d: 2 } }, { x: 9, b: { c: [3] } })).toEqual({ a: 1, b: { c: [3], d: 2 } });
  });
});

describe("tramos", () => {
  it("encuentra el tramo de los días para el vencimiento", () => {
    const t = (d: number) => tramoDe(d, TRAMOS_POR_DEFECTO)?.id;
    expect(t(30)).toBe("por_vencer_lejos");
    expect(t(16)).toBe("por_vencer_lejos");
    expect(t(15)).toBe("por_vencer");
    expect(t(0)).toBe("por_vencer");
    expect(t(-1)).toBe("vencido_reciente");
    expect(t(-14)).toBe("vencido_reciente");
    expect(t(-15)).toBe("vencido_urgente");
    expect(t(-24)).toBe("vencido_urgente");
    expect(t(-25)).toBe("vencido_critico");
    expect(t(-400)).toBe("vencido_critico");
    expect(tramoDe(5, [{ id: "x", nombre: "x", minDias: -3, maxDias: 2, instrucciones: null }])).toBeNull();
  });

  it("cuenta el rango en palabras", () => {
    expect(TRAMOS_POR_DEFECTO.map(rangoDeTramo)).toEqual([
      "vence en 16 días o más",
      "vence en 0 a 15 días",
      "vencido hace 1 a 14 días",
      "vencido hace 15 a 24 días",
      "vencido hace 25 días o más",
    ]);
    expect(rangoDeTramo({ minDias: -3, maxDias: 2 })).toBe("de 3 días vencido a 2 días antes");
  });

  it("arma un id nuevo sin repetir", () => {
    expect(idParaTramo("Último aviso!", [])).toBe("ultimo_aviso");
    expect(idParaTramo("Último aviso", ["ultimo_aviso"])).toBe("ultimo_aviso_2");
    expect(idParaTramo("¡¡", [])).toBe("tramo");
  });
});
