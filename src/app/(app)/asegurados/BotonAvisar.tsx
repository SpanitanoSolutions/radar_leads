"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { IconoCerrar } from "@/components/iconos";
import { enviarAviso, omitirAviso } from "../mensajes/actions";
import { prepararAvisoVencimiento, type AvisoParaAprobar } from "./actions";

type Estado =
  | { paso: "revisar"; aviso: AvisoParaAprobar; error?: string }
  | { paso: "enviado"; aviso: AvisoParaAprobar }
  | { paso: "sin-aviso"; error: string };

const ERROR_INESPERADO = "Hubo un problema inesperado. Probá de nuevo en un rato.";

/**
 * Botón "Avisar" de la cartera y de Vencimientos. Prepara el aviso de
 * vencimiento y lo abre en una ventana para corregirlo y aprobarlo ahí mismo.
 * Si se cierra sin enviar, el borrador queda en Vencimientos → Avisos para aprobar.
 */
export function BotonAvisar({ aseguradoId, etiqueta, className }: { aseguradoId: number; etiqueta: string; className: string }) {
  const router = useRouter();
  const ventana = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [texto, setTexto] = useState("");
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    if (estado && !ventana.current?.open) ventana.current?.showModal();
  }, [estado]);

  useEffect(() => {
    const dialogo = ventana.current;
    if (!dialogo) return;
    // El panel lateral escucha Escape y Tab en todo el documento: lo que se
    // teclea dentro de la ventana no tiene que llegarle. Escape igual cierra
    // la ventana, porque eso no depende de que el evento suba.
    const frenar = (e: KeyboardEvent) => e.stopPropagation();
    dialogo.addEventListener("keydown", frenar);
    return () => dialogo.removeEventListener("keydown", frenar);
  }, []);

  function abrir() {
    iniciar(async () => {
      const r = await prepararAvisoVencimiento(aseguradoId).catch(() => ({ ok: false as const, error: ERROR_INESPERADO }));
      if (r.ok) {
        setTexto(r.aviso.texto);
        setEstado({ paso: "revisar", aviso: r.aviso });
      } else {
        setEstado({ paso: "sin-aviso", error: r.error });
      }
    });
  }

  function enviar(aviso: AvisoParaAprobar) {
    iniciar(async () => {
      const r = await enviarAviso(aviso.id, texto).catch(() => ({ ok: false as const, error: ERROR_INESPERADO }));
      setEstado(r.ok ? { paso: "enviado", aviso } : { paso: "revisar", aviso, error: r.error });
    });
  }

  function omitir(aviso: AvisoParaAprobar) {
    iniciar(async () => {
      try {
        await omitirAviso(aviso.id);
        ventana.current?.close();
      } catch {
        setEstado({ paso: "revisar", aviso, error: "No pudimos omitir el aviso. Probá de nuevo." });
      }
    });
  }

  function alCerrar() {
    // Si quedó sin enviar, la pantalla se actualiza para mostrarlo en Avisos para aprobar.
    if (estado?.paso === "revisar") router.refresh();
    setEstado(null);
  }

  return (
    <>
      <button type="button" className={className} onClick={abrir} disabled={pendiente && !estado} aria-haspopup="dialog">
        {pendiente && !estado ? "Preparando…" : etiqueta}
      </button>
      <dialog
        ref={ventana}
        className="ventana"
        aria-labelledby={titulo}
        onClose={alCerrar}
        onCancel={(e) => {
          if (pendiente) e.preventDefault();
        }}
      >
        {estado && (
          <div className="ventana-contenido">
            <header className="ventana-cabecera">
              <div>
                <h2 id={titulo} className="ventana-titulo">
                  {estado.paso === "sin-aviso" ? "No se pudo preparar el aviso" : `Aviso para ${estado.aviso.cliente}`}
                </h2>
                {estado.paso !== "sin-aviso" && (
                  <p className="texto-suave">
                    {estado.aviso.canal === "whatsapp" ? "WhatsApp" : "Email"} · {estado.aviso.destinatario}
                    {estado.aviso.motivo && ` · ${estado.aviso.motivo}`}
                  </p>
                )}
              </div>
              <button type="button" className="ventana-cerrar" onClick={() => ventana.current?.close()} disabled={pendiente} aria-label="Cerrar">
                <IconoCerrar />
              </button>
            </header>

            {estado.paso === "sin-aviso" && (
              <>
                <p className="aviso aviso-error" role="alert">{estado.error}</p>
                <div className="ventana-pie">
                  <button type="button" className="boton boton-mediano" onClick={() => ventana.current?.close()}>
                    Cerrar
                  </button>
                </div>
              </>
            )}

            {estado.paso === "revisar" && (
              <form
                className="ventana-formulario"
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar(estado.aviso);
                }}
              >
                <p className="texto-suave">Nada sale sin que lo apruebes. Podés corregir el texto antes de enviarlo.</p>
                <label htmlFor={`${titulo}-texto`} className="visualmente-oculto">
                  Texto del mensaje para {estado.aviso.cliente}
                </label>
                <textarea
                  id={`${titulo}-texto`}
                  rows={10}
                  className={`campo burbuja ventana-texto ${estado.aviso.canal === "whatsapp" ? "burbuja-whatsapp" : ""}`}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={pendiente}
                />
                {estado.error && (
                  <p className="aviso aviso-error" role="alert">
                    No se pudo enviar el mensaje: {estado.error}
                  </p>
                )}
                <div className="ventana-pie">
                  <span className="texto-suave">Si cerrás sin enviar, queda en Vencimientos para aprobar.</span>
                  <button type="button" className="boton-terciario" onClick={() => omitir(estado.aviso)} disabled={pendiente}>
                    Omitir
                  </button>
                  <button type="submit" className="boton boton-primario boton-mediano" disabled={pendiente || !texto.trim()}>
                    {pendiente ? "Enviando…" : "Aprobar y enviar"}
                  </button>
                </div>
              </form>
            )}

            {estado.paso === "enviado" && (
              <>
                <p className="aviso aviso-ok" role="status">
                  Listo: le enviamos el aviso a {estado.aviso.cliente} por {estado.aviso.canal === "whatsapp" ? "WhatsApp" : "email"}.
                </p>
                <div className="ventana-pie">
                  <button type="button" className="boton boton-primario boton-mediano" onClick={() => ventana.current?.close()}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
