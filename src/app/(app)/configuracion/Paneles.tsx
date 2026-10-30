"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { ConexionCatalogo } from "@/conexiones/catalogo";
import type { Cuenta } from "@/lib/datos";
import { PROVINCIAS } from "@/lib/provincias";
import {
  desconectar,
  gmailProbar,
  guardarCuenta,
  whatsappContinuar,
  whatsappDesconectar,
  type EstadoFormulario,
  type EstadoPrueba,
} from "./actions";

type PasoWhatsApp = "sin_conectar" | "conectado";

function Error({ estado }: { estado: EstadoFormulario }) {
  return estado.error ? (
    <p className="mensaje-error" role="alert">
      {estado.error}
    </p>
  ) : null;
}

/** Checks WhatsApp Business Cloud API credentials with Meta before saving status. */
export function ContenidoWhatsApp({ paso, numero, plantillas }: {
  paso: PasoWhatsApp;
  numero: string;
  numeroSugerido: string;
  plantillas: { nombre: string; estado: string }[];
}) {
  const [estado, continuar, continuando] = useActionState<EstadoFormulario, FormData>(whatsappContinuar, {});
  return (
    <>
      <div className="panel-cabecera">
        <h2 id="panel-titulo" className="panel-titulo">Conectar WhatsApp</h2>
        <p className="texto-suave">Se valida contra WhatsApp Business Cloud API de Meta. La aplicacion nunca pide ni guarda la contrasena de Meta.</p>
      </div>
      <div className="panel-cuerpo">
        {paso === "sin_conectar" ? (
          <form action={continuar} className="form-columna">
            <p className="texto-suave">Configura en el servidor el token de Meta, el ID del numero y la version de Graph API. Despues verifica la conexion aca.</p>
            <Error estado={estado} />
            <button type="submit" className="boton boton-primario alinear-inicio" disabled={continuando}>
              {continuando ? "Verificando con Meta..." : "Verificar conexion"}
            </button>
          </form>
        ) : (
          <div className="form-columna">
            <p role="status" className="aviso aviso-ok">WhatsApp conectado: {numero}.</p>
            <div className="lista-polizas">
              <div className="poliza-item"><div className="celda-fuerte">Plantillas aprobadas en Meta</div></div>
              {plantillas.map((plantilla) => (
                <div key={plantilla.nombre} className="poliza-item poliza-item-cabecera">
                  <span>{plantilla.nombre}</span>
                  <span className={"pastilla " + (plantilla.estado === "Aprobada" ? "pastilla-verde" : "pastilla-ambar")}>{plantilla.estado}</span>
                </div>
              ))}
              {!plantillas.length && <div className="nota-pie">No se encontraron plantillas o falta el ID de la cuenta comercial de Meta.</div>}
            </div>
            <p className="nota-pie">Meta puede exigir plantillas aprobadas para iniciar conversaciones fuera de la ventana de atencion.</p>
            <div className="fila-acciones">
              <Link href="/configuracion" className="boton">Listo</Link>
              <form action={whatsappDesconectar}><button type="submit" className="boton-terciario">Desconectar</button></form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** "Mandar un correo de prueba" a la misma casilla conectada. */
function PruebaGmail() {
  const [estado, probar, probando] = useActionState<EstadoPrueba, FormData>(gmailProbar, {});
  return (
    <form action={probar} className="form-columna">
      {estado.ok && <p role="status" className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p role="alert" className="mensaje-error">{estado.error}</p>}
      <button type="submit" className="boton alinear-inicio" disabled={probando}>
        {probando ? "Mandando..." : "Mandar un correo de prueba"}
      </button>
    </form>
  );
}

/** OAuth connections and providers that still require an integration agreement. */
export function ContenidoConexion({ conexion, conectada, datos }: {
  conexion: ConexionCatalogo;
  conectada: boolean;
  datos: Record<string, string>;
}) {
  const href = conexion.tipo === "email"
    ? "/api/conexiones/oauth/gmail"
    : conexion.tipo === "google_calendar"
      ? "/api/conexiones/oauth/google-calendar"
      : conexion.tipo === "mercadopago"
        ? "/api/conexiones/oauth/mercadopago"
        : null;
  const necesitaConvenio = conexion.tipo === "portal" || conexion.tipo === "banco";
  const cuenta = datos.direccion || datos.cuenta || "";
  return (
    <>
      <div className="panel-cabecera">
        <h2 id="panel-titulo" className="panel-titulo">{conexion.nombre}</h2>
        <p className="texto-suave">{conexion.detalle}</p>
      </div>
      <div className="panel-cuerpo form-columna">
        {conectada ? (
          <p role="status" className="aviso aviso-ok">{conexion.nombre} autorizado {cuenta ? " - " + cuenta : ""}.</p>
        ) : necesitaConvenio ? (
          <p className="aviso aviso-info">No se guarda un usuario como si fuera una conexion. Este proveedor requiere credenciales/API oficiales y autorizacion comercial.</p>
        ) : (
          <>
            {datos.error && <p role="alert" className="aviso aviso-error">{datos.error}</p>}
            <p className="texto-suave">
              {conexion.tipo === "email"
                ? "Google te va a pedir permiso solo para enviar correos desde tu casilla. UNIQO no lee tus correos."
                : conexion.tipo === "google_calendar"
                  ? "Google solicitara permiso para crear eventos en tu calendario."
                  : "Mercado Pago solicitara autorizacion para crear links de pago y consultar cobros."}
            </p>
            {href && <a href={href} className="boton boton-primario alinear-inicio">Autorizar con {conexion.tipo === "mercadopago" ? "Mercado Pago" : "Google"}</a>}
          </>
        )}
        {conectada && conexion.tipo === "email" && <PruebaGmail />}
        {conectada && href && <a href={href} className="boton alinear-inicio">Volver a autorizar</a>}
        {conectada && (
          <form action={desconectar}>
            <input type="hidden" name="clave" value={conexion.clave} />
            <button type="submit" className="boton-terciario">Desconectar</button>
          </form>
        )}
        <p className="nota-pie">Los tokens OAuth se cifran en la base. El estado solo cambia a conectado tras completar la autorizacion.</p>
      </div>
    </>
  );
}

/** Mi cuenta: los datos que firman los mensajes y aparecen arriba. */
export function FormCuenta({ cuenta, tab = "cuenta" }: { cuenta: Cuenta; tab?: "cuenta" | "equipo" }) {
  const [estado, guardar, guardando] = useActionState<EstadoFormulario, FormData>(guardarCuenta, {});
  const [nombrePrincipal, setNombrePrincipal] = useState(cuenta.productores[0]?.nombre ?? cuenta.nombre ?? "");
  const [matriculaPrincipal, setMatriculaPrincipal] = useState(cuenta.productores[0]?.matricula ?? cuenta.matricula ?? "");
  const [productoresAdicionales, setProductoresAdicionales] = useState(() => {
    const guardados = cuenta.productores.slice(1);
    return [...guardados, ...Array.from({ length: Math.max(0, 1 - guardados.length) }, () => ({ nombre: "", matricula: "" }))];
  });
  const campo = (nombre: Exclude<keyof Cuenta, "productores" | "logoEmpresa" | "provincia">, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-columna">
      <label htmlFor={`cuenta-${nombre}`} className="etiqueta">
        {etiqueta}
      </label>
      <input
        id={`cuenta-${nombre}`}
        name={nombre}
        className="campo"
        {...(nombre === "nombre"
          ? { value: nombrePrincipal, onChange: (evento: React.ChangeEvent<HTMLInputElement>) => setNombrePrincipal(evento.target.value) }
          : nombre === "matricula"
            ? { value: matriculaPrincipal, onChange: (evento: React.ChangeEvent<HTMLInputElement>) => setMatriculaPrincipal(evento.target.value) }
            : { defaultValue: cuenta[nombre] ?? "" })}
        {...extra}
      />
    </div>
  );
  return (
    <form action={guardar} encType="multipart/form-data" className="tarjeta tarjeta-padding form-cuenta">
      <input type="hidden" name="tab" value={tab} />
      <p className="texto-suave">
        Agregá todas las personas físicas que trabajan con esta cuenta y sus matrículas. La primera persona aparece arriba
        y firma los mensajes que preparan los agentes.
      </p>
      <div className="form-grilla">
        {campo("nombre", "Nombre y apellido", { required: true, autoComplete: "name" })}
        {campo("matricula", "Matrícula")}
        {campo("organizacion", "Organización")}
        {campo("telefono", "Teléfono", { type: "tel", autoComplete: "tel" })}
        {campo("email", "Email", { type: "email", autoComplete: "email" })}
        <div className="form-columna">
          <label htmlFor="cuenta-provincia" className="etiqueta">Provincia</label>
          <select id="cuenta-provincia" name="provincia" className="campo" defaultValue={cuenta.provincia}>
            {PROVINCIAS.map((provincia) => <option key={provincia}>{provincia}</option>)}
          </select>
          <p className="nota-pie">Para no mandar seguimientos en los feriados de tu provincia.</p>
        </div>
      </div>
      <section className="cuenta-logo" aria-labelledby="cuenta-logo-titulo">
        <div>
          <h2 id="cuenta-logo-titulo">Logo de la empresa</h2>
          <p className="texto-suave">Se muestra junto al nombre de tu organización en la barra superior.</p>
        </div>
        <div className="cuenta-logo-contenido">
          <div className="cuenta-logo-vista">
            {cuenta.logoEmpresa ? (
              <Image
                src="/api/logo-empresa"
                alt={cuenta.organizacion ? `Logo de ${cuenta.organizacion}` : "Logo de la empresa"}
                width={160}
                height={96}
                unoptimized
                className="cuenta-logo-imagen"
              />
            ) : (
              <span className="nota-pie">Todavía no cargaste un logo.</span>
            )}
          </div>
          <div className="form-columna">
            <label htmlFor="cuenta-logo-empresa" className="etiqueta">Subir o reemplazar logo</label>
            <input
              id="cuenta-logo-empresa"
              name="logoEmpresa"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="campo"
            />
            <p className="nota-pie">PNG, JPG o WebP · máximo 512 KB.</p>
            {cuenta.logoEmpresa && (
              <label className="cuenta-logo-quitar">
                <input type="checkbox" name="quitarLogo" />
                Quitar el logo actual al guardar
              </label>
            )}
          </div>
        </div>
      </section>
      <section className="cuenta-productores" id="mi-equipo" aria-labelledby="cuenta-productores-titulo">
        <div className="cuenta-productores-cabecera">
          <div>
            <h2 id="cuenta-productores-titulo">Otras personas físicas</h2>
            <p className="texto-suave">Cargá a cada persona con su propia matrícula.</p>
          </div>
        </div>
        <div className="cuenta-productores-lista">
          {productoresAdicionales.map((productor, indice) => (
            <div className="cuenta-productor" key={indice}>
              <div className="cuenta-productor-cabecera">
                <h3>Persona {indice + 2}</h3>
                {productoresAdicionales.length > 1 && (
                  <button
                    type="button"
                    className="boton-texto boton-texto-peligro"
                    onClick={() => setProductoresAdicionales((actuales) => actuales.filter((_, i) => i !== indice))}
                  >
                    Quitar
                  </button>
                )}
              </div>
              <label htmlFor={`productor-nombre-${indice}`} className="etiqueta">Nombre y apellido</label>
              <input
                id={`productor-nombre-${indice}`}
                name="productoresNombre"
                className="campo"
                autoComplete="name"
                maxLength={120}
                value={productor.nombre}
                onChange={(evento) => setProductoresAdicionales((actuales) => actuales.map((p, i) => i === indice ? { ...p, nombre: evento.target.value } : p))}
              />
              <label htmlFor={`productor-matricula-${indice}`} className="etiqueta">Matrícula</label>
              <input
                id={`productor-matricula-${indice}`}
                name="productoresMatricula"
                className="campo"
                maxLength={30}
                value={productor.matricula}
                onChange={(evento) => setProductoresAdicionales((actuales) => actuales.map((p, i) => i === indice ? { ...p, matricula: evento.target.value } : p))}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="boton"
          disabled={productoresAdicionales.length >= 19}
          onClick={() => setProductoresAdicionales((actuales) => [...actuales, { nombre: "", matricula: "" }])}
        >
          Agregar otra persona
        </button>
      </section>
      <Error estado={estado} />
      <button type="submit" className="boton boton-primario alinear-inicio" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
