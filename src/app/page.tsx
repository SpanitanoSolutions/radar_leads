import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logoUniqo from "@/app/icon.png";
import { IconoCalculadora, IconoCalendario, IconoDocumento, IconoEscudo, IconoMoneda } from "@/components/iconos";
import "./presentacion.css";

export const metadata: Metadata = {
  title: "UNIQO",
  description:
    "UNIQO organiza la cartera de los productores asesores de seguros: pólizas, vencimientos, cobranza, siniestros y cotizaciones.",
  robots: { index: true, follow: true },
};

// Presentación pública de la raíz (el proxy la deja pasar sin sesión y, con
// sesión, manda a /inicio). Es lo que revisa Google al verificar la app, así
// que no lee nada del pedido: se arma en el build y el HTML ya trae el texto.
// El nombre tiene que ser el mismo de la pantalla de consentimiento de Google.
// Si cambia lo que la app le pide a Google, se actualiza junto con /privacidad.

const FUNCIONES = [
  {
    titulo: "Pólizas y asegurados",
    texto: "Importá las planillas de tus compañías y tené cada asegurado con sus pólizas, coberturas y documentos.",
    Icono: IconoDocumento,
  },
  {
    titulo: "Vencimientos",
    texto: "Mirá qué pólizas vencen en los próximos días para renovarlas a tiempo.",
    Icono: IconoCalendario,
  },
  {
    titulo: "Cobranza",
    texto: "Seguí las cuotas por vencer y vencidas, con avisos a tus clientes que salen solo cuando los aprobás.",
    Icono: IconoMoneda,
  },
  {
    titulo: "Siniestros",
    texto: "Armá la denuncia, controlá la documentación y seguí cada expediente hasta el pago.",
    Icono: IconoEscudo,
  },
  {
    titulo: "Cotizaciones",
    texto: "Pedí cotizaciones a las compañías y prepará la comparativa y la propuesta para el cliente.",
    Icono: IconoCalculadora,
  },
];

export default function Presentacion() {
  return (
    <div className="presentacion">
      <header className="presentacion-barra">
        <Link href="/" className="presentacion-marca">
          <Image src={logoUniqo} alt="" width={36} height={36} loading="eager" className="presentacion-logo" />
          <span>UNIQO</span>
        </Link>
        <Link href="/login" className="boton boton-primario">
          Iniciar sesión
        </Link>
      </header>

      <main className="presentacion-contenido">
        <section className="presentacion-portada" aria-labelledby="presentacion-titulo">
          <p className="presentacion-etiqueta">Tecnología aplicada a seguros</p>
          <h1 id="presentacion-titulo" className="presentacion-titulo">
            UNIQO
          </h1>
          <p className="presentacion-bajada">
            UNIQO es una plataforma para productores asesores de seguros que organiza toda su cartera en un solo lugar:
            pólizas, vencimientos, cobranza, siniestros y cotizaciones. Además, permite conectar la cuenta de Google del
            productor para enviar correos a sus clientes desde su propio Gmail y agendar vencimientos y cobros en su
            Google Calendar.
          </p>
          <div className="presentacion-acciones">
            <Link href="/login" className="boton boton-primario">
              Iniciar sesión
            </Link>
            <a href="#google" className="boton">
              Cómo usamos tu cuenta de Google
            </a>
          </div>
        </section>

        <section className="presentacion-seccion" aria-labelledby="funciones-titulo">
          <h2 id="funciones-titulo">Qué hace UNIQO</h2>
          <p>Todo lo que un productor necesita para administrar su cartera día a día.</p>
          <ul className="presentacion-funciones">
            {FUNCIONES.map(({ titulo, texto, Icono }) => (
              <li key={titulo} className="presentacion-funcion">
                <span className="presentacion-funcion-icono">
                  <Icono size={18} />
                </span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="google" className="presentacion-seccion presentacion-google" aria-labelledby="google-titulo">
          <h2 id="google-titulo">Conexión con tu cuenta de Google</h2>
          <p>
            Conectar Google es opcional y se hace desde Configuración. UNIQO pide solo estos dos permisos, y cada uno se
            usa para una sola función:
          </p>
          <ul className="presentacion-permisos">
            <li className="presentacion-permiso">
              <h3>Gmail</h3>
              <p className="presentacion-alcance">
                <code>gmail.send</code> · enviar correos
              </p>
              <p>
                Para enviar correos a tus clientes desde tu propia casilla de Gmail: avisos de vencimiento y de cobranza,
                pedidos de cotización y denuncias. Solo salen los correos que aprobás. UNIQO no lee, no guarda y no
                borra los correos de tu casilla.
              </p>
            </li>
            <li className="presentacion-permiso">
              <h3>Google Calendar</h3>
              <p className="presentacion-alcance">
                <code>calendar.events</code> · crear eventos
              </p>
              <p>
                Para crear en tu calendario los eventos de vencimientos de pólizas y de cobros de cuotas. UNIQO solo crea
                eventos: no lee ni modifica los que ya tenés.
              </p>
            </li>
          </ul>

          <h3 className="presentacion-subtitulo">Cómo usamos los datos de Google</h3>
          <ul className="presentacion-lista">
            <li>Los usamos solo para esas dos funciones: enviar los correos que aprobás y crear los eventos en tu calendario.</li>
            <li>No los vendemos ni los compartimos con terceros, y no los usamos para publicidad.</li>
            <li>No se los mandamos a la inteligencia artificial ni los usamos para entrenar modelos.</li>
            <li>Guardamos solo la dirección de la cuenta conectada y los permisos de acceso, cifrados.</li>
            <li>
              Podés desconectar la cuenta cuando quieras desde Configuración o desde{" "}
              <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
            </li>
          </ul>
          <p className="presentacion-nota">
            El uso que UNIQO hace de la información recibida de las API de Google se ajusta a la{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">
              Política de Datos del Usuario de los Servicios de las API de Google
            </a>
            , incluidos los requisitos de Uso Limitado. El detalle está en la{" "}
            <Link href="/privacidad#google">Política de privacidad</Link>.
          </p>
        </section>
      </main>

      <footer className="presentacion-pie">
        <div className="presentacion-pie-contenido">
          <p>© 2026 Spanitano Solutions</p>
          <nav className="presentacion-pie-enlaces" aria-label="Documentos legales">
            <Link href="/privacidad">Política de privacidad</Link>
            <Link href="/terminos">Términos y condiciones</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
