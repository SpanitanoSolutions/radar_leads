import { describe, expect, it } from "vitest";
import { cronAutorizado } from "./cron";

describe("cronAutorizado", () => {
  it("acepta solo el encabezado exacto que manda Vercel Cron", () => {
    expect(cronAutorizado("Bearer s3cr3t", "s3cr3t")).toBe(true);
    expect(cronAutorizado("Bearer otro", "s3cr3t")).toBe(false);
    expect(cronAutorizado("s3cr3t", "s3cr3t")).toBe(false);
    expect(cronAutorizado(null, "s3cr3t")).toBe(false);
  });

  it("sin CRON_SECRET configurado no autoriza nada", () => {
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
  });
});
