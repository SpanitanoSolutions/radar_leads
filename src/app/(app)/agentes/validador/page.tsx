import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { Bitacora, EncabezadoAgente } from "@/components/agentes/Agente";
import { Filtros } from "@/components/agentes/Filtros";
import { contactoDe } from "@/lib/asegurados";
import {
  agenteConfigurado,
  conexionesConectadas,
  obtenerActividad,
  obtenerComprobantes,
  obtenerContactos,
  obtenerCuotasRecientes,
  obtenerUltimosEnvios,
} from "@/lib/datos-agentes";
import { diaEnArgentina, diaYHora, fechaCorta } from "@/lib/fechas";
import { pesos, pesosConCentavos } from "@/lib/formato";
import { normalizar } from "@/fuentes/clasificacion";
import {
  agruparCobros,
  avisoConexionesValidador,
  detalleCobro,
  esPagoConCodigo,
  montosPorPlazo,
  pestanaDe,
  textoVence,
  type Pestana,
} from "@/lib/validador";
import { revisarAhora } from "./actions";
import { TablaCobros, type FilaCobro } from "./TablaCobros";
import "../agentes.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "pendientes", texto: "Pendientes" },
  { id: "revisar", texto: "Por revisar" },
  { id: "vencidos", texto: "Vencidos" },
  { id: "pagados", texto: "Pagados" },
];

export default async function Validador({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const verActividad = sp.ver === "actividad";
  const pestana = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "pendientes";
  const q = typeof sp.q === "string" ? sp.q : "";
  const cia = typeof sp.cia === "string" ? sp.cia : "";
  const hoy = diaEnArgentina(new Date());

  const [cuotas, activo, conectadas, actividad] = await Promise.all([
    obtenerCuotasRecientes(hoy),
    agenteConfigurado("validador"),
    conexionesConectadas(),
    verActividad ? obtenerActividad("validador") : Promise.resolve([]),
  ]);
  const cobros = agruparCobros(cuotas);
  const cabezas = cobros.map((c) => c.cabezaId);
  const [comprobantes, contactos, envios] = await Promise.all([
    obtenerComprobantes(cabezas),
    obtenerContactos([...new Set(cobros.map((c) => c.aseguradoId))]),
    obtenerUltimosEnvios(cabezas),
  ]);

  const conEstado = cobros.map((c) => {
    const comp = comprobantes.get(c.cabezaId);
    const pendiente = comp?.estado === "por_revisar" ? comp : null;
    return { cobro: c, comprobante: pendiente, pestana: pestanaDe(c, pendiente, hoy) };
  });
  const cuenta = (p: Pestana) => conEstado.filter((x) => x.pestana === p).length;
  const montos = montosPorPlazo(cobros, hoy);
  const companias = [...new Set(cobros.map((c) => c.compania).filter((c): c is string => Boolean(c)))].sort();
  const aviso = avisoConexionesValidador({
    whatsapp: conectadas.has("whatsapp"),
    mercadopago: conectadas.has("mercadopago"),
    banco: conectadas.has("banco"),
  });
  const buscado = normalizar(q);
  const volver = `/agentes/validador?tab=${pestana}${q ? `&q=${encodeURIComponent(q)}` : ""}${cia ? `&cia=${encodeURIComponent(cia)}` : ""}`;

  const filas: FilaCobro[] = conEstado
    .filter((x) => x.pestana === pestana)
    .filter((x) => !cia || x.cobro.compania === cia)
    .filter((x) => !buscado || normalizar(`${x.cobro.asegurado} ${x.cobro.poliza} ${x.cobro.numerosPoliza.join(" ")}`).includes(buscado))
    .sort((a, b) => a.cobro.vencimiento.localeCompare(b.cobro.vencimiento))
    .map(({ cobro, comprobante }) => {
      const a = contactos.get(cobro.aseguradoId);
      const contacto = a ? contactoDe(a) : { telefono: null, email: null };
      const d = detalleCobro(cobro, comprobante, {
        hoy,
        tieneContacto: Boolean(contacto.telefono || contacto.email),
        ultimoEnvio: envios.get(cobro.cabezaId) ?? null,
      });
      const conCodigo = esPagoConCodigo(comprobante?.medio ?? null);
      const vence = cobro.pagada ? { texto: "Pagada", tono: "verde" } : textoVence(cobro.vencimiento, hoy);
      return {
        id: cobro.cabezaId,
        aseguradoId: cobro.aseguradoId,
        cliente: cobro.asegurado,
        compania: cobro.compania ?? "—",
        poliza: cobro.poliza,
        cuota: cobro.cuota,
        monto: pesos(cobro.monto),
        vence,
        comprobante: {
          texto: d.estado.texto,
          clase:
            d.estado.tono === "verde"
              ? "pastilla pastilla-verde"
              : d.estado.tono === "rojo"
                ? "pastilla pastilla-rojo"
                : d.estado.tono === "texto-verde"
                  ? "texto-verde celda-fuerte"
                  : "texto-suave",
        },
        detalle: {
          canal: comprobante ? { whatsapp: "WhatsApp", email: "Email", manual: "Cargado a mano" }[comprobante.canal] : null,
          datos: comprobante
            ? ([
                ["Medio", comprobante.medio ?? "—"],
                ["Fecha", comprobante.fecha ? `${fechaCorta(diaEnArgentina(comprobante.fecha))} ${diaYHora(comprobante.fecha).slice(6)}` : "—"],
                ["Monto", comprobante.monto !== null ? pesosConCentavos(comprobante.monto) : "—"],
                [conCodigo ? "Código de pago" : "Destino", comprobante.destino ?? "—"],
                [conCodigo ? "N° de transacción" : "N° de operación", comprobante.numeroOperacion ?? "—"],
              ] as [string, string][])
            : [],
          archivoId: comprobante?.archivoId ?? null,
          titulo: d.titulo,
          chequeos: d.chequeos,
          acciones: d.acciones,
          puedeCargar: !cobro.pagada && !comprobante,
        },
      };
    });
  const primeraConComprobante = filas.find((f) => f.detalle.datos.length > 0)?.id ?? filas[0]?.id ?? null;

  return (
    <>
      <EncabezadoAgente
        agente="validador"
        titulo="Agente validador de pagos"
        activo={activo}
        descripcion="Lee los comprobantes que te mandan tus asegurados, los cruza con la cuota que corresponde y te deja confirmar el pago en un clic. Lo que no cierra, te lo marca para revisar."
      >
        <Link href="/configuracion" className="boton">
          Configuración
        </Link>
        <Link href={verActividad ? "/agentes/validador" : "/agentes/validador?ver=actividad"} className="boton">
          {verActividad ? "Ver cuotas" : "Actividad"}
        </Link>
        <form action={revisarAhora}>
          <button type="submit" className="boton boton-primario">
            Revisar comprobantes ahora
          </button>
        </form>
      </EncabezadoAgente>

      <Aviso codigo={sp.aviso} />

      {aviso && (
        <section className="aviso-agente">
          <span className="aviso-agente-icono" aria-hidden="true">
            !
          </span>
          <p>{aviso}</p>
          <Link href="/configuracion">Ir a Conexiones</Link>
        </section>
      )}

      {verActividad ? (
        <Bitacora actividad={actividad} />
      ) : (
        <>
          <section aria-label="Resumen" className="kpis-agente">
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Cuotas del mes</span>
              <span className="kpi-agente-valor">{cobros.length}</span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Pagos confirmados hoy</span>
              <span className="kpi-agente-valor texto-verde">
                {cobros.filter((c) => c.pagada && c.pagadaEl && diaEnArgentina(c.pagadaEl) === hoy).length}
              </span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Comprobantes por revisar</span>
              <span className="kpi-agente-valor texto-rojo">{cuenta("revisar")}</span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Cuotas vencidas</span>
              <span className="kpi-agente-valor">{cuenta("vencidos")}</span>
            </div>
          </section>

          <nav aria-label="Estado de las cuotas" className="pestanas">
            {PESTANAS.map((p) => (
              <Link
                key={p.id}
                href={`/agentes/validador?tab=${p.id}`}
                scroll={false}
                aria-current={p.id === pestana ? "page" : undefined}
                className="pestana"
              >
                {p.texto}
                <span className={p.id === "revisar" && cuenta("revisar") > 0 ? "contador-rojo" : "contador-gris"}>{cuenta(p.id)}</span>
              </Link>
            ))}
          </nav>

          <section aria-label="Montos" className="kpis-agente">
            <div className="kpi-agente kpi-destacado">
              <span className="kpi-agente-titulo">Vencen esta semana</span>
              <span className="kpi-agente-valor kpi-monto">{pesos(montos.semana.monto)}</span>
              <span className="kpi-agente-detalle">{montos.semana.cuotas === 1 ? "1 cuota" : `${montos.semana.cuotas} cuotas`}</span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Próximos 30 días</span>
              <span className="kpi-agente-valor kpi-monto">{pesos(montos.proximos.monto)}</span>
              <span className="kpi-agente-detalle">{montos.proximos.cuotas === 1 ? "1 cuota" : `${montos.proximos.cuotas} cuotas`}</span>
            </div>
            <div className="kpi-agente">
              <span className="kpi-agente-titulo">Vencidas</span>
              <span className="kpi-agente-valor kpi-monto texto-rojo">{pesos(montos.vencidas.monto)}</span>
              <span className="kpi-agente-detalle">{montos.vencidas.cuotas === 1 ? "1 cuota" : `${montos.vencidas.cuotas} cuotas`}</span>
            </div>
          </section>

          <section aria-label="Cuotas" className="tarjeta">
            <div className="lista-cabecera">
              <Filtros
                valores={{ q, cia }}
                campos={[
                  { nombre: "q", tipo: "buscar", etiqueta: "Buscar póliza o cliente", placeholder: "Buscar póliza o cliente" },
                  {
                    nombre: "cia",
                    tipo: "elegir",
                    etiqueta: "Compañía",
                    opciones: [{ valor: "", texto: "Todas las compañías" }, ...companias.map((c) => ({ valor: c, texto: c }))],
                  },
                ]}
              />
              <a href={`/agentes/validador/exportar?tab=${pestana}`} className="segmento" download>
                Exportar
              </a>
            </div>
            <TablaCobros key={pestana} filas={filas} abierta={primeraConComprobante} volver={volver} />
          </section>
        </>
      )}
    </>
  );
}
