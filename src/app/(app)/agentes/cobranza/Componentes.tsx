import Link from "next/link";
import { ESTADO_INFO, EVENTO_INFO, type Tono, type Totales } from "@/lib/cobranza/estados";
import type { EstadoCaso, TipoEventoCobranza } from "@/lib/cobranza/tipos";
import { importe, pesos } from "@/lib/formato";

// Piezas de presentación de Cobranza: el estado con su punto, los chips de la
// línea de tiempo, los montos y el encabezado con migas.

export function EstadoPunto({ estado, detalle }: { estado: EstadoCaso; detalle?: string | null }) {
  const info = ESTADO_INFO[estado];
  return (
    <span className="cob-estado" title={info.descripcion}>
      <span className={`cob-punto cob-tono-${info.tono}`} aria-hidden="true" />
      <span className="cob-estado-texto">{info.texto}</span>
      {detalle && <span className="cob-estado-detalle">{detalle}</span>}
    </span>
  );
}

export function Chip({ texto, tono }: { texto: string; tono: Tono }) {
  return <span className={`cob-chip cob-chip-${tono}`}>{texto}</span>;
}

export function ChipEvento({ tipo }: { tipo: TipoEventoCobranza }) {
  const info = EVENTO_INFO[tipo] ?? { texto: tipo, tono: "gris" as const };
  return <Chip texto={info.texto} tono={info.tono} />;
}

export function Monto({ valor, moneda }: { valor: number; moneda: string }) {
  return <span className="tabular">{importe(valor, moneda === "USD" ? "USD" : "ARS")}</span>;
}

/** Montos de un KPI: pesos y, si hay, dólares aparte. */
export function MontoKpi({ t }: { t: Totales }) {
  if (!t.ars && !t.usd) return <span className="cob-mono cob-kpi-monto">—</span>;
  return (
    <span className="cob-mono cob-kpi-monto">
      {t.ars ? pesos(t.ars) : null}
      {t.ars && t.usd ? " · " : null}
      {t.usd ? importe(t.usd, "USD") : null}
    </span>
  );
}

export function Migas({ items }: { items: { texto: string; href?: string }[] }) {
  return (
    <nav aria-label="Ubicación" className="cob-migas">
      {items.map((it, i) => (
        <span key={`${it.texto}-${i}`}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          {it.href ? <Link href={it.href}>{it.texto}</Link> : <span aria-current="page">{it.texto}</span>}
        </span>
      ))}
    </nav>
  );
}
