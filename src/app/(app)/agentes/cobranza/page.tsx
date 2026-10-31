import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoAgente } from "@/components/agentes/Agente";
import { Filtros } from "@/components/agentes/Filtros";
import { Paginas } from "@/components/Paginas";
import { leerConfigCobranza, sincronizarCasos } from "@/agentes/cobranza/casos";
import { diaLocal, listarCasos, pendientesDeAprobacion, situacionDelCaso, type CasoCobranza } from "@/agentes/cobranza/datos";
import { etiquetaPendiente, leerReferencia, textoVencimiento } from "@/lib/cobranza";
import { EN_GESTION, ESTADO_INFO, kpisCobranza, pestanaDe, PESTANAS, textoIntentos, vencimientoRelativo, type Pestana } from "@/lib/cobranza/estados";
import type { EstadoCaso } from "@/lib/cobranza/tipos";
import { obtenerCuenta } from "@/lib/datos";
import { agenteConfigurado } from "@/lib/datos-agentes";
import { sumarDias } from "@/lib/fechas";
import { importe } from "@/lib/formato";
import { normalizar } from "@/fuentes/clasificacion";
import { conFirma } from "@/lib/plantillas";
import { aprobarTodos } from "./actions";
import { EstadoPunto, Monto, MontoKpi } from "./Componentes";
import { TarjetaPendiente, type Pendiente } from "./TarjetaPendiente";
import "../agentes.css";
import "./cobranza.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const POR_PAGINA = 25;
const unico = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

function coincide(caso: CasoCobranza, q: string): boolean {
  const n = normalizar(q);
  return [caso.asegurado.nombre, caso.polizaNumero, caso.recibo, caso.asegurado.documento, caso.compania].some((v) => v && normalizar(v).includes(n));
}

export default async function Cobranza({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pestana: Pestana = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "activos";
  const q = unico(sp.q).trim();
  const filtroEstado = unico(sp.estado) as EstadoCaso | "";
  const filtroCompania = unico(sp.compania);
  const pagina = Math.max(1, Number(unico(sp.pagina)) || 1);

  const config = await leerConfigCobranza();
  const ahora = new Date();
  const dia = diaLocal(config);
  const hoy = dia(ahora);
  await sincronizarCasos(hoy, config);
  const inicioMes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`);
  const [activo, casos, pendientesDb, cuenta] = await Promise.all([agenteConfigurado("cobranza"), listarCasos(inicioMes), pendientesDeAprobacion(hoy), obtenerCuenta()]);

  const situacion = new Map(casos.map((k) => [k.id, situacionDelCaso(k, config, hoy)]));
  const kpis = kpisCobranza(
    casos.map((k) => ({ estado: k.estado, monto: k.monto, moneda: k.moneda, ultimoContactoEl: k.ultimoContactoEl, pagadoEl: k.pagadoEl, aContactarHoy: activo && situacion.get(k.id)?.motivoNoContactar === null })),
    hoy,
    dia,
  );
  const porPestana = new Map<Exclude<Pestana, "aprobar">, CasoCobranza[]>([["activos", []], ["sin_datos", []], ["excluidos", []]]);
  for (const k of casos) {
    const p = pestanaDe(k, hoy.slice(0, 7), dia);
    if (p) porPestana.get(p)!.push(k);
  }
  const contador: Record<Pestana, number> = {
    activos: porPestana.get("activos")!.length,
    sin_datos: porPestana.get("sin_datos")!.length,
    excluidos: porPestana.get("excluidos")!.length,
    aprobar: pendientesDb.length,
  };

  const lista = pestana === "aprobar" ? [] : porPestana.get(pestana)!;
  const companias = [...new Set(lista.map((k) => k.compania).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, "es"));
  const filtrados = lista
    .filter((k) => !q || coincide(k, q))
    .filter((k) => !filtroEstado || k.estado === filtroEstado)
    .filter((k) => !filtroCompania || k.compania === filtroCompania)
    .sort((a, b) => Number(a.estado === "pagado") - Number(b.estado === "pagado") || a.vencimiento.localeCompare(b.vencimiento) || a.id - b.id);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visibles = filtrados.slice((Math.min(pagina, paginas) - 1) * POR_PAGINA, Math.min(pagina, paginas) * POR_PAGINA);
  const urlPagina = (n: number) => {
    const p = new URLSearchParams(Object.entries({ tab: pestana === "activos" ? "" : pestana, q, estado: filtroEstado, compania: filtroCompania, pagina: n > 1 ? String(n) : "" }).filter(([, v]) => v));
    return `/agentes/cobranza${p.size ? `?${p}` : ""}`;
  };

  const pendientes: Pendiente[] = pendientesDb.flatMap((m) => {
    const ref = leerReferencia(m.referencia);
    const k = m.casos[0];
    if (!k) return [];
    const empresa = m.tipo === "empresa";
    return [
      {
        id: m.id,
        cliente: k.asegurado.nombre,
        poliza: `${k.compania ?? "Sin compañía"} · ${k.polizas > 1 ? `${k.ramo} y ${k.polizas - 1} más` : k.ramo} · ${k.recibo}${m.casos.length > 1 ? ` · y ${m.casos.length - 1} ${m.casos.length === 2 ? "recibo más" : "recibos más"}` : ""}`,
        monto: importe(m.casos.reduce((s, c) => s + c.monto, 0), k.moneda === "USD" ? "USD" : "ARS"),
        vence: textoVencimiento(k.vencimiento, hoy),
        etiqueta: etiquetaPendiente(ref?.tipo ?? "agente", k.vencimiento, hoy),
        canal:
          m.canal === "llamada"
            ? "Llamada tuya"
            : m.canal === "whatsapp"
              ? `WhatsApp · ${m.destinatario}`
              : `Email · ${empresa && m.contactoNombre ? m.contactoNombre : m.destinatario}`,
        esWhatsApp: m.canal === "whatsapp",
        porque: m.motivo,
        texto: conFirma(m.texto, config.firmanteNombre || cuenta.nombre),
        llamada: m.canal === "llamada",
        telefono: m.canal === "llamada" ? m.destinatario : null,
        manana: sumarDias(hoy, 1),
        casoId: k.id,
      },
    ];
  });
  const mensajesParaEnviar = pendientes.filter((p) => !p.llamada).length;
  const modo = config.modoPrueba ? "Activo · modo prueba" : config.pedirAprobacion ? "Activo · te pide aprobación" : "Activo · escribe solo";

  return (
    <>
      <EncabezadoAgente
        agente="cobranza"
        titulo="Agente de Cobranza"
        activo={activo}
        estado={modo}
        descripcion="Sigue los recibos por vencer y vencidos de tu cartera, le escribe al asegurado por los canales habilitados, registra cada intento y respuesta, y te pasa lo que no puede resolver."
      >
        <Link href="/agentes/cobranza/ejecuciones" className="boton boton-mediano">
          Ver ejecuciones
        </Link>
        <Link href="/agentes/cobranza/api" className="boton boton-mediano">
          API docs
        </Link>
        <Link href="/agentes/cobranza/configuracion" className="boton boton-mediano">
          Configuración
        </Link>
      </EncabezadoAgente>

      <Aviso codigo={sp.aviso} />

      {config.modoPrueba && (
        <p className="cob-banda-prueba" role="note">
          <strong>Modo prueba:</strong> todo lo que escribe el agente va a los destinos de prueba, nunca a tus asegurados.{" "}
          <Link href="/agentes/cobranza/configuracion?seccion=pruebas">Configurar</Link>
        </p>
      )}

      <section aria-label="Resumen" className="kpis-agente cob-kpis">
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Activos</span>
          <span className="kpi-agente-valor tabular">{kpis.activos.cantidad}</span>
          <MontoKpi t={kpis.activos} />
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Hoy</span>
          <span className="kpi-agente-valor tabular">{kpis.hoy.cantidad}</span>
          <span className="cob-mono cob-kpi-monto">
            {kpis.hoy.contactados} contactados · {kpis.hoy.porContactar} por contactar
          </span>
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Promesas</span>
          <span className="kpi-agente-valor tabular">{kpis.promesas.cantidad}</span>
          <MontoKpi t={kpis.promesas} />
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Escalados</span>
          <span className={`kpi-agente-valor tabular${kpis.escalados.cantidad ? " texto-rojo" : ""}`}>{kpis.escalados.cantidad}</span>
          <MontoKpi t={kpis.escalados} />
        </div>
        <div className="kpi-agente">
          <span className="kpi-agente-titulo">Pagados (mes)</span>
          <span className="kpi-agente-valor tabular texto-verde">{kpis.pagadosMes.cantidad}</span>
          <MontoKpi t={kpis.pagadosMes} />
        </div>
      </section>

      <nav aria-label="Casos" className="pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={p.id === "activos" ? "/agentes/cobranza" : `/agentes/cobranza?tab=${p.id}`} aria-current={pestana === p.id ? "page" : undefined} className="pestana">
            {p.texto} <span className={p.id === "aprobar" && contador.aprobar ? "contador-rojo" : "contador-gris"}>{contador[p.id]}</span>
          </Link>
        ))}
      </nav>

      {pestana === "aprobar" ? (
        <>
          {mensajesParaEnviar > 1 && (
            <form action={aprobarTodos} className="cob-aprobar-todos">
              <button type="submit" className="boton boton-primario">
                Aprobar y enviar {mensajesParaEnviar} mensajes
              </button>
            </form>
          )}
          <div className="lista-pendientes">
            {pendientes.map((p) => (
              <TarjetaPendiente key={p.id} p={p} />
            ))}
            {pendientes.length === 0 && (
              <section className="tarjeta vacio-agente">
                <div className="celda-fuerte">No hay nada para aprobar</div>
                <p className="texto-suave">
                  {config.modoPrueba
                    ? "En modo prueba el agente no deja mensajes para aprobar: los manda a los destinos de prueba."
                    : config.pedirAprobacion
                      ? "Cuando el agente prepare un mensaje, aparece acá para que lo apruebes."
                      : "El agente escribe solo. Acá llegan los pedidos del Validador de pagos y las llamadas."}
                </p>
              </section>
            )}
          </div>
        </>
      ) : (
        <section aria-label="Casos de cobranza" className="tarjeta">
          <div className="lista-cabecera cob-filtros">
            <Filtros
              campos={[
                { nombre: "q", tipo: "buscar", etiqueta: "Buscar", placeholder: "Asegurado, nº de póliza o recibo" },
                ...(pestana === "activos"
                  ? [
                      {
                        nombre: "estado",
                        tipo: "elegir" as const,
                        etiqueta: "Estatus",
                        opciones: [{ valor: "", texto: "Todos los estatus" }, ...[...EN_GESTION, "pagado" as const].map((e) => ({ valor: e, texto: ESTADO_INFO[e].texto }))],
                      },
                    ]
                  : []),
                { nombre: "compania", tipo: "elegir", etiqueta: "Aseguradora", opciones: [{ valor: "", texto: "Todas las aseguradoras" }, ...companias.map((c) => ({ valor: c, texto: c }))] },
              ]}
              valores={{ q, estado: filtroEstado, compania: filtroCompania }}
            />
          </div>
          <div className="tabla-scroll">
            <table className="tabla cob-tabla">
              <thead>
                <tr>
                  <th scope="col">Póliza</th>
                  <th scope="col">Estatus</th>
                  <th scope="col" className="numero">
                    Monto
                  </th>
                  <th scope="col">Intentos</th>
                  <th scope="col">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((k) => {
                  const intentos = textoIntentos(k.intentos, k.ultimoContactoEl, hoy, dia);
                  const dias = situacion.get(k.id)!.diasParaVencer;
                  const detalle =
                    k.estado === "promesa" && k.promesaEl
                      ? `para el ${k.promesaEl.slice(8, 10)}/${k.promesaEl.slice(5, 7)}`
                      : pestana === "excluidos" || k.estado === "escalado"
                        ? k.motivo
                        : null;
                  return (
                    <tr key={k.id} className="cob-fila">
                      <td>
                        <Link href={`/agentes/cobranza/${k.id}`} className="cob-fila-enlace celda-fuerte">
                          {k.asegurado.nombre}
                        </Link>
                        <div className="cob-mono cob-secundaria">
                          {[k.compania ?? "Sin compañía", k.polizaNumero ?? "s/n", k.recibo].join(" · ")}
                          {k.polizas > 1 ? ` · +${k.polizas - 1}` : ""}
                        </div>
                      </td>
                      <td>
                        <EstadoPunto estado={k.estado} detalle={detalle} />
                        {pestana === "sin_datos" && <div className="nota-pie">Completá el teléfono o el correo →</div>}
                      </td>
                      <td className="numero celda-fuerte">
                        <Monto valor={k.monto} moneda={k.moneda} />
                      </td>
                      <td>
                        <div className="tabular">{intentos.cantidad}</div>
                        <div className="nota-pie">{intentos.ultimo}</div>
                      </td>
                      <td>
                        <span className={dias < 0 ? "texto-rojo tabular" : "tabular"}>{vencimientoRelativo(dias)}</span>
                        <div className="nota-pie tabular">{`${k.vencimiento.slice(8, 10)}/${k.vencimiento.slice(5, 7)}`}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtrados.length === 0 && (
              <p className="vacio">
                {lista.length === 0
                  ? pestana === "activos"
                    ? "No hay recibos para cobrar entre los vencidos de los últimos 60 días y los que vencen en los próximos 30."
                    : pestana === "sin_datos"
                      ? "Todos los recibos en gestión tienen teléfono o correo."
                      : "Las reglas de la configuración no dejan afuera ningún recibo."
                  : "No hay casos con estos filtros."}
              </p>
            )}
          </div>
          <Paginas pagina={Math.min(pagina, paginas)} paginas={paginas} href={urlPagina} />
        </section>
      )}
    </>
  );
}
