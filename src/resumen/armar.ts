import { etiquetaEvento } from "@/lib/evento";
import { diaYMes } from "@/lib/fechas";
import { estaPospuesto, type LeadConScore } from "@/lib/filtros";
import { guionContacto } from "@/lib/guion";

// Resumen de cada mañana: los mejores leads para llamar hoy y los
// recordatorios que vencen. Funciones puras: el cron lo envía y /resumen lo muestra.

export const CANTIDAD_MEJORES = 5;

export type ItemResumen = {
  id: number;
  empresa: string;
  score: number;
  motivo: string;
  cuando: string | null;
  localidad: string;
  telefono: string | null;
  guion: string;
  nuevoHoy: boolean;
};

export type Recordatorio = ItemResumen & { fecha: string; vencido: boolean; nota: string | null };

export type Resumen = {
  /** AAAA-MM-DD en Argentina. */
  dia: string;
  mejores: ItemResumen[];
  recordatorios: Recordatorio[];
};

const UN_DIA_MS = 86_400_000;

function item(l: LeadConScore, ahora: Date, productor?: string): ItemResumen {
  return {
    id: l.id,
    empresa: l.empresa,
    score: l.score,
    motivo: l.motivo,
    cuando: l.fechaEvento ? etiquetaEvento(l.tipoEvento, l.fechaEvento, ahora) : null,
    localidad: l.localidad,
    telefono: l.telefono,
    guion: guionContacto({
      empresa: l.empresa,
      tipoEvento: l.tipoEvento,
      sectorId: l.sectorId,
      rubro: l.rubro,
      localidad: l.localidad,
      motivo: l.motivo,
      diasEvento: l.diasEvento,
      productor,
    }),
    nuevoHoy: ahora.getTime() - l.detectadoEl.getTime() <= UN_DIA_MS,
  };
}

/**
 * `visibles`: los leads como los ve la lista (con score, ya filtrados por los
 * sectores y zonas del productor). Mejores: sin contactar ni posponer, primero
 * los detectados en las últimas 24 horas, después por score. Recordatorios: los
 * de hoy y los vencidos de leads que siguen abiertos.
 */
export function armarResumen(
  visibles: LeadConScore[],
  { dia, ahora = new Date(), productor }: { dia: string; ahora?: Date; productor?: string },
): Resumen {
  const mejores = visibles
    .filter((l) => l.estado === "nuevo" && !estaPospuesto(l, dia) && !(l.recordatorio && l.recordatorio <= dia))
    .map((l) => item(l, ahora, productor))
    .sort((a, b) => Number(b.nuevoHoy) - Number(a.nuevoHoy) || b.score - a.score)
    .slice(0, CANTIDAD_MEJORES);

  const recordatorios = visibles
    .filter((l) => l.recordatorio && l.recordatorio <= dia && l.estado !== "cerrado" && l.estado !== "descartado")
    .sort((a, b) => a.recordatorio!.localeCompare(b.recordatorio!) || b.score - a.score)
    .map((l) => ({
      ...item(l, ahora, productor),
      fecha: l.recordatorio!,
      vencido: l.recordatorio! < dia,
      nota: l.nota,
    }));

  return { dia, mejores, recordatorios };
}

export function tituloResumen(r: Resumen): string {
  const partes = [`${r.mejores.length} leads para hoy`];
  if (r.recordatorios.length) partes.push(`${r.recordatorios.length} recordatorio${r.recordatorios.length > 1 ? "s" : ""}`);
  return `Radar de leads · ${diaYMes(r.dia)}: ${partes.join(" y ")}`;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Versión de texto plano (para el email y para un canal futuro como WhatsApp). */
export function resumenEnTexto(r: Resumen, baseUrl = ""): string {
  const linea = (i: ItemResumen) =>
    [
      `• ${i.empresa} (score ${i.score}) — ${i.motivo}${i.cuando ? ` · ${i.cuando}` : ""}`,
      `  ${i.localidad}${i.telefono ? ` · Tel. ${i.telefono}` : ""}`,
      `  Para arrancar: ${i.guion}`,
      baseUrl ? `  ${baseUrl}/leads/${i.id}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  const bloques = [tituloResumen(r), "", "LOS MEJORES PARA LLAMAR HOY", ...r.mejores.map(linea)];
  if (r.mejores.length === 0) bloques.push("No hay leads nuevos sin contactar.");
  if (r.recordatorios.length) {
    bloques.push("", "RECORDATORIOS");
    for (const rec of r.recordatorios) {
      bloques.push(`${linea(rec)}\n  ${rec.vencido ? `Vencido (era para el ${diaYMes(rec.fecha)})` : "Para hoy"}${rec.nota ? ` · Nota: ${rec.nota}` : ""}`);
    }
  }
  return bloques.join("\n");
}

/** Versión HTML del email: simple, con estilos en línea para que se vea bien en cualquier cliente. */
export function resumenEnHtml(r: Resumen, baseUrl = ""): string {
  const tarjeta = (i: ItemResumen, extra = "") => `
    <div style="border:1px solid #e3e6eb;border-radius:10px;padding:12px 14px;margin:0 0 10px">
      <div style="font-weight:600">${baseUrl ? `<a href="${escapar(`${baseUrl}/leads/${i.id}`)}" style="color:#1d4ed8;text-decoration:none">${escapar(i.empresa)}</a>` : escapar(i.empresa)}
        <span style="color:#5b6472;font-weight:400"> · score ${i.score}${i.nuevoHoy ? " · nuevo" : ""}</span></div>
      <div>${escapar(i.motivo)}${i.cuando ? ` · ${escapar(i.cuando)}` : ""}</div>
      <div style="color:#5b6472">${escapar(i.localidad)}${i.telefono ? ` · Tel. ${escapar(i.telefono)}` : ""}</div>
      ${extra}
      <div style="margin-top:6px;padding:8px 10px;background:#f4f5f7;border-radius:8px;font-size:14px">${escapar(i.guion)}</div>
    </div>`;
  const recordatorios = r.recordatorios
    .map((rec) =>
      tarjeta(
        rec,
        `<div style="color:${rec.vencido ? "#b45309" : "#5b6472"}">${rec.vencido ? `Vencido: era para el ${diaYMes(rec.fecha)}` : "Para hoy"}${rec.nota ? ` · ${escapar(rec.nota)}` : ""}</div>`,
      ),
    )
    .join("");
  return `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1b2230;max-width:640px;margin:0 auto;padding:16px">
    <h1 style="font-size:20px;margin:0 0 4px">${escapar(tituloResumen(r))}</h1>
    <h2 style="font-size:16px;margin:16px 0 8px">Los mejores para llamar hoy</h2>
    ${r.mejores.map((i) => tarjeta(i)).join("") || "<p>No hay leads nuevos sin contactar.</p>"}
    ${recordatorios ? `<h2 style="font-size:16px;margin:16px 0 8px">Recordatorios</h2>${recordatorios}` : ""}
  </body></html>`;
}
