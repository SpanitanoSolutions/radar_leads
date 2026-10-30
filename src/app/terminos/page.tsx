import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO_LEGAL as CONTACTO, DocumentoLegal, SeccionNumerada } from "@/components/DocumentoLegal";

export const metadata: Metadata = {
  title: "Términos y condiciones · UNIQO",
  description: "Las condiciones para usar UNIQO: qué hace, qué no, qué te toca a vos y qué nos toca a nosotros.",
};

// Página pública (queda fuera del proxy), como la política de privacidad. Si
// cambia lo que hace la app, hay que actualizarla y cambiar la fecha.
const ACTUALIZADA = "30 de octubre de 2026";

const SECCIONES = [
  { id: "alcance", titulo: "A quién se aplican" },
  { id: "servicio", titulo: "Qué es UNIQO y qué no" },
  { id: "acceso", titulo: "Acceso y cuenta" },
  { id: "uso", titulo: "Uso permitido" },
  { id: "datos", titulo: "Los datos que cargás" },
  { id: "agentes", titulo: "Agentes, automatizaciones e inteligencia artificial" },
  { id: "conexiones", titulo: "Conexiones con otros servicios" },
  { id: "fuentes", titulo: "Información de fuentes públicas" },
  { id: "condiciones", titulo: "Condiciones comerciales" },
  { id: "disponibilidad", titulo: "Disponibilidad y cambios en el servicio" },
  { id: "propiedad", titulo: "Propiedad intelectual" },
  { id: "responsabilidad", titulo: "Responsabilidad" },
  { id: "baja", titulo: "Baja y suspensión" },
  { id: "cambios", titulo: "Cambios en estos términos" },
  { id: "ley", titulo: "Ley aplicable" },
  { id: "contacto", titulo: "Contacto" },
] as const;

type IdSeccion = (typeof SECCIONES)[number]["id"];

function Seccion({ id, children }: { id: IdSeccion; children: React.ReactNode }) {
  return (
    <SeccionNumerada secciones={SECCIONES} id={id}>
      {children}
    </SeccionNumerada>
  );
}

export default function Terminos() {
  return (
    <DocumentoLegal
      titulo="Términos y condiciones"
      actualizada={ACTUALIZADA}
      secciones={SECCIONES}
      intro={
        <>
          <p>
            Estos términos regulan el uso de UNIQO, la herramienta de administración de seguros que desarrolla y opera{" "}
            <strong>Spanitano Solutions</strong> («nosotros»).
          </p>
          <p>
            Al entrar y usar UNIQO aceptás estos términos y la <Link href="/privacidad">Política de privacidad</Link>. Si
            no estás de acuerdo, no uses el servicio.
          </p>
        </>
      }
    >
      <Seccion id="alcance">
        <ul>
          <li>Se aplican a los productores asesores de seguros que usan UNIQO y a las personas que ellos autorizan («vos»).</li>
          <li>
            Si usás UNIQO en nombre de una organización (por ejemplo, una sociedad de productores), declarás que podés
            aceptarlos en su nombre.
          </li>
          <li>Si firmaste un acuerdo con Spanitano Solutions, ese acuerdo vale por sobre estos términos en lo que regule distinto.</li>
        </ul>
      </Seccion>

      <Seccion id="servicio">
        <p>
          UNIQO te ayuda a organizar tu trabajo de productor: cartera de asegurados y pólizas, vencimientos, cobranza,
          validación de pagos, siniestros, cotizaciones, conciliación de comisiones y detección de posibles clientes.
        </p>
        <p>
          UNIQO es una herramienta de software. <strong>No es una compañía de seguros ni un productor asesor de
          seguros</strong>, no intermedia en la contratación de seguros y no asesora a los asegurados. Esa tarea, y la
          relación con cada asegurado y cada compañía, sigue siendo tuya.
        </p>
        <p>
          Las coberturas, primas, cotizaciones, plazos y condiciones son los que informa cada compañía. UNIQO los
          muestra y los organiza, pero no los garantiza.
        </p>
      </Seccion>

      <Seccion id="acceso">
        <ul>
          <li>
            Se entra con la contraseña que te damos. Guardala en secreto, no se la des a nadie que no hayas autorizado y
            avisanos enseguida si creés que alguien más la conoce.
          </li>
          <li>Sos responsable de lo que se haga en UNIQO con tu acceso.</li>
          <li>La sesión dura 30 días en cada navegador: cerrala si usás una computadora compartida.</li>
        </ul>
      </Seccion>

      <Seccion id="uso">
        <p>Te comprometés a usar UNIQO de acuerdo con la ley y con estos términos. En particular, no podés:</p>
        <ul>
          <li>Usarlo para fines ilícitos o ajenos a tu actividad de productor.</li>
          <li>Cargar datos que no tengas derecho a tratar, o datos falsos de otras personas.</li>
          <li>
            Mandar mensajes masivos no solicitados, contactar a quien pidió que no lo hagas ni hacer llamadas comerciales
            a números inscriptos en el Registro Nacional «No Llame» (Ley 26.951).
          </li>
          <li>
            Intentar entrar a datos o partes del sistema a las que no tenés acceso, probar su seguridad sin autorización
            o interferir con su funcionamiento.
          </li>
          <li>Copiar, descompilar, revender o sublicenciar UNIQO, ni usarlo para desarrollar un producto competidor.</li>
          <li>Usar las conexiones con las compañías o sus portales en contra de las condiciones que fija cada compañía.</li>
        </ul>
        <p>
          Tu actividad, además, tiene sus propias reglas: la Ley 22.400 y las normas de la Superintendencia de Seguros de
          la Nación. Cumplirlas sigue siendo tu responsabilidad, también cuando usás UNIQO para llevar registros o para
          comunicarte con tus asegurados.
        </p>
      </Seccion>

      <Seccion id="datos">
        <ul>
          <li>
            Los datos que cargás o recibís en UNIQO son tuyos. Nos das permiso para guardarlos y procesarlos solo para
            prestarte el servicio, como explica la <Link href="/privacidad">Política de privacidad</Link>.
          </li>
          <li>
            Sos el responsable de los datos de tus asegurados y de las demás personas que cargás: tenés que haberlos
            obtenido de forma legítima, informarles cómo se usan y contar con su consentimiento cuando la ley lo pida, en
            especial para los datos de salud de un siniestro.
          </li>
          <li>
            Importar una planilla nunca borra datos: actualiza lo que ya está y suma lo nuevo. Aun así, conservá tus
            planillas originales.
          </li>
          <li>Podés pedirnos una copia de tus datos o que los borremos, en las condiciones de la Política de privacidad.</li>
        </ul>
      </Seccion>

      <Seccion id="agentes">
        <ul>
          <li>
            Los agentes (Cotización, Validador de pagos, Cobranza, Siniestros y Conciliador) preparan borradores,
            propuestas y avisos. Ningún mensaje sale sin tu aprobación, salvo los pasos que vos marques como automáticos:
            lo que se envía en esos pasos corre por tu cuenta, igual que si lo hubieras mandado vos.
          </li>
          <li>
            La IA y las reglas automáticas pueden equivocarse: leer mal un comprobante, relacionar un pago con la cuota
            equivocada, clasificar mal un documento o redactar algo inexacto. Revisá lo que proponen antes de confirmarlo
            o de enviarlo.
          </li>
          <li>
            Los avisos de vencimientos, cuotas y plazos de denuncia son una ayuda y no reemplazan tu control: los plazos
            que valen son los que fijan las pólizas, las compañías y la ley.
          </li>
          <li>La IA es opcional, se activa para cada cuenta y tiene un tope de gasto mensual.</li>
        </ul>
      </Seccion>

      <Seccion id="conexiones">
        <ul>
          <li>
            Podés conectar Gmail, Google Calendar, WhatsApp Business, Mercado Pago y los portales o conexiones directas
            de las compañías. Al hacerlo, autorizás a UNIQO a actuar en tu nombre dentro de los permisos que diste: por
            ejemplo, mandar desde tu casilla los correos que aprobás.
          </li>
          <li>
            Cada uno de esos servicios tiene sus propios términos, y tenés que cumplirlos. Por ejemplo, WhatsApp Business
            pide que tus clientes hayan aceptado recibir tus mensajes.
          </li>
          <li>
            Si guardás usuarios y claves de portales de compañías, declarás que estás autorizado a usarlos. Los guardamos
            cifrados y solo los usamos para las tareas que pedís.
          </li>
          <li>
            No controlamos esos servicios: si cambian, fallan, limitan el acceso o revocan una autorización, lo que
            dependa de ellos puede dejar de funcionar hasta que se vuelva a conectar.
          </li>
          <li>Podés desconectar cualquier servicio cuando quieras desde Configuración.</li>
        </ul>
      </Seccion>

      <Seccion id="fuentes">
        <ul>
          <li>
            Los leads salen de publicaciones oficiales (COMPR.AR, a través de datos.gob.ar con licencia CC BY 4.0, y el
            Boletín Oficial de la Provincia de Buenos Aires) y de lo que publican las empresas en Google Maps o en su
            sitio web.
          </li>
          <li>
            Esa información puede estar incompleta o desactualizada. No garantizamos que sea exacta ni que la empresa
            necesite un seguro.
          </li>
          <li>
            Si contactás a esas empresas, hacelo respetando la ley de datos personales y el Registro «No Llame», y dejá
            de contactar a quien te lo pida.
          </li>
        </ul>
      </Seccion>

      <Seccion id="condiciones">
        <p>
          El precio, el plazo y la forma de pago de UNIQO, si corresponden, se acuerdan por separado con Spanitano
          Solutions. Los costos de los servicios que conectes (por ejemplo, WhatsApp Business o Mercado Pago) se rigen
          por las condiciones de cada uno.
        </p>
      </Seccion>

      <Seccion id="disponibilidad">
        <ul>
          <li>
            Hacemos lo razonable para que UNIQO funcione de forma continua y segura, pero puede haber interrupciones por
            mantenimiento, fallas de los proveedores o causas ajenas a nosotros. No garantizamos que esté siempre
            disponible ni libre de errores.
          </li>
          <li>
            UNIQO cambia con el tiempo: podemos agregar, modificar o quitar funciones. Si quitamos algo importante para tu
            trabajo, te avisamos con anticipación dentro de la app.
          </li>
        </ul>
      </Seccion>

      <Seccion id="propiedad">
        <ul>
          <li>
            UNIQO (su software, diseño, textos, marca y logo) es de Spanitano Solutions. Te damos un derecho de uso no
            exclusivo e intransferible mientras uses el servicio de acuerdo con estos términos.
          </li>
          <li>Tus datos, tu logo y lo que generás con ellos (por ejemplo, las propuestas en PDF) son tuyos.</li>
          <li>Las marcas de las compañías de seguros y de los servicios conectados son de sus dueños.</li>
        </ul>
      </Seccion>

      <Seccion id="responsabilidad">
        <p>En la medida en que lo permita la ley, Spanitano Solutions no responde por:</p>
        <ul>
          <li>Las decisiones que tomes con la información de UNIQO, ni el asesoramiento que des a tus asegurados.</li>
          <li>Errores en los datos que cargás o que informan las compañías, los organismos públicos o los servicios conectados.</li>
          <li>Los mensajes, denuncias o confirmaciones que aprobaste o que configuraste como automáticos.</li>
          <li>Plazos, vencimientos o cobros que no se gestionaron a tiempo.</li>
          <li>Fallas, cambios o interrupciones de servicios de terceros.</li>
          <li>Lucro cesante, pérdida de clientes u otros daños indirectos.</li>
        </ul>
        <p>Nada de esto limita la responsabilidad que la ley no permite limitar, como la que surge del dolo o la culpa grave.</p>
        <p>
          Vos respondés frente a Spanitano Solutions y frente a terceros por el uso que hagas de UNIQO en contra de estos
          términos o de la ley, incluido el tratamiento de los datos de tus asegurados.
        </p>
      </Seccion>

      <Seccion id="baja">
        <ul>
          <li>
            Podés dejar de usar UNIQO cuando quieras. Si lo pedís, te damos una copia de tus datos y los borramos dentro
            de los 30 días, como dice la Política de privacidad.
          </li>
          <li>
            Podemos suspender o cortar el acceso si se usa UNIQO en contra de estos términos o de la ley, o si hay un
            riesgo para la seguridad del servicio o de los datos. Salvo urgencia, te avisamos antes y te damos la
            oportunidad de corregirlo.
          </li>
        </ul>
      </Seccion>

      <Seccion id="cambios">
        <p>
          Si cambiamos estos términos, actualizamos la fecha de arriba y, si el cambio es importante, lo avisamos dentro
          de UNIQO antes de que entre en vigencia. Si seguís usando UNIQO después, aceptás la nueva versión.
        </p>
      </Seccion>

      <Seccion id="ley">
        <p>
          Estos términos se rigen por las leyes de la República Argentina. Ante un desacuerdo, primero buscamos
          resolverlo conversando; si no se puede, intervienen los tribunales ordinarios competentes de la República
          Argentina.
        </p>
      </Seccion>

      <Seccion id="contacto">
        {CONTACTO ? (
          <p>
            Spanitano Solutions · <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
          </p>
        ) : (
          <p>
            Spanitano Solutions. Mientras no tengamos una casilla propia para estas consultas, escribinos por el contacto
            que ya tenés con nosotros.
          </p>
        )}
      </Seccion>
    </DocumentoLegal>
  );
}
