import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntentoCanal } from "./canales";
import { autorizacion } from "./permisos";
import { RegistroConectores } from "./registro";
import type { Capacidad, ConectorCompania, TipoConector } from "./tipos";

// Sin base: la auditoría, la salud y el orden de conector_companias se simulan.
const registrados: IntentoCanal[] = [];
const base = vi.hoisted(() => ({
  ordenGuardado: undefined as TipoConector[] | undefined,
  consultasOrden: 0,
  consultasSalud: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("./auditoria", () => ({
  auditar: () => async (intento: IntentoCanal) => { registrados.push(intento); },
  saludDe: async () => { base.consultasSalud++; return () => undefined; },
}));
vi.mock("./companias", () => ({
  canalesDeCompania: async () => { base.consultasOrden++; return base.ordenGuardado; },
}));

const { ejecutarEnCompania } = await import("./ejecutar");

const SOLICITUD = { referencia: "1050", ramo: "Auto", tipo: "nueva" as const, riesgo: {}, codigoPostal: null, sumaAsegurada: null, moneda: "ARS" as const, vigenciaDesde: null };
const contexto = { agente: "cotizacion", entidad: "cotizacion_envios", entidadId: 7 };
const permitido = () => autorizacion({ cotizar: { solicitudId: 1, motivo: "aprobada" } });

/** Una compañía con API y portal que anotan quién cotizó. */
function registroCon(llamados: TipoConector[]): RegistroConectores {
  const crear = (tipo: TipoConector): ConectorCompania => ({
    compania: "Sancor",
    tipo,
    capacidades: ["cotizar"] as Capacidad[],
    probarConexion: async () => ({ ok: true, latenciaMs: 1 }),
    cotizar: async () => {
      llamados.push(tipo);
      return { estado: "pendiente", numero: `${tipo}-1` };
    },
  });
  const registro = new RegistroConectores();
  registro.registrar((compania) => compania === "Sancor" ? [crear("api"), crear("portal")] : []);
  return registro;
}

beforeEach(() => {
  registrados.length = 0;
  base.ordenGuardado = undefined;
  base.consultasOrden = 0;
  base.consultasSalud = 0;
});

describe("ejecutarEnCompania y el orden de canales", () => {
  it("con `canales`, usa solo esos y no lee conector_companias", async () => {
    const llamados: TipoConector[] = [];
    const resultado = await ejecutarEnCompania("Sancor", "cotizar", [SOLICITUD, []], { contexto, autorizacion: permitido(), canales: ["portal"], registro: registroCon(llamados) });
    expect(resultado).toMatchObject({ ok: true, canal: "portal" });
    expect(llamados).toEqual(["portal"]);
    expect(base.consultasOrden).toBe(0);
    expect(registrados.map((intento) => intento.canal)).toEqual(["portal"]);
  });

  it("con `canales` vacío, queda el canal manual sin llamar a la compañía", async () => {
    const llamados: TipoConector[] = [];
    expect(await ejecutarEnCompania("Sancor", "cotizar", [SOLICITUD, []], { contexto, autorizacion: permitido(), canales: [], registro: registroCon(llamados) }))
      .toEqual({ ok: false, motivo: "manual", intentos: [] });
    expect(llamados).toEqual([]);
  });

  it("sin `canales`, toma el orden guardado de la compañía", async () => {
    base.ordenGuardado = ["portal", "api"];
    const llamados: TipoConector[] = [];
    const resultado = await ejecutarEnCompania("Sancor", "cotizar", [SOLICITUD, []], { contexto, autorizacion: permitido(), registro: registroCon(llamados) });
    expect(resultado).toMatchObject({ ok: true, canal: "portal" });
    expect(base.consultasOrden).toBe(1);
  });

  it("sin fila, usa todos los conectores registrados: primero la API", async () => {
    const llamados: TipoConector[] = [];
    expect(await ejecutarEnCompania("Sancor", "cotizar", [SOLICITUD, []], { contexto, autorizacion: permitido(), registro: registroCon(llamados) }))
      .toMatchObject({ ok: true, canal: "api" });
    expect(llamados).toEqual(["api"]);
  });

  it("una compañía sin conectores es manual y no consulta la base", async () => {
    expect(await ejecutarEnCompania("La Segunda", "cotizar", [SOLICITUD, []], { contexto, autorizacion: permitido(), registro: registroCon([]) }))
      .toEqual({ ok: false, motivo: "manual", intentos: [] });
    expect(base.consultasOrden + base.consultasSalud).toBe(0);
  });

  it("sin autorización para cotizar, frena en el primer canal y lo registra", async () => {
    const llamados: TipoConector[] = [];
    const resultado = await ejecutarEnCompania("Sancor", "cotizar", [SOLICITUD, []], { contexto, autorizacion: autorizacion(), canales: ["portal", "api"], registro: registroCon(llamados) });
    expect(resultado).toMatchObject({ ok: false, motivo: "sin_permiso", canal: "portal" });
    expect(llamados).toEqual([]);
    expect(registrados).toMatchObject([{ canal: "portal", resultado: "error", codigoError: "sin_permiso" }]);
  });
});
