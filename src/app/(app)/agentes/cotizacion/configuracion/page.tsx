import Link from "next/link";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { estadoIACotizacion } from "@/agentes/cotizacion/ia";
import { cambiarTipoSeguroCotizacion, guardarAseguradoraCotizacion, guardarConfiguracionCotizacion, guardarPaqueteCotizacion, guardarTipoSeguroCotizacion, importarAseguradorasCotizacion, guardarFeatureCotizacionIA } from "./actions";
import { EstrategiaSeguimiento } from "./EstrategiaSeguimiento";
import "../../agentes.css";

/** Los avisos que son un error (los demás confirman lo que se guardó). */
const AVISOS_ERROR = new Set(["estrategia-invalida", "configuracion-invalida", "aseguradora-invalida", "paquete-invalido", "archivo-catalogo-invalido", "encabezados-catalogo-invalidos", "datos-catalogo-invalidos", "ia-sin-clave", "tipo-invalido", "tipo-repetido"]);

export default async function ConfiguracionCotizacion({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  await connection();
  const [{ aviso }, aseguradoras, paquetes, configuraciones, estadoIA, tipos] = await Promise.all([
    searchParams,
    db.select().from(schema.cotizacionAseguradoras).orderBy(schema.cotizacionAseguradoras.nombre),
    db.select({ paquete: schema.cotizacionPaquetes, aseguradora: schema.cotizacionAseguradoras.nombre })
      .from(schema.cotizacionPaquetes).innerJoin(schema.cotizacionAseguradoras, eq(schema.cotizacionAseguradoras.id, schema.cotizacionPaquetes.aseguradoraId)),
    db.select().from(schema.cotizacionConfig).limit(1),
    estadoIACotizacion(),
    db.select().from(schema.cotizacionTiposSeguro).orderBy(schema.cotizacionTiposSeguro.id),
  ]);
  const config = configuraciones[0];
  const nombresAviso: Record<string, string> = {
    "tipo-guardado": "Guardaste el tipo de seguro.",
    "tipo-activado": "Activaste el tipo de seguro: vuelve a aparecer en la nueva solicitud.",
    "tipo-desactivado": "Desactivaste el tipo de seguro: ya no aparece en la nueva solicitud. Las solicitudes que lo usan no cambian.",
    "tipo-invalido": "Revisá el nombre del ramo.",
    "tipo-repetido": "Ya hay un tipo de seguro con ese ramo.",
    guardado: "Guardaste la configuración.",
    "estrategia-invalida": "La estrategia debe indicar una frecuencia en días hábiles o una regla por ramo.",
    "configuracion-invalida": "Revisá el intervalo y el máximo de seguimientos.",
    "aseguradora-invalida": "Revisá el nombre y el correo de contacto.",
    "aseguradora-guardada": "Guardaste la aseguradora.",
    "paquete-invalido": "Revisá los datos del paquete.",
    "paquete-guardado": "Guardaste el paquete.",
    "archivo-catalogo-invalido": "Subí un CSV o Excel de hasta 5 MB con aseguradora y ramo.",
    "encabezados-catalogo-invalidos": "El archivo debe tener columnas Aseguradora y Ramos.",
    "datos-catalogo-invalidos": "Revisá que cada fila tenga nombre y ramos.",
    "importacion-catalogo-ok": "Importamos las aseguradoras.",
    "ia-sin-clave": "La IA quedó desactivada: configurá ANTHROPIC_API_KEY en el servidor.",
    "ia-guardada": "Actualizaste el uso de IA de Cotización.",
  };
  return (
    <main className="agente-pagina cotizacion-ajustes">
      <header className="encabezado-pagina">
        <div><Link href="/agentes/cotizacion">← Cotización</Link><h1>Configuración del agente</h1><p>Elegí con qué compañías cotizás y cómo prepara los pedidos el agente.</p></div>
      </header>
      {aviso && <p className={`cotizacion-aviso${AVISOS_ERROR.has(aviso) ? " error" : ""}`} role={AVISOS_ERROR.has(aviso) ? "alert" : "status"}>{nombresAviso[aviso] ?? "Se guardaron los cambios."}</p>}

      <section id="aseguradoras" className="tarjeta cotizacion-ajuste-seccion">
        <h2>Aseguradoras</h2><p>A quién le pide cotizaciones el agente y a qué correo. Cada correo espera tu aprobación. Cómo se conecta con cada compañía (conexión directa, portal o solo correo) está en <Link href="/configuracion/companias?agente=cotizacion">Conexiones con las compañías</Link>.</p>
        <div className="cotizacion-botones-borrador"><Link className="boton" href="/agentes/cotizacion/configuracion/exportar">Exportar CSV</Link><Link className="boton" href="/agentes/cotizacion/configuracion/exportar?formato=xlsx">Exportar Excel</Link></div>
        <form action={importarAseguradorasCotizacion} className="cotizacion-ajuste-form"><label>Importar aseguradoras (CSV o Excel)<input type="file" name="archivoAseguradoras" accept=".csv,.xlsx" required /></label><button className="boton">Importar catálogo</button></form>
        <div className="tabla-scroll"><table className="tabla"><thead><tr><th>Aseguradora</th><th>Ramos</th><th>Contacto</th><th>Activa</th></tr></thead>
          <tbody>{aseguradoras.map((aseguradora) => <tr key={aseguradora.id}><td>{aseguradora.nombre}</td><td>{aseguradora.ramos.join(", ")}</td><td>{aseguradora.contactos.map((contacto) => contacto.email).join(", ") || "Sin contacto"}</td><td>{aseguradora.activa ? "Sí" : "No"}</td></tr>)}</tbody>
        </table></div>
        <form action={guardarAseguradoraCotizacion} className="cotizacion-ajuste-form">
          <h3>Agregar o editar aseguradora</h3>
          <label>Nombre<input name="nombre" required maxLength={120} /></label>
          <label>Ramos separados por coma<input name="ramos" defaultValue="Automotor, Flotas" /></label>
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

      <section id="tipos" className="tarjeta cotizacion-ajuste-seccion">
        <h2>Tipos de seguro</h2>
        <p>Los ramos que vendés, con su descripción y sus sub-tipos. La nueva solicitud ofrece los activos. Desactivar uno no borra nada: las solicitudes que lo usan siguen igual.</p>
        <div className="tabla-scroll"><table className="tabla cotizacion-tabla-tipos"><thead><tr><th>Ramo</th><th>Descripción</th><th>Sub-tipos</th><th>Estado</th><th><span className="visualmente-oculto">Acciones</span></th></tr></thead>
          <tbody>{tipos.map((tipo) => <tr key={tipo.id}>
            <td><strong>{tipo.ramo}</strong></td>
            <td>{tipo.descripcion || "—"}</td>
            <td>{tipo.subTipos.join(", ") || "—"}</td>
            <td><span className={`pastilla ${tipo.activo ? "pastilla-verde" : "pastilla-gris"}`}>{tipo.activo ? "Activo" : "Inactivo"}</span></td>
            <td>
              <div className="cotizacion-botones-borrador">
                <details className="cotizacion-editar-tipo">
                  <summary className="boton">Editar<span className="visualmente-oculto"> {tipo.ramo}</span></summary>
                  <form action={guardarTipoSeguroCotizacion} className="cotizacion-ajuste-form">
                    <input type="hidden" name="id" value={tipo.id} />
                    <label>Descripción<input name="descripcion" defaultValue={tipo.descripcion} maxLength={300} /></label>
                    <label>Sub-tipos, separados por coma<input name="subTipos" defaultValue={tipo.subTipos.join(", ")} maxLength={2000} /></label>
                    <button className="boton boton-primario">Guardar {tipo.ramo}</button>
                  </form>
                </details>
                <form action={cambiarTipoSeguroCotizacion}><input type="hidden" name="id" value={tipo.id} /><input type="hidden" name="activo" value={tipo.activo ? "no" : "si"} /><button className="boton">{tipo.activo ? "Desactivar" : "Activar"}<span className="visualmente-oculto"> {tipo.ramo}</span></button></form>
              </div>
            </td>
          </tr>)}
          {!tipos.length && <tr><td colSpan={5}>Todavía no cargaste tipos de seguro: la nueva solicitud ofrece los ramos de siempre.</td></tr>}</tbody>
        </table></div>
        <form action={guardarTipoSeguroCotizacion} className="cotizacion-ajuste-form">
          <h3>Agregar un tipo de seguro</h3>
          <label>Ramo<input name="ramo" required maxLength={60} placeholder="Ej.: Embarcaciones" /></label>
          <label>Descripción<input name="descripcion" maxLength={300} placeholder="Ej.: Cascos y responsabilidad civil" /></label>
          <label>Sub-tipos, separados por coma<input name="subTipos" maxLength={2000} placeholder="Ej.: Veleros, Lanchas" /></label>
          <button className="boton boton-primario">Agregar tipo de seguro</button>
        </form>
      </section>

      <section id="voz" className="tarjeta cotizacion-ajuste-seccion">
        <h2>Voz, plantillas y seguimientos</h2>
        <form action={guardarConfiguracionCotizacion} className="cotizacion-ajuste-form">
          <h3>Voz y tono</h3>
          <p className="texto-suave">El nombre con el que el agente firma los correos y cómo escribe.</p>
          <label>Persona<select name="persona" defaultValue={config?.persona ?? "Verónica"}><option>Verónica</option><option>María</option><option>Carlos</option><option>Personalizada</option></select></label>
          <label>Nombre del agente<input name="nombreAgente" defaultValue={config?.nombreAgente ?? "Verónica"} maxLength={60} /></label>
          <label>Cómo querés que escriba<textarea name="personalidad" defaultValue={config?.personalidad ?? "Profesional, cortés y meticulosa."} rows={3} maxLength={1000} /></label>
          <h3>Comportamiento</h3>
          <label>Intervalo general<select name="intervaloHoras" defaultValue={config?.intervaloHoras ?? 48}><option value="24">24 horas</option><option value="48">48 horas</option><option value="72">72 horas</option></select></label>
          <label>Máximo de seguimientos<select name="maxSeguimientos" defaultValue={config?.maxSeguimientos ?? 3}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <EstrategiaSeguimiento valorInicial={config?.estrategiaSeguimiento ?? "Cada 3 días hábiles; si la aseguradora ya dio un folio, esperar la cotización."} iaHabilitada={estadoIA.habilitada} />
          <p className="texto-suave">Se aceptan reglas como «cada 3 días hábiles», «para Flotas cada 1 día hábil» y «si hay folio, esperar». La fecha se calcula sin fines de semana ni feriados de tu provincia.</p>
          <label>Formato del asunto<input name="plantillaAsunto" defaultValue={config?.plantillaAsunto ?? "SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]"} maxLength={300} /></label>
          <label>Plantilla del correo<textarea name="plantillaCuerpo" defaultValue={config?.plantillaCuerpo ?? "Buenos días. Solicitamos una propuesta para {cliente}, CUIT {cuit}, ramo {ramo}. Productor: {productor}. Organización: {organizacion}. Moneda: {moneda}. Forma de pago: {forma_de_pago}."} rows={5} maxLength={5000} /></label>
          <label>Instrucciones fijas<textarea name="instruccionesCuerpo" defaultValue={config?.instruccionesCuerpo ?? ""} rows={2} maxLength={2000} /></label>
          <label>Cuenta saliente<input name="cuentaSaliente" type="email" defaultValue={config?.cuentaSaliente ?? ""} maxLength={254} /></label>
          <label className="cotizacion-check"><input name="cotizarAutomaticamente" type="checkbox" defaultChecked={config?.cotizarAutomaticamente ?? false} /> Cotizar automáticamente: al crear una solicitud, el agente pide la cotización por conexión directa o portal a las compañías conectadas</label>
          <p className="texto-suave">Aunque esta opción esté activa, nunca se manda un correo sin que lo apruebes. Sin ella, el agente cotiza cuando tocás “Aprobar y cotizar” en la solicitud.</p>
          <label className="cotizacion-check"><input name="agenteActivo" type="checkbox" defaultChecked={config?.agenteActivo ?? false} /> Activar la preparación de seguimientos</label>
          <button className="boton boton-primario">Guardar configuración</button>
        </form>
      </section>

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Asistencia con IA</h2>
        <p>{estadoIA.motivo === "sin_clave" ? "Para habilitarla, configurá ANTHROPIC_API_KEY en el servidor." : estadoIA.motivo === "sin_cuota" ? "Activa, pero se llegó al tope de gasto de IA de este mes: vuelve el mes que viene." : estadoIA.habilitada ? "Activa para mejorar los correos, responder consultas y leer las cotizaciones en PDF." : "Desactivada."}</p>
        <form action={guardarFeatureCotizacionIA} className="cotizacion-ajuste-form">
          <label className="cotizacion-check"><input name="iaActiva" type="checkbox" defaultChecked={estadoIA.motivo === "activa" || estadoIA.motivo === "sin_cuota"} disabled={estadoIA.motivo === "sin_clave"} /> Activar IA para Cotización</label>
          <p className="texto-suave">El agente propone y vos confirmás: lo que lee de un PDF no cuenta hasta que lo revisás, y los correos siguen esperando tu aprobación. Lo que gasta entra en el tope mensual de IA de la cuenta.</p>
          <button className="boton">Guardar preferencia de IA</button>
        </form>
      </section>

      <section id="paquetes" className="tarjeta cotizacion-ajuste-seccion">
        <h2>Paquetes de cobertura</h2>
        <p>Lo que vendés: la cobertura que le pedís a cada compañía en cada ramo. Cada pedido lleva el paquete de su ramo; si una compañía no tiene, la nueva solicitud te avisa.</p>
        {paquetes.map(({ paquete, aseguradora }) => <p key={paquete.id}><strong>{aseguradora} · {paquete.ramo}:</strong> {paquete.nombre}{paquete.deducible ? ` · Franquicia ${paquete.deducible}` : ""}</p>)}
        {!paquetes.length && <p className="texto-suave">Todavía no cargaste ningún paquete.</p>}
        <form action={guardarPaqueteCotizacion} className="cotizacion-ajuste-form">
          <label>Aseguradora<select name="aseguradoraId" required>{aseguradoras.map((aseguradora) => <option key={aseguradora.id} value={aseguradora.id}>{aseguradora.nombre}</option>)}</select></label>
          <label>Ramo<input name="ramo" required defaultValue="Automotor" list="cotizacion-ramos-tipos" /></label>
          <datalist id="cotizacion-ramos-tipos">{tipos.filter((tipo) => tipo.activo).map((tipo) => <option key={tipo.id} value={tipo.ramo} />)}</datalist>
          <label>Nombre de cobertura<input name="nombre" required placeholder="Terceros completo (B1)" /></label>
          <label>Franquicia<input name="deducible" /></label>
          <label>Suma asegurada<input name="sumaAsegurada" type="number" min="0" step="0.01" /></label>
          <label>Condiciones<textarea name="condiciones" rows={2} /></label>
          <button className="boton">Agregar paquete</button>
        </form>
      </section>

      <section className="tarjeta cotizacion-ajuste-seccion">
        <h2>Conexiones con las compañías</h2>
        <p>El orden de los canales de cada compañía, el usuario y la clave de su portal, y si la conexión anda, están en una pantalla común a los tres agentes. Las claves se guardan cifradas y son las mismas que usa el Validador.</p>
        <div className="cotizacion-botones-borrador"><Link className="boton" href="/configuracion/companias?agente=cotizacion">Ir a Conexiones con las compañías</Link></div>
      </section>
    </main>
  );
}
