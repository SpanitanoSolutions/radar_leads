import Link from "next/link";

const SECCIONES = [
  {
    id: "cartera",
    titulo: "Mi cartera",
    items: [
      { href: "/asegurados", nombre: "Asegurados", texto: "Toda tu cartera en un lugar: pólizas, vencimientos y oportunidades de mejorar coberturas." },
      { href: "/vencimientos", nombre: "Vencimientos", texto: "Las pólizas que vencen pronto, para preparar las renovaciones a tiempo." },
      { href: "/importar", nombre: "Importar cartera", texto: "Subí la planilla de tus asegurados (CSV o Excel). Podés combinarla con lo que ya tenés o reemplazarla." },
    ],
  },
  {
    id: "agentes",
    titulo: "Agentes",
    items: [
      { href: "/agentes/cotizacion", nombre: "Cotización", texto: "Pide cotizaciones a las compañías y arma la comparativa para tu cliente." },
      { href: "/agentes/validador", nombre: "Validador de pagos", texto: "Revisa los comprobantes que te mandan tus asegurados antes de confirmar el pago." },
      { href: "/agentes/siniestros", nombre: "Siniestros", texto: "Arma la denuncia, te dice qué documentación falta y sigue cada siniestro hasta el pago." },
      { href: "/agentes/cobranza", nombre: "Cobranza", texto: "Prepara los avisos de cuotas por vencer y vencidas. Nada se manda sin tu aprobación." },
      { href: "/agentes/conciliador", nombre: "Conciliador", texto: "Compara lo que te corresponde de comisión con lo que liquidan y depositan las compañías." },
    ],
  },
  {
    id: "captacion",
    titulo: "Captación de clientes",
    items: [
      { href: "/leads", nombre: "Leads del día", texto: "Empresas que podrían necesitar un seguro, detectadas cada día en licitaciones y el Boletín Oficial." },
      { href: "/sectores", nombre: "Mis sectores", texto: "Elegí qué sectores y zonas te interesan para los leads." },
    ],
  },
];

export default function Ayuda() {
  return (
    <>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Ayuda</h1>
          <p className="subtitulo">Qué hace cada sección de Radar.</p>
        </div>
      </header>
      {SECCIONES.map((s) => (
        <section key={s.id} className="tarjeta tarjeta-padding" aria-labelledby={`ayuda-${s.id}`}>
          <h2 id={`ayuda-${s.id}`} className="titulo-seccion">
            {s.titulo}
          </h2>
          <dl className="ayuda-lista">
            {s.items.map((i) => (
              <div key={i.href}>
                <dt>
                  <Link href={i.href}>{i.nombre}</Link>
                </dt>
                <dd>{i.texto}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="nota-info">
        Ningún agente le escribe a tus asegurados sin que vos lo apruebes, salvo que lo actives en la configuración de
        ese agente.
      </p>
    </>
  );
}
