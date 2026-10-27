"use client";

import { useState } from "react";
import { enlaceWhatsApp } from "@/lib/contacto";

type AsistenteWhatsAppProps = {
  nombre: string;
  telefono: string | null;
  proximoVencimiento: string | null;
};

export function AsistenteWhatsApp({ nombre, telefono, proximoVencimiento }: AsistenteWhatsAppProps) {
  const nombrePila = nombre.trim().split(/\s+/)[0] || "";
  const saludo = `Hola ${nombrePila}, ¿cómo estás? Soy tu asesor de seguros. ¿En qué puedo ayudarte?`;
  const [texto, setTexto] = useState(saludo);
  const destino = telefono && texto.trim() ? enlaceWhatsApp(telefono, texto.trim()) : null;
  const telefonoReconocido = telefono ? Boolean(enlaceWhatsApp(telefono)) : false;

  const mensajes = [
    {
      titulo: "Saludar",
      texto: saludo,
    },
    {
      titulo: "Avisar vencimiento",
      texto: proximoVencimiento
        ? `Hola ${nombrePila}, te escribo para avisarte que tu póliza vence el ${proximoVencimiento}. ¿Querés que revisemos juntos la renovación?`
        : `Hola ${nombrePila}, te escribo para saber si querés que revisemos las fechas de renovación de tus pólizas.`,
    },
    {
      titulo: "Pedir documentación",
      texto: `Hola ${nombrePila}, para avanzar con la gestión de tu seguro, ¿podrías enviarme la documentación pendiente por este medio?`,
    },
  ];

  return (
    <section id="asistente-whatsapp" className="panel-seccion asistente-whatsapp" aria-labelledby="asistente-whatsapp-titulo">
      <div className="asistente-whatsapp-cabecera">
        <div className="asistente-whatsapp-avatar" aria-hidden="true">R</div>
        <div>
          <h3 id="asistente-whatsapp-titulo" className="panel-seccion-titulo">Asistente de WhatsApp</h3>
          <p className="asistente-whatsapp-sub">Prepará un mensaje para {nombre}</p>
        </div>
      </div>

      <p className="asistente-whatsapp-burbuja" aria-live="polite">
        Hola, puedo ayudarte a preparar el mensaje. Elegí una opción o escribilo a tu manera.
      </p>

      <div className="asistente-whatsapp-opciones" aria-label="Mensajes sugeridos">
        {mensajes.map((mensaje) => (
          <button key={mensaje.titulo} type="button" className="asistente-whatsapp-opcion" onClick={() => setTexto(mensaje.texto)}>
            {mensaje.titulo}
          </button>
        ))}
      </div>

      <label className="asistente-whatsapp-label" htmlFor="mensaje-whatsapp">
        Mensaje
        <textarea
          id="mensaje-whatsapp"
          className="asistente-whatsapp-editor"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Escribí el mensaje para el cliente"
        />
      </label>

      <div className="asistente-whatsapp-pie">
        {telefonoReconocido ? (
          <p className="asistente-whatsapp-ayuda">Se abrirá WhatsApp con el mensaje listo para que confirmes el envío.</p>
        ) : (
          <p className="asistente-whatsapp-error">
            {telefono
              ? "No pudimos reconocer este celular para WhatsApp. Actualizá el teléfono en la ficha del asegurado."
              : "Este asegurado no tiene un teléfono cargado."}
          </p>
        )}
        {destino ? (
          <a href={destino} target="_blank" rel="noopener noreferrer" className="boton boton-primario asistente-whatsapp-enviar">
            Continuar en WhatsApp
          </a>
        ) : (
          <button type="button" className="boton boton-primario asistente-whatsapp-enviar" disabled>
            Continuar en WhatsApp
          </button>
        )}
      </div>
    </section>
  );
}
