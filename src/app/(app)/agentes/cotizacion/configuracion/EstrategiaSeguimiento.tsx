"use client";

import { useState, useTransition } from "react";
import { describirEstrategia, interpretarEstrategiaSeguimiento } from "@/lib/cotizacion";
import { sugerirEstrategiaConIA } from "./actions";

/**
 * La estrategia de seguimiento dentro del formulario de la configuración: dice
 * cómo la entiende el agente mientras se escribe y, con la IA activa, ofrece
 * "Sugerir con IA". La sugerencia va al campo y se guarda recién con "Guardar
 * configuración", que la vuelve a validar en el servidor.
 */
export function EstrategiaSeguimiento({ valorInicial, iaHabilitada }: { valorInicial: string; iaHabilitada: boolean }) {
  const [estrategia, setEstrategia] = useState(valorInicial);
  const [pedido, setPedido] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const [pidiendo, iniciar] = useTransition();
  const regla = estrategia.trim() ? interpretarEstrategiaSeguimiento(estrategia) : null;

  function sugerir() {
    setAviso(null);
    iniciar(async () => {
      const r = await sugerirEstrategiaConIA(pedido);
      if (r.ok) {
        setEstrategia(r.estrategia);
        setAviso({ texto: "La IA sugirió esta estrategia. Revisala y tocá “Guardar configuración” para usarla.", error: false });
      } else {
        setAviso({ texto: r.mensaje, error: true });
      }
    });
  }

  return (
    <div className="cotizacion-estrategia">
      <label>Estrategia en días hábiles
        <textarea name="estrategiaSeguimiento" value={estrategia} onChange={(evento) => setEstrategia(evento.target.value)} rows={3} maxLength={1000} required aria-describedby="cotizacion-estrategia-lectura" />
      </label>
      <p id="cotizacion-estrategia-lectura" className={regla ? "cotizacion-estrategia-lectura" : "cotizacion-estrategia-lectura error"} aria-live="polite">
        {regla ? `Así la entiende el agente: ${describirEstrategia(regla)}` : "El agente no entiende esta estrategia: usá reglas como «cada 3 días hábiles», «para Flotas cada 1 día hábil» y «si hay folio, esperar»."}
      </p>
      {iaHabilitada && <div className="cotizacion-estrategia-ia">
        <label>¿Cómo querés el seguimiento? <small>Opcional, para la IA</small>
          <input value={pedido} onChange={(evento) => setPedido(evento.target.value)} maxLength={500} placeholder="Ej.: a las flotas todos los días, al resto cada 3" />
        </label>
        <button type="button" className="boton" onClick={sugerir} disabled={pidiendo}>{pidiendo ? "La IA está escribiendo…" : "Sugerir con IA"}</button>
      </div>}
      {aviso && <p role={aviso.error ? "alert" : "status"} className={`cotizacion-aviso${aviso.error ? " error" : ""}`}>{aviso.texto}</p>}
    </div>
  );
}
