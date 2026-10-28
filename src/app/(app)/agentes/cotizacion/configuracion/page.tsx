import Link from "next/link";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { estadoIAcotizacion } from "@/lib/ia/cotizacion";
import { guardarAseguradoraCotizacion, guardarConfiguracionCotizacion, guardarPaqueteCotizacion, guardarCredencialPortal, importarAseguradorasCotizacion, guardarFeatureCotizacionIA } from "./actions";
import "../../agentes.css";

export default async function ConfiguracionCotizacion({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  await connection();
  const [{ aviso }, aseguradoras, paquetes, configuraciones, conexiones, estadoIA] = await Promise.all([
    searchParams,
    db.select().from(schema.cotizacionAseguradoras).orderBy(schema.cotizacionAseguradoras.nombre),
    db.select({ paquete: schema.cotizacionPaquetes, aseguradora: schema.cotizacionAseguradoras.nombre })
      .from(schema.cotizacionPaquetes).innerJoin(schema.cotizacionAseguradoras, eq(schema.cotizacionAseguradoras.id, schema.cotizacionPaquetes.aseguradoraId)),
    db.select().from(schema.cotizacionConfig).limit(1),
    db.select({ clave: schema.conexiones.clave, estado: schema.conexiones.estado, datos: schema.conexiones.datos }).from(schema.conexiones).where(eq(schema.conexiones.tipo, "portal")),
    estadoIAcotizacion(),
  ]);
  const config = configuraciones[0];
  const nombresAviso: Record<string, string> = {
    guardado: "Guardaste la configuración.",
    "estrategia-invalida": "La estrategia debe indicar una frecuencia en días hábiles o una regla por ramo.",
    "configuracion-invalida": "Revisá el intervalo y el máximo de seguimientos.",
    "aseguradora-invalida": "Revisá el nombre, el canal y el correo de contacto.",
    "aseguradora-guardada": "Guardaste la aseguradora.",
    "paquete-invalido": "Revisá los datos del paquete.",
    "paquete-guardado": "Guardaste el paquete.",
    "clave-cifrado-faltante": "No se guardaron las credenciales: falta configurar la clave de cifrado en el servidor.",
    "credencial-invalida": "Completá la compañía, el usuario y la clave.",
    "credencial-guardada": "Guardamos las credenciales cifradas. El portal sigue simulado.",
    "archivo-catalogo-invalido": "Subí un CSV o Excel de hasta 5 MB con aseguradora y ramo.",
    "encabezados-catalogo-invalidos": "El archivo debe tener columnas Aseguradora y Ramos.",
    "datos-catalogo-invalidos": "Revisá que cada fila tenga nombre, ramos y un canal válido (correo, portal o ambos).",
    "importacion-catalogo-ok": "Importamos las aseguradoras.",
    "ia-sin-clave": "La IA quedó desactivada: configurá ANTHROPIC_API_KEY en el servidor.",
    "ia-guardada": "Actualizaste el uso de IA de Cotización.",
  };
  return (
    <main className="agente-pagina cotizacion-ajustes">
      <header className="encabezado-pagina">
        <div><Link href="/agentes/cotizacion">← Cotización</Link><h1>Configuración del agente</h1><p>Elegí con qué compañías cotizás y cómo prepara los pedidos el agente.</p></div>
      </header>
      {aviso && <p className="cotizacion-aviso" role="status">{nombresAviso[aviso] ?? "Se guardaron los cambios."}</p>}

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Aseguradoras</h2><p>El correo y los portales se mantienen simulados. Cada borrador requiere tu aprobación.</p>
        <div className="cotizacion-botones-borrador"><Link className="boton" href="/agentes/cotizacion/configuracion/exportar">Exportar CSV</Link><Link className="boton" href="/agentes/cotizacion/configuracion/exportar?formato=xlsx">Exportar Excel</Link></div>
        <form action={importarAseguradorasCotizacion} className="cotizacion-ajuste-form"><label>Importar aseguradoras (CSV o Excel)<input type="file" name="archivoAseguradoras" accept=".csv,.xlsx" required /></label><button className="boton">Importar catálogo</button></form>
        <div className="tabla-scroll"><table className="tabla"><thead><tr><th>Aseguradora</th><th>Ramos</th><th>Canal</th><th>Contacto</th><th>Activa</th></tr></thead>
          <tbody>{aseguradoras.map((aseguradora) => <tr key={aseguradora.id}><td>{aseguradora.nombre}</td><td>{aseguradora.ramos.join(", ")}</td><td>{aseguradora.canal}</td><td>{aseguradora.contactos.map((contacto) => contacto.email).join(", ") || "Sin contacto"}</td><td>{aseguradora.activa ? "Sí" : "No"}</td></tr>)}</tbody>
        </table></div>
        <form action={guardarAseguradoraCotizacion} className="cotizacion-ajuste-form">
          <h3>Agregar o editar aseguradora</h3>
          <label>Nombre<input name="nombre" required maxLength={120} /></label>
          <label>Ramos separados por coma<input name="ramos" defaultValue="Automotor, Flotas" /></label>
          <label>Canal<select name="canal"><option value="correo">Correo</option><option value="portal">Portal simulado</option><option value="ambos">Correo y portal</option></select></label>
          <label>Nombre del contacto<input name="contacto" maxLength={120} /></label>
          <label>Correo<input name="email" type="email" maxLength={254} /></label>
          <label>Rol del contacto<input name="rol" maxLength={80} /></label>
          <label>Código de productor<input name="codigoProductor" maxLength={100} /></label>
          <label>Asunto propio<input name="asunto" maxLength={300} placeholder="Opcional; usa el asunto general si queda vacío" /></label>
          <label>Instrucciones<textarea name="instrucciones" rows={2} maxLength={1000} /></label>
          <label className="cotizacion-check"><input name="activa" type="checkbox" defaultChecked /> Activa para nuevas solicitudes</label>
          <button className="boton boton-primario">Guardar aseguradora</button>
        </form>
      </section>

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Voz, plantillas y seguimientos</h2>
        <form action={guardarConfiguracionCotizacion} className="cotizacion-ajuste-form">
          <label>Persona<select name="persona" defaultValue={config?.persona ?? "Verónica"}><option>Verónica</option><option>María</option><option>Carlos</option><option>Personalizada</option></select></label>
          <label>Nombre del agente<input name="nombreAgente" defaultValue={config?.nombreAgente ?? "Verónica"} maxLength={60} /></label>
          <label>Cómo querés que escriba<textarea name="personalidad" defaultValue={config?.personalidad ?? "Profesional, cortés y meticulosa."} rows={3} maxLength={1000} /></label>
          <label>Intervalo general<select name="intervaloHoras" defaultValue={config?.intervaloHoras ?? 48}><option value="24">24 horas</option><option value="48">48 horas</option><option value="72">72 horas</option></select></label>
          <label>Máximo de seguimientos<select name="maxSeguimientos" defaultValue={config?.maxSeguimientos ?? 3}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Estrategia en días hábiles<textarea name="estrategiaSeguimiento" defaultValue={config?.estrategiaSeguimiento ?? "Cada 3 días hábiles; si la aseguradora ya dio un folio, esperar la cotización."} rows={3} maxLength={1000} required /></label>
          <p className="texto-suave">Se aceptan reglas como «cada 3 días hábiles», «para Flotas cada 1 día hábil» y «si hay folio, esperar». La fecha se calcula sin fines de semana ni feriados cargados.</p>
          <label>Formato del asunto<input name="plantillaAsunto" defaultValue={config?.plantillaAsunto ?? "SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]"} maxLength={300} /></label>
          <label>Plantilla del correo<textarea name="plantillaCuerpo" defaultValue={config?.plantillaCuerpo ?? "Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}. Organización: {organizacion}. Moneda: {moneda}. Forma de pago: {forma_de_pago}."} rows={5} maxLength={5000} /></label>
          <label>Instrucciones fijas<textarea name="instruccionesCuerpo" defaultValue={config?.instruccionesCuerpo ?? ""} rows={2} maxLength={2000} /></label>
          <label>Cuenta saliente<input name="cuentaSaliente" type="email" defaultValue={config?.cuentaSaliente ?? ""} maxLength={254} /></label>
          <label className="cotizacion-check"><input name="cotizarAutomaticamente" type="checkbox" defaultChecked={config?.cotizarAutomaticamente ?? false} /> Seleccionar todas las aseguradoras activas del ramo al crear una solicitud</label>
          <p className="texto-suave">Aunque esta opción esté activa, nunca se manda un correo sin que lo apruebes.</p>
          <label className="cotizacion-check"><input name="agenteActivo" type="checkbox" defaultChecked={config?.agenteActivo ?? false} /> Activar la preparación de seguimientos</label>
          <button className="boton boton-primario">Guardar configuración</button>
        </form>
      </section>

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Asistencia con IA</h2>
        <p>{estadoIA.motivo === "sin_clave" ? "Para habilitarla, configurá ANTHROPIC_API_KEY en el servidor." : estadoIA.habilitada ? "Activa para redactar borradores, responder consultas y extraer datos de cotizaciones." : "Desactivada para esta organización."}</p>
        <form action={guardarFeatureCotizacionIA} className="cotizacion-ajuste-form">
          <label className="cotizacion-check"><input name="iaActiva" type="checkbox" defaultChecked={estadoIA.habilitada} disabled={estadoIA.motivo === "sin_clave"} /> Activar IA para Cotización</label>
          <p className="texto-suave">Los datos de la solicitud solo pasan por el proveedor de IA detrás de la capa propia. El agente propone; vos confirmás. Cada resultado registra modelo, tokens y costo estimado.</p>
          <button className="boton">Guardar preferencia de IA</button>
        </form>
      </section>

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Paquetes de cobertura</h2>
        {paquetes.map(({ paquete, aseguradora }) => <p key={paquete.id}><strong>{aseguradora} · {paquete.ramo}:</strong> {paquete.nombre}{paquete.deducible ? ` · Franquicia ${paquete.deducible}` : ""}</p>)}
        <form action={guardarPaqueteCotizacion} className="cotizacion-ajuste-form">
          <label>Aseguradora<select name="aseguradoraId" required>{aseguradoras.map((aseguradora) => <option key={aseguradora.id} value={aseguradora.id}>{aseguradora.nombre}</option>)}</select></label>
          <label>Ramo<input name="ramo" required defaultValue="Automotor" /></label>
          <label>Nombre de cobertura<input name="nombre" required placeholder="Terceros completo (B1)" /></label>
          <label>Franquicia<input name="deducible" /></label>
          <label>Suma asegurada<input name="sumaAsegurada" type="number" min="0" step="0.01" /></label>
          <label>Condiciones<textarea name="condiciones" rows={2} /></label>
          <button className="boton">Agregar paquete</button>
        </form>
      </section>

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Portales</h2><p>Guardar credenciales no conecta el portal. Esta pantalla mantiene la clave cifrada con AES-GCM; el adaptador sigue simulado.</p>
        {aseguradoras.filter((aseguradora) => aseguradora.canal !== "correo").map((aseguradora) => {
          const conexion = conexiones.find((item) => item.clave === `portal:${aseguradora.nombre}`);
          return <div key={aseguradora.id} className="cotizacion-portal-credencial">
            <p><strong>{aseguradora.nombre}</strong> · {conexion?.datos.credencialesCifradas ? "credenciales guardadas" : "sin credenciales"} · conexión simulada</p>
            <form action={guardarCredencialPortal} className="cotizacion-ajuste-form">
              <input type="hidden" name="compania" value={aseguradora.nombre} />
              <label>Usuario<input name="usuario" autoComplete="off" maxLength={200} required /></label>
              <label>Clave<input name="clavePortal" type="password" autoComplete="new-password" maxLength={1000} required /></label>
              <button className="boton">Guardar cifrada</button>
            </form>
          </div>;
        })}
      </section>
    </main>
  );
}
