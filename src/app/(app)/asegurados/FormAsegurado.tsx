"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Asegurado } from "@/db/schema";
import { guardarAsegurado, type EstadoFormAsegurado } from "./actions";

/** Alta o edición de los datos de un asegurado. */
export function FormAsegurado({ asegurado, cancelarHref }: { asegurado?: Asegurado; cancelarHref: string }) {
  const [estado, guardar, guardando] = useActionState<EstadoFormAsegurado, FormData>(guardarAsegurado, {});
  const [tipo, setTipo] = useState<"persona" | "empresa">(asegurado?.tipo ?? "persona");
  const campo = (nombre: keyof Asegurado, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-columna">
      <label htmlFor={`f-${nombre}`} className="etiqueta">
        {etiqueta}
      </label>
      <input
        id={`f-${nombre}`}
        name={nombre}
        className="campo"
        defaultValue={(asegurado?.[nombre] as string | number | null | undefined) ?? ""}
        {...extra}
      />
    </div>
  );

  return (
    <form action={guardar} className="tarjeta tarjeta-padding form-asegurado">
      {asegurado && <input type="hidden" name="id" value={asegurado.id} />}
      <fieldset className="opciones-en-linea">
        <legend className="etiqueta">Tipo</legend>
        <label className="opcion-chica">
          <input type="radio" name="tipo" value="persona" checked={tipo === "persona"} onChange={() => setTipo("persona")} />
          Persona
        </label>
        <label className="opcion-chica">
          <input type="radio" name="tipo" value="empresa" checked={tipo === "empresa"} onChange={() => setTipo("empresa")} />
          Empresa
        </label>
      </fieldset>
      <div className="form-grilla">
        {campo("nombre", tipo === "empresa" ? "Razón social" : "Apellido y nombre", {
          required: true,
          placeholder: tipo === "empresa" ? "Panadería La Espiga SA" : "Gómez, Lucía",
        })}
        {campo("documento", tipo === "empresa" ? "CUIT" : "DNI o CUIL", { inputMode: "numeric" })}
        {campo("localidad", "Localidad")}
        {campo("clienteDesde", "Cliente desde (año)", { inputMode: "numeric", maxLength: 4 })}
        {campo("telefono", "Teléfono", { type: "tel" })}
        {campo("email", "Email", { type: "email" })}
        {campo("domicilio", "Domicilio")}
      </div>
      {tipo === "empresa" && (
        <fieldset className="opciones">
          <legend>Contacto de administración</legend>
          <p className="nota-info">Los agentes le escriben a esta persona por pagos y vencimientos.</p>
          <div className="form-grilla">
            {campo("contactoNombre", "Nombre")}
            {campo("contactoTelefono", "Teléfono", { type: "tel" })}
            {campo("contactoEmail", "Email", { type: "email" })}
          </div>
        </fieldset>
      )}
      <div className="form-columna">
        <label htmlFor="f-notas" className="etiqueta">
          Notas
        </label>
        <textarea id="f-notas" name="notas" rows={3} className="campo" defaultValue={asegurado?.notas ?? ""} />
      </div>
      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}
      <div className="fila-acciones">
        <button type="submit" className="boton boton-primario" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <Link href={cancelarHref} className="boton">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
