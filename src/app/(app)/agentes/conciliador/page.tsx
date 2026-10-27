import Link from "next/link";
import { EncabezadoAgente } from "@/components/agentes/Agente";
import { agenteConfigurado, obtenerDatosConciliacion } from "@/lib/datos-agentes";
import { obtenerCuenta } from "@/lib/datos";
import { diaEnArgentina, diaYMes } from "@/lib/fechas";
import { pesos } from "@/lib/formato";
import { conciliarPeriodo, textoReclamoComision, type FilaConciliacion } from "@/lib/conciliacion";
import { conFirma } from "@/lib/plantillas";
import { enviarReclamo } from "./actions";
import { AsistenteLiquidacion } from "./AsistenteLiquidacion";
import "../agentes.css";

export const instant = false;

const AVISOS: Record<string, string> = {
  "reclamo-enviado": "El reclamo se envió a la compañía.",
  "envio-error": "No se pudo enviar. Revisá la conexión y volvé a intentar.",
  "reclamo-incompleto": "Completá el período, la compañía, el asunto y el mensaje del reclamo.",
  "reclamo-sin-diferencia": "Ya no hay una diferencia pendiente para reclamar en ese período.",
  "error-operacion": "No pudimos completar la operación por un problema inesperado. Revisá el estado antes de volver a intentarlo.",
  "liquidacion-cargada": "La liquidación se cargó. Revisá las diferencias del período.",
  "archivo-vacio": "Elegí un archivo CSV o XLSX.",
  "archivo-grande": "El archivo supera el límite de 4 MB.",
  "archivo-invalido": "No pudimos leer el archivo. Revisá el formato e intentá de nuevo.",
  "columnas-incompletas": "No encontramos compañía, período, póliza y comisión en los encabezados.",
  "sin-filas": "El archivo no tiene filas con liquidaciones.",
  "mezcla-periodos": "El archivo tiene compañías o períodos distintos. Cargá una liquidación por archivo.",
  "liquidacion-existente": "Ya hay una liquidación de esa compañía para ese período. No se reemplazó el archivo existente.",
};

function periodosRecientes(): { id: string; texto: string }[] {
  const [anio, mes] = diaEnArgentina(new Date()).slice(0, 7).split("-").map(Number);
  return Array.from({ length: 12 }, (_, indice) => {
    const fecha = new Date(Date.UTC(anio, mes - 1 - indice, 1));
    const id = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      id,
      texto: new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(fecha),
    };
  });
}

function Reclamo({ fila, productor }: { fila: FilaConciliacion; productor: string | null }) {
  const reclamo = textoReclamoComision(fila);
  return (
    <form action={enviarReclamo} className="conciliacion-reclamo-form">
      <input type="hidden" name="periodo" value={fila.periodo} />
      <input type="hidden" name="compania" value={fila.compania} />
      <label>
        <span>Asunto</span>
        <input name="asunto" type="text" defaultValue={reclamo.asunto} maxLength={250} required />
      </label>
      <label>
        <span>Mensaje</span>
        <textarea name="texto" defaultValue={conFirma(reclamo.texto, productor)} rows={10} maxLength={8000} required />
      </label>
      <button type="submit" className="boton boton-primario">Enviar reclamo</button>
    </form>
  );
}

export default async function Conciliador({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const periodos = periodosRecientes();
  const periodo = typeof sp.periodo === "string" && periodos.some((p) => p.id === sp.periodo) ? sp.periodo : periodos[1]?.id ?? periodos[0].id;
  const [datos, activo, cuenta] = await Promise.all([
    obtenerDatosConciliacion(periodo),
    agenteConfigurado("conciliador"),
    obtenerCuenta(),
  ]);
  const filas = conciliarPeriodo(periodo, datos.cuotas, datos.acuerdos, datos.liquidaciones);
  const companiaElegida = typeof sp.cia === "string" ? sp.cia : "";
  const fila = filas.find((actual) => actual.compania === companiaElegida) ?? filas[0];
  const esperado = filas.reduce((suma, actual) => suma + actual.esperado, 0);
  const liquidado = filas.reduce((suma, actual) => suma + (actual.liquidado ?? 0), 0);
  const depositado = filas.reduce((suma, actual) => suma + (actual.depositado ?? 0), 0);
  const paraReclamar = filas.reduce((suma, actual) => suma + actual.diferencia, 0);
  const sinLiquidar = filas.filter((actual) => actual.estado === "sin-liquidacion").reduce((suma, actual) => suma + actual.esperado, 0);
  const liquidacionesRecibidas = filas.filter((actual) => actual.liquidado !== null).length;
  const aviso = typeof sp.aviso === "string" ? AVISOS[sp.aviso] ?? (/^fila-invalida-\d+$/.test(sp.aviso) ? `La fila ${sp.aviso.split("-").at(-1)} tiene datos incompletos o inválidos.` : null) : null;
  const avisoError = sp.aviso === "envio-error" || sp.aviso === "error-operacion" || sp.aviso === "reclamo-incompleto" || sp.aviso === "reclamo-sin-diferencia" || (typeof sp.aviso === "string" && /^fila-invalida-\d+$/.test(sp.aviso));

  return (
    <>
      <EncabezadoAgente
        agente="conciliador"
        titulo="Agente conciliador"
        activo={activo}
        descripcion="Cruza las comisiones que te corresponden por las cuotas cobradas con lo liquidado y depositado por cada compañía. Las retenciones explican el neto, no son una diferencia para reclamar."
      >
        <form action="/agentes/conciliador" className="conciliacion-periodo-form">
          <label htmlFor="periodo-conciliacion">Período</label>
          <select id="periodo-conciliacion" name="periodo" defaultValue={periodo}>
            {periodos.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.texto}</option>)}
          </select>
          <button type="submit" className="boton">Ver período</button>
        </form>
        <a href={`/api/agentes/conciliador/exportar?periodo=${periodo}`} className="boton">Exportar para el contador</a>
        <details className="conciliacion-subir">
          <summary className="boton">Subir liquidación</summary>
          <AsistenteLiquidacion periodo={periodo} />
        </details>
      </EncabezadoAgente>

      {aviso && <p role={avisoError ? "alert" : "status"} className={`conciliacion-aviso${avisoError ? " error" : ""}`}>{aviso}</p>}

      <section aria-label="Resumen del período" className="kpis-agente conciliacion-kpis">
        <div className="kpi-agente"><span className="kpi-agente-titulo">Te corresponde</span><span className="kpi-agente-valor kpi-monto">{pesos(esperado)}</span><span className="kpi-agente-detalle">por las cuotas cobradas en {periodos.find((p) => p.id === periodo)?.texto}</span></div>
        <div className="kpi-agente"><span className="kpi-agente-titulo">Liquidado por las compañías</span><span className="kpi-agente-valor kpi-monto">{pesos(liquidado)}</span><span className="kpi-agente-detalle">{liquidacionesRecibidas} de {filas.length} liquidaciones recibidas</span></div>
        <div className="kpi-agente"><span className="kpi-agente-titulo">Depositado en tu cuenta</span><span className="kpi-agente-valor kpi-monto">{pesos(depositado)}</span><span className="kpi-agente-detalle">neto de retenciones</span></div>
        <div className="kpi-agente"><span className="kpi-agente-titulo">Para reclamar</span><span className={`kpi-agente-valor kpi-monto${paraReclamar ? " texto-rojo" : ""}`}>{pesos(paraReclamar)}</span><span className="kpi-agente-detalle">incluye {pesos(sinLiquidar)} sin liquidar</span></div>
      </section>

      <section aria-label="Conciliación por compañía" className="tarjeta conciliacion-tabla-contenedor">
        <header className="conciliacion-seccion-titulo"><h2>Por compañía</h2><span>Elegí una compañía para ver el detalle</span></header>
        <div className="tabla-scroll">
          <table className="tabla conciliacion-tabla">
            <thead><tr><th>Compañía</th><th>Liquidación</th><th className="numero">Te corresponde</th><th className="numero">Liquidado</th><th className="numero">Depositado</th><th className="numero">Diferencia</th><th>Estado</th></tr></thead>
            <tbody>
              {filas.map((actual) => (
                <tr key={actual.compania} aria-current={fila?.compania === actual.compania ? "true" : undefined}>
                  <td><Link href={`/agentes/conciliador?periodo=${periodo}&cia=${encodeURIComponent(actual.compania)}`} className="conciliacion-compania">{actual.compania}</Link></td>
                  <td>{actual.recibidaEl ? `Recibida el ${diaYMes(actual.recibidaEl)}` : "No llegó"}</td>
                  <td className="numero">{pesos(actual.esperado)}</td>
                  <td className="numero">{actual.liquidado === null ? "—" : pesos(actual.liquidado)}</td>
                  <td className="numero">{actual.depositado === null ? "—" : pesos(actual.depositado)}</td>
                  <td className={`numero${actual.diferencia ? " conciliacion-diferencia" : ""}`}>{actual.diferencia ? pesos(actual.diferencia) : "—"}</td>
                  <td><span className={`pastilla ${actual.estado === "cierra" ? "pastilla-verde" : actual.estado === "reclamar" ? "pastilla-rojo" : "pastilla-ambar"}`}>{actual.estado === "cierra" ? "Cierra" : actual.estado === "reclamar" ? "Reclamar" : "Falta liquidación"}</span></td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={7} className="conciliacion-vacia">No hay cuotas pagadas ni liquidaciones para este período.</td></tr>}
            </tbody>
            {filas.length > 0 && <tfoot><tr><th>Total</th><td></td><th className="numero">{pesos(esperado)}</th><th className="numero">{pesos(liquidado)}</th><th className="numero">{pesos(depositado)}</th><th className="numero conciliacion-diferencia">{pesos(paraReclamar)}</th><td></td></tr></tfoot>}
          </table>
        </div>
      </section>

      {fila && (
        <section aria-label="Detalle de la compañía" className="tarjeta conciliacion-detalle">
          <header>
            <h2>{fila.compania} · {periodos.find((p) => p.id === periodo)?.texto}</h2>
            <p>{fila.resumen}</p>
          </header>
          <div className="conciliacion-detalle-cuerpo">
            <section className="conciliacion-hallazgos">
              <h3>Lo que encontró el agente</h3>
              {fila.hallazgos.map((hallazgo, indice) => (
                <article className={`conciliacion-hallazgo ${hallazgo.tipo}`} key={`${hallazgo.titulo}-${indice}`}>
                  <span className="conciliacion-hallazgo-icono" aria-label={hallazgo.tipo === "retenciones" ? "Informativo" : "Revisar"}>{hallazgo.tipo === "retenciones" ? "✓" : hallazgo.tipo === "porcentaje" ? "×" : "!"}</span>
                  <div><div className="conciliacion-hallazgo-cabecera"><h4>{hallazgo.titulo}</h4><strong>{pesos(hallazgo.monto)}</strong></div><p>{hallazgo.texto}</p></div>
                </article>
              ))}
              {!fila.hallazgos.length && <p className="conciliacion-cierra">No hay nada que reclamar. La liquidación coincide con las cuotas cobradas.</p>}
            </section>
            {fila.estado !== "cierra" ? (
              <section className="conciliacion-reclamo">
                <h3>Reclamo listo para enviar</h3>
                <p className="texto-suave">Para: {fila.compania}</p>
                <Reclamo fila={fila} productor={cuenta.nombre} />
              </section>
            ) : (
              <p className="conciliacion-cierra">El depósito coincide con las retenciones informadas. No hay diferencias para reclamar.</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
