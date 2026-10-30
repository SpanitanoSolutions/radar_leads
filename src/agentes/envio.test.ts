import { beforeEach, describe, expect, it, vi } from "vitest";

// Sin base ni conexiones: el mensaje vive en memoria y los adaptadores anotan
// lo que mandarían.
const base = vi.hoisted(() => ({
  mensaje: null as Record<string, unknown> | null,
  actualizado: null as Record<string, unknown> | null,
  correos: [] as Record<string, unknown>[],
  whatsapps: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => ({
  schema: await import("@/db/schema"),
  db: {
    select: () => ({ from: () => ({ where: async () => (base.mensaje ? [base.mensaje] : []) }) }),
    update: () => ({ set: (valores: Record<string, unknown>) => ({ where: async () => { base.actualizado = valores; } }) }),
  },
}));
vi.mock("@/conexiones/email", () => ({
  email: { enviar: async (m: Record<string, unknown>) => { base.correos.push(m); return { ok: true, id: "g-1" }; } },
}));
vi.mock("@/conexiones/whatsapp", () => ({
  whatsapp: { enviar: async (m: Record<string, unknown>) => { base.whatsapps.push(m); return { ok: true, id: "w-1" }; } },
}));
vi.mock("@/lib/datos", () => ({ obtenerCuenta: async () => ({ nombre: "Julián Pérez" }) }));

const { enviarMensaje } = await import("./envio");

const MENSAJE = { id: 1, canal: "email", estado: "borrador", destinatario: "siniestros@compania.com.ar", asunto: "Denuncia", texto: "Hola. {productor}", esEjemplo: false };

beforeEach(() => {
  base.mensaje = { ...MENSAJE };
  base.actualizado = null;
  base.correos.length = 0;
  base.whatsapps.length = 0;
});

describe("enviarMensaje", () => {
  it("manda el correo firmado, con el productor de remitente, y lo deja enviado", async () => {
    expect(await enviarMensaje(1)).toEqual({ ok: true, id: "g-1" });
    expect(base.correos).toEqual([{ para: "siniestros@compania.com.ar", asunto: "Denuncia", texto: "Hola. Julián Pérez", remitente: "Julián Pérez" }]);
    expect(base.actualizado).toMatchObject({ estado: "enviado", texto: "Hola. Julián Pérez" });
  });

  it("un mensaje de ejemplo no sale por ninguna conexión real", async () => {
    base.mensaje = { ...MENSAJE, esEjemplo: true };
    expect(await enviarMensaje(1)).toEqual({ ok: false, error: "Es un mensaje de ejemplo: no sale por las conexiones reales." });
    base.mensaje = { ...MENSAJE, canal: "whatsapp", destinatario: "223 464-2290", esEjemplo: true };
    expect((await enviarMensaje(1)).ok).toBe(false);
    expect(base.correos).toEqual([]);
    expect(base.whatsapps).toEqual([]);
    expect(base.actualizado).toBeNull();
  });
});
