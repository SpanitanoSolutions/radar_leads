"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ConexionCatalogo } from "@/conexiones/catalogo";
import type { Cuenta } from "@/lib/datos";
import {
  conectar,
  desconectar,
  guardarCuenta,
  whatsappContinuar,
  whatsappDesconectar,
  whatsappVerificar,
  type EstadoFormulario,
} from "./actions";

type PasoWhatsApp = "sin_conectar" | "codigo" | "conectado";

const PASOS_WA = [
  { titulo: "Elegí el número", texto: "Usá el número de tu oficina o uno nuevo. Recomendamos uno dedicado a la atención de clientes." },
  { titulo: "Conectá tu cuenta de Meta", texto: "Iniciá sesión con Facebook y elegí (o creá) la cuenta comercial de tu negocio." },
  { titulo: "Verificá el número", texto: "Meta te manda un código por SMS o llamada para confirmar que el número es tuyo." },
];

function Error({ estado }: { estado: EstadoFormulario }) {
  return estado.error ? (
    <p className="mensaje-error" role="alert">
      {estado.error}
    </p>
  ) : null;
}

/** Conectar WhatsApp: número → código → conectado, con el estado de las plantillas. */
export function ContenidoWhatsApp({
  paso,
  numero,
  numeroSugerido,
  plantillas,
}: {
  paso: PasoWhatsApp;
  numero: string;
  numeroSugerido: string;
  plantillas: { nombre: string; estado: string }[];
}) {
  const [estadoNumero, continuar, continuando] = useActionState<EstadoFormulario, FormData>(whatsappContinuar, {});
  const [estadoCodigo, verificar, verificando] = useActionState<EstadoFormulario, FormData>(whatsappVerificar, {});
  const actual = paso === "sin_conectar" ? 0 : paso === "codigo" ? 2 : 3;

  return (
    <>
      <div className="panel-cabecera">
        <h2 id="panel-titulo" className="panel-titulo">
          Conectar WhatsApp
        </h2>
        <p className="texto-suave">
          Se conecta por la API oficial de WhatsApp Business de Meta. Tus asegurados te ven con tu nombre y tu número.
        </p>
      </div>
      <div className="panel-cuerpo">
        <ol className="pasos-conexion">
          {PASOS_WA.map((p, i) => {
            const hecho = actual > i || (i === 2 && paso === "conectado");
            const esActual = !hecho && (actual === i || (i <= 1 && actual === 0));
            return (
              <li key={p.titulo} className={esActual ? "paso-conexion paso-conexion-actual" : "paso-conexion"}>
                <div className="paso-conexion-titulo">
                  <span className={`paso-numero ${hecho ? "paso-numero-hecho" : esActual ? "paso-numero-actual" : ""}`}>
                    {hecho ? "✓" : i + 1}
                  </span>
                  <span>{p.titulo}</span>
                  {hecho && <span className="visualmente-oculto">(listo)</span>}
                </div>
                <p className="texto-suave">{p.texto}</p>
              </li>
            );
          })}
        </ol>

        {paso === "sin_conectar" && (
          <form action={continuar} className="form-columna">
            <label htmlFor="wa-numero-nuevo" className="etiqueta">
              Número de WhatsApp
            </label>
            <input
              id="wa-numero-nuevo"
              name="numero"
              type="tel"
              className="campo"
              defaultValue={numeroSugerido}
              placeholder="+54 9 223 555-1234"
              required
            />
            <Error estado={estadoNumero} />
            <button type="submit" className="boton boton-primario alinear-inicio" disabled={continuando}>
              {continuando ? "Conectando…" : "Continuar con Meta"}
            </button>
          </form>
        )}

        {paso === "codigo" && (
          <form action={verificar} className="form-columna">
            <label htmlFor="wa-numero" className="etiqueta">
              Número de WhatsApp
            </label>
            <input id="wa-numero" type="tel" value={numero} readOnly className="campo campo-solo-lectura" />
            <label htmlFor="wa-codigo" className="etiqueta">
              Código que te llegó por SMS
            </label>
            <div className="form-fila">
              <input
                id="wa-codigo"
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 dígitos"
                className="campo campo-codigo"
                required
              />
              <button type="submit" className="boton boton-primario" disabled={verificando}>
                {verificando ? "Verificando…" : "Verificar"}
              </button>
            </div>
            <Error estado={estadoCodigo} />
            <p className="nota-pie">Modo de prueba: cualquier código de 6 números sirve.</p>
          </form>
        )}

        {paso === "conectado" && (
          <div className="form-columna">
            <p role="status" className="aviso aviso-ok">
              WhatsApp conectado: {numero}.
            </p>
            <div className="lista-polizas">
              <div className="poliza-item">
                <div className="celda-fuerte">Plantillas de mensajes</div>
                <div className="nota-pie">Para escribirle primero a un asegurado, Meta tiene que aprobar el texto.</div>
              </div>
              {plantillas.map((p) => (
                <div key={p.nombre} className="poliza-item poliza-item-cabecera">
                  <span>{p.nombre}</span>
                  <span className={`pastilla ${p.estado === "Aprobada" ? "pastilla-verde" : "pastilla-ambar"}`}>{p.estado}</span>
                </div>
              ))}
            </div>
            <p className="nota-pie">
              Meta cobra los mensajes de plantilla que envía tu negocio. Radar te va a mostrar el consumo en Facturación.
            </p>
            <div className="fila-acciones">
              <Link href="/configuracion" className="boton">
                Listo
              </Link>
              <form action={whatsappDesconectar}>
                <button type="submit" className="boton-terciario">
                  Desconectar
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Las demás conexiones: un formulario corto con los datos que no son secretos. */
export function ContenidoConexion({
  conexion,
  conectada,
  porEmail,
  datos,
}: {
  conexion: ConexionCatalogo;
  conectada: boolean;
  porEmail: boolean;
  datos: Record<string, string>;
}) {
  const [estado, enviar, enviando] = useActionState<EstadoFormulario, FormData>(conectar, {});
  const campo = (nombre: string, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-columna">
      <label htmlFor={`c-${nombre}`} className="etiqueta">
        {etiqueta}
      </label>
      <input id={`c-${nombre}`} name={nombre} className="campo" defaultValue={datos[nombre] ?? ""} {...extra} />
    </div>
  );

  return (
    <>
      <div className="panel-cabecera">
        <h2 id="panel-titulo" className="panel-titulo">
          {conexion.nombre}
        </h2>
        <p className="texto-suave">{conexion.detalle}</p>
      </div>
      <div className="panel-cuerpo">
        <form action={enviar} className="form-columna">
          <input type="hidden" name="clave" value={conexion.clave} />
          {conexion.tipo === "email" && (
            <>
              {campo("direccion", "Dirección de email", { type: "email", required: true, placeholder: "cotizaciones@tu-dominio.com.ar" })}
              {campo("proveedor", "Proveedor", { placeholder: "Gmail" })}
            </>
          )}
          {conexion.tipo === "portal" &&
            porEmail &&
            campo("email", "Email de la compañía para pedir cotizaciones", { type: "email", required: true, name: "emailCompania" })}
          {conexion.tipo === "portal" && !porEmail && campo("usuario", "Usuario o código de productor", { required: true })}
          {conexion.tipo === "mercadopago" && campo("cuenta", "Cuenta de Mercado Pago (email o alias)")}
          {conexion.tipo === "banco" && (
            <>
              {campo("banco", "Banco", { required: true, placeholder: "Banco Provincia" })}
              {campo("alias", "Alias o CBU de tu cuenta", { required: true })}
            </>
          )}
          {conexion.tipo === "google_calendar" && campo("calendario", "Calendario", { placeholder: "principal" })}
          <p className="nota-pie">
            No pedimos claves: Radar nunca guarda contraseñas. Por ahora esta conexión es simulada y no se comunica con
            ningún servicio.
          </p>
          <Error estado={estado} />
          <div className="fila-acciones">
            <button type="submit" className="boton boton-primario" disabled={enviando}>
              {enviando ? "Guardando…" : conectada ? "Guardar cambios" : porEmail ? "Guardar contacto" : "Conectar"}
            </button>
            <Link href="/configuracion" className="boton">
              Cancelar
            </Link>
          </div>
        </form>
        {conectada && (
          <form action={desconectar}>
            <input type="hidden" name="clave" value={conexion.clave} />
            {porEmail && <input type="hidden" name="porEmail" value="1" />}
            <button type="submit" className="boton-terciario">
              Desconectar
            </button>
          </form>
        )}
      </div>
    </>
  );
}

/** Mi cuenta: los datos que firman los mensajes y aparecen arriba. */
export function FormCuenta({ cuenta }: { cuenta: Cuenta }) {
  const [estado, guardar, guardando] = useActionState<EstadoFormulario, FormData>(guardarCuenta, {});
  const campo = (nombre: keyof Cuenta, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-columna">
      <label htmlFor={`cuenta-${nombre}`} className="etiqueta">
        {etiqueta}
      </label>
      <input id={`cuenta-${nombre}`} name={nombre} className="campo" defaultValue={cuenta[nombre] ?? ""} {...extra} />
    </div>
  );
  return (
    <form action={guardar} className="tarjeta tarjeta-padding form-cuenta">
      <p className="texto-suave">
        Tu nombre aparece arriba a la derecha y firma los mensajes que preparan los agentes. La matrícula va en los
        reclamos a las compañías.
      </p>
      <div className="form-grilla">
        {campo("nombre", "Nombre y apellido", { required: true, autoComplete: "name" })}
        {campo("matricula", "Matrícula")}
        {campo("organizacion", "Organización")}
        {campo("telefono", "Teléfono", { type: "tel", autoComplete: "tel" })}
        {campo("email", "Email", { type: "email", autoComplete: "email" })}
      </div>
      <Error estado={estado} />
      <button type="submit" className="boton boton-primario alinear-inicio" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
