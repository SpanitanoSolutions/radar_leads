"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BotonEnviar, FormConError } from "@/components/Formularios";
import { TablaMapeo } from "@/components/importacion/Asistente";
import { COLUMNAS_LISTADO, type CampoListado } from "@/lib/validador/listados";
import { confirmarColumnas } from "./actions";

type Corrida = { id: number; etapa: string; progreso: number };

const ETAPA: Record<string, string> = { validacion: "Validación", enriquecimiento: "Enriquecimiento" };

/**
 * El progreso de las corridas en curso ("Ejecutar validación" o el cron).
 * Consulta cada pocos segundos y, cuando terminan, vuelve a armar la pantalla
 * con lo que cambió.
 */
export function ProgresoCorrida({ inicial }: { inicial: Corrida[] }) {
  const router = useRouter();
  const [corridas, setCorridas] = useState(inicial);
  useEffect(() => {
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/agentes/validador/progreso", { cache: "no-store" });
        if (!r.ok || !vivo) return;
        const { enCurso } = (await r.json()) as { enCurso: Corrida[] };
        setCorridas(enCurso);
        if (!enCurso.length) {
          clearInterval(id);
          router.refresh();
        }
      } catch {
        // Sin conexión: lo vuelve a intentar en la próxima vuelta.
      }
    }, 2000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [router]);

  if (!corridas.length) return null;
  return (
    <section className="progreso-corrida" aria-label="Validación en curso">
      {corridas.map((c) => (
        <div key={c.id} className="progreso-corrida-fila">
          <span className="celda-fuerte">{ETAPA[c.etapa] ?? c.etapa} en curso</span>
          <div className="barra-progreso-fila">
            <div
              className="barra-progreso"
              role="progressbar"
              aria-label={`${ETAPA[c.etapa] ?? c.etapa}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={c.progreso}
            >
              <div style={{ width: `${Math.max(4, c.progreso)}%` }} />
            </div>
            <span className="tabular texto-suave">{c.progreso} %</span>
          </div>
        </div>
      ))}
      <p className="texto-suave">Podés seguir usando UNIQO: cuando termine, el resultado queda en Actividad.</p>
    </section>
  );
}

const CAMPOS = COLUMNAS_LISTADO.map(({ id, nombre }) => ({ id, nombre, sinonimos: /$^/ }));

/**
 * Un formato nuevo: qué dato tiene cada columna, con la propuesta (de la IA o
 * por sinónimos) ya elegida. Al confirmar queda la plantilla de la compañía.
 */
export function ConfirmarColumnas({
  fuenteId,
  encabezados,
  filas,
  propuesta,
  estadoPorDefecto,
  monedaPorDefecto,
  conIA,
}: {
  fuenteId: number;
  encabezados: string[];
  filas: string[][];
  propuesta: (CampoListado | "")[];
  estadoPorDefecto: string | null;
  monedaPorDefecto: "ARS" | "USD";
  conIA: boolean;
}) {
  const [mapeo, setMapeo] = useState<(CampoListado | "")[]>(propuesta);
  const id = (n: string) => `mapeo-${fuenteId}-${n}`;
  return (
    <FormConError accion={confirmarColumnas} className="confirmar-columnas">
      <input type="hidden" name="fuenteId" value={fuenteId} />
      <input type="hidden" name="columnas" value={encabezados.length} />
      {mapeo.map((campo, i) => (
        <input key={i} type="hidden" name={`campo-${i}`} value={campo} />
      ))}
      <p className="texto-suave">
        {conIA ? "La IA propuso qué dato tiene cada columna." : "Te propongo qué dato tiene cada columna según su nombre."} Revisalo y confirmalo:
        queda como plantilla de la compañía y la próxima vez el listado se lee solo.
      </p>
      <TablaMapeo
        tabla={{ archivo: "", encabezados, filas, separador: null, filaInicial: 2 }}
        campos={CAMPOS}
        mapeo={mapeo}
        alCambiar={(columna, campo) => setMapeo((m) => m.map((c, i) => (i === columna ? campo : c)))}
      />
      <div className="form-grilla">
        <div className="form-columna">
          <label htmlFor={id("estado")} className="etiqueta">
            Si no tiene columna de estado
          </label>
          <select id={id("estado")} name="estadoPorDefecto" className="campo" defaultValue={estadoPorDefecto ?? ""}>
            <option value="">Cada fila dice su estado</option>
            <option value="pagada">Todo el listado son cuotas pagas</option>
            <option value="pendiente">Todo el listado son cuotas impagas</option>
          </select>
        </div>
        <div className="form-columna">
          <label htmlFor={id("moneda")} className="etiqueta">
            Moneda, si no la dice
          </label>
          <select id={id("moneda")} name="monedaPorDefecto" className="campo" defaultValue={monedaPorDefecto}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </div>
      </div>
      <div className="fila-acciones">
        <BotonEnviar texto="Confirmar columnas y leer el listado" enviando="Leyendo…" />
      </div>
    </FormConError>
  );
}
