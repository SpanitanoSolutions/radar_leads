import type { Metadata } from "next";
import { CONTACTO_LEGAL as CONTACTO, DocumentoLegal, SeccionNumerada } from "@/components/DocumentoLegal";

export const metadata: Metadata = {
  title: "Política de privacidad · UNIQO",
  description: "Qué datos pide y usa UNIQO, para qué, con quién se comparten y cómo ejercer tus derechos.",
};

// Página pública (queda fuera del proxy): Google la pide para autorizar Gmail
// y Calendar. Si cambia lo que la app pide o guarda, hay que actualizarla y
// cambiar la fecha.
const ACTUALIZADA = "31 de octubre de 2026";

const SECCIONES = [
  { id: "alcance", titulo: "Quiénes somos y a quién se aplica" },
  { id: "responsables", titulo: "Quién es responsable de cada dato" },
  { id: "datos", titulo: "Qué datos pedimos y usamos" },
  { id: "origen", titulo: "De dónde salen los datos" },
  { id: "finalidades", titulo: "Para qué los usamos" },
  { id: "ia", titulo: "Inteligencia artificial" },
  { id: "google", titulo: "Datos de Google (Gmail y Google Calendar)" },
  { id: "terceros", titulo: "Con quién se comparten" },
  { id: "internacional", titulo: "Transferencias fuera de la Argentina" },
  { id: "conservacion", titulo: "Cuánto tiempo se guardan" },
  { id: "seguridad", titulo: "Cómo los protegemos" },
  { id: "derechos", titulo: "Tus derechos" },
  { id: "cookies", titulo: "Cookies y almacenamiento en el navegador" },
  { id: "menores", titulo: "Menores de edad" },
  { id: "cambios", titulo: "Cambios en esta política" },
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

const PROVEEDORES = [
  { nombre: "Vercel", para: "Aloja y ejecuta UNIQO.", recibe: "Todo lo que pasa por la app y los registros técnicos de cada pedido." },
  { nombre: "Neon", para: "Base de datos.", recibe: "Todos los datos guardados en UNIQO." },
  { nombre: "Anthropic", para: "IA de los agentes y búsqueda de teléfonos de empresas.", recibe: "Lo que necesita cada tarea de IA (ver sección 6)." },
  {
    nombre: "Google",
    para: "Gmail, Google Calendar y Google Maps (Places).",
    recibe: "Los correos que se envían, los eventos que se crean, y el nombre y la localidad de las empresas que se buscan en el mapa.",
  },
  { nombre: "Meta (WhatsApp Business)", para: "Mensajes a asegurados.", recibe: "El número de destino y el texto del mensaje." },
  { nombre: "Mercado Pago", para: "Links de pago y confirmación de cobros.", recibe: "El concepto y el importe de cada link; UNIQO consulta los pagos recibidos en la cuenta." },
  { nombre: "Resend", para: "Resumen diario por correo al productor.", recibe: "El resumen (leads y vencimientos del día, con el nombre de cada cliente) y las direcciones de destino." },
  {
    nombre: "Compañías de seguros",
    para: "Cotizar, denunciar siniestros, consultar pagos y comisiones.",
    recibe: "Los datos que pide cada trámite, por correo, WhatsApp, su portal o su conexión directa.",
  },
];

export default function Privacidad() {
  return (
    <DocumentoLegal
      titulo="Política de privacidad"
      actualizada={ACTUALIZADA}
      secciones={SECCIONES}
      intro={
        <>
          <p>
            UNIQO es una herramienta para productores asesores de seguros: organiza asegurados, pólizas, vencimientos,
            cobranza, siniestros, cotizaciones y comisiones, y detecta empresas que podrían necesitar un seguro. La
            desarrolla y opera <strong>Spanitano Solutions</strong> («nosotros»).
          </p>
          <p>
            Esta política explica qué datos personales pedimos y usamos, para qué, con quién se comparten y cómo podés
            ejercer tus derechos, según la Ley 25.326 de Protección de los Datos Personales y su normativa
            complementaria.
          </p>
        </>
      }
    >
      <Seccion id="alcance">
        <p>Esta política se aplica a:</p>
        <ul>
          <li>Los productores y colaboradores que usan UNIQO.</li>
          <li>
            Los asegurados, tomadores, beneficiarios, terceros de un siniestro y demás personas cuyos datos carga o
            recibe el productor para su trabajo.
          </li>
          <li>Las empresas, y sus representantes, que UNIQO detecta como posibles clientes («leads»).</li>
        </ul>
      </Seccion>

      <Seccion id="responsables">
        <ul>
          <li>
            <strong>Datos de la cuenta del productor</strong> (su perfil, sus conexiones y su uso de UNIQO): el
            responsable es Spanitano Solutions.
          </li>
          <li>
            <strong>Datos de los asegurados y de las demás personas</strong> que el productor carga o recibe: el
            responsable es el productor, que los obtiene en su actividad de intermediación. Spanitano Solutions los
            trata por cuenta y orden del productor, solo para prestarle el servicio, y no los usa para fines propios.
          </li>
        </ul>
        <p>
          Si sos asegurado y querés consultar o corregir tus datos, lo más rápido es pedírselo a tu productor. También
          podés escribirnos y lo resolvemos con él.
        </p>
      </Seccion>

      <Seccion id="datos">
        <h3>Del productor y su cuenta</h3>
        <ul>
          <li>Nombre, matrícula o matrículas, organización, teléfono, correo electrónico, provincia y el logo que se muestra en las propuestas.</li>
          <li>Acuerdos de comisión, liquidaciones, depósitos y retenciones de cada compañía.</li>
          <li>Usuarios y claves de los portales de las compañías que el productor decide guardar, siempre cifrados.</li>
          <li>La contraseña para entrar a UNIQO no se guarda en la base de datos: se compara con la configurada en el servidor.</li>
        </ul>

        <h3>De asegurados y contactos</h3>
        <ul>
          <li>Nombre o razón social, tipo de persona, DNI, CUIT o CUIL y fecha de nacimiento.</li>
          <li>Domicilio, localidad, código postal, teléfono y correo electrónico, y los de una persona de contacto.</li>
          <li>Desde cuándo es cliente, las notas del productor y los documentos que se suben a su ficha.</li>
        </ul>

        <h3>De pólizas, cuotas y pagos</h3>
        <ul>
          <li>
            Compañía, ramo, número de póliza, bien asegurado (por ejemplo, el vehículo y su patente, o el domicilio de
            un inmueble), coberturas, vigencia, prima, premio, suma asegurada, forma de pago y cuotas.
          </li>
          <li>
            Los comprobantes de pago que mandan los asegurados (imagen o PDF) y lo que se lee de ellos: importe, fecha,
            medio, número de operación, nombre y documento de quien pagó, y a quién se pagó.
          </li>
          <li>Los listados de cobranza y de pagos de las compañías, para saber qué cuotas están pagas.</li>
        </ul>

        <h3>De siniestros</h3>
        <ul>
          <li>Fecha, lugar, tipo y relato del hecho, personas y bienes afectados, póliza, denuncia y número de la compañía.</li>
          <li>
            La documentación del expediente: fotos, documentos de identidad, licencias de conducir, cédulas,
            presupuestos, facturas, actas o certificados médicos, según lo que pida cada compañía.
          </li>
          <li>Gastos, informes, montos aprobados y pagados, y la historia del trámite.</li>
          <li>
            Pueden incluir <strong>datos de salud</strong>, que la ley considera sensibles. Se piden solo cuando el
            siniestro los requiere (por ejemplo, si hubo lesiones) y se usan únicamente para tramitarlo.
          </li>
        </ul>

        <h3>De cotizaciones</h3>
        <ul>
          <li>
            Los datos del riesgo a cotizar (el bien, su uso, las coberturas buscadas y los datos del cliente que pide
            cada compañía), las respuestas de las compañías y las propuestas en PDF.
          </li>
        </ul>

        <h3>De mensajes</h3>
        <ul>
          <li>Los mensajes que preparan los agentes y los que se envían a asegurados y compañías: canal, destinatario, asunto, texto, estado y fechas.</li>
        </ul>

        <h3>De empresas detectadas (leads)</h3>
        <ul>
          <li>Razón social, CUIT, rubro, localidad, domicilio y la licitación o el edicto donde apareció, tomados de publicaciones oficiales.</li>
          <li>El teléfono y la dirección comerciales que publica la empresa en Google Maps o en su sitio web, con la página de donde salen.</li>
          <li>
            El seguimiento del productor (estado, notas, reuniones, cierre) y los datos comerciales que consulte y
            anote, como la ART actual o si la empresa figura en la Central de Deudores del BCRA.
          </li>
        </ul>

        <h3>De las conexiones</h3>
        <ul>
          <li>Google: la dirección de la cuenta conectada y los permisos de Gmail y Google Calendar, cifrados.</li>
          <li>Mercado Pago: el identificador, el alias y el correo de la cuenta vinculada, y sus permisos, cifrados.</li>
          <li>WhatsApp Business: el número verificado y los identificadores de la cuenta de Meta.</li>
        </ul>

        <h3>Técnicos</h3>
        <ul>
          <li>Una cookie de sesión y la preferencia de tema claro u oscuro (ver sección 13).</li>
          <li>
            Registros del uso de la IA (agente, tarea, modelo, cantidad de tokens y costo) y de las consultas a las
            compañías (resultado y duración), sin claves ni el contenido de los documentos.
          </li>
          <li>
            Los registros que guarda el proveedor de hosting por cada pedido (como la dirección IP, la fecha y la
            página pedida), para seguridad y diagnóstico.
          </li>
        </ul>
      </Seccion>

      <Seccion id="origen">
        <ul>
          <li><strong>El productor</strong>: los carga a mano, importa planillas (CSV o Excel) de sus compañías o sube archivos.</li>
          <li><strong>Los asegurados</strong>, a través de su productor: comprobantes, documentación de siniestros y datos para cotizar.</li>
          <li>
            <strong>Las compañías de seguros</strong>: listados de cobranza, liquidaciones de comisiones y respuestas de
            cotización, por correo, por su portal o por su conexión directa.
          </li>
          <li>
            <strong>Fuentes públicas</strong>: los datos abiertos de contrataciones del Estado nacional (COMPR.AR,
            publicados en datos.gob.ar con licencia CC BY 4.0) y el Boletín Oficial de la Provincia de Buenos Aires.
          </li>
          <li><strong>Google Maps y los sitios web de las empresas</strong>, para su teléfono y su dirección comerciales.</li>
        </ul>
      </Seccion>

      <Seccion id="finalidades">
        <ul>
          <li>Administrar la cartera: asegurados, pólizas, vencimientos y renovaciones.</li>
          <li>Preparar y enviar los avisos de cuotas por vencer y vencidas.</li>
          <li>Validar pagos: relacionar cada comprobante o listado con la cuota que corresponde.</li>
          <li>Tramitar siniestros: armar la denuncia, controlar la documentación y seguir el expediente hasta el pago.</li>
          <li>Pedir cotizaciones a las compañías y armar la comparativa y la propuesta para el cliente.</li>
          <li>Conciliar las comisiones que liquidan y depositan las compañías.</li>
          <li>Detectar empresas que podrían necesitar un seguro y organizar el contacto comercial del productor.</li>
          <li>Agendar vencimientos y recordatorios en el calendario del productor y mandarle un resumen diario por correo.</li>
          <li>Mantener la seguridad del servicio, prevenir abusos y resolver problemas técnicos.</li>
        </ul>
        <p>
          Los agentes preparan borradores: ningún mensaje sale sin la aprobación del productor, salvo los pasos que él
          mismo marque como automáticos. No vendemos datos, no los usamos para publicidad y no armamos perfiles para
          terceros.
        </p>
      </Seccion>

      <Seccion id="ia">
        <p>
          Algunas funciones usan los modelos Claude de Anthropic a través de su API. La IA es opcional, se activa para
          cada cuenta y tiene un tope de gasto mensual.
        </p>
        <ul>
          <li>
            Se usa para leer comprobantes y listados de pago, interpretar las columnas de una planilla al importarla,
            analizar y clasificar la documentación de un siniestro, leer las respuestas de cotización y redactar
            borradores de mensajes y propuestas.
          </li>
          <li>Se le manda solo lo que la tarea necesita: el archivo o el texto a leer y el contexto mínimo.</li>
          <li>Según las condiciones comerciales de Anthropic, lo que recibe por la API no se usa para entrenar sus modelos.</li>
          <li>
            Lo que propone la IA es una sugerencia: el productor la revisa antes de confirmar un pago, enviar una
            denuncia o mandar un mensaje.
          </li>
          <li>
            Cuando está activada, la búsqueda de teléfonos de empresas usa la IA con búsqueda web y le manda solo la
            razón social, el CUIT, el rubro y la localidad de la empresa.
          </li>
          <li>Ningún dato obtenido de Google (Gmail o Google Calendar) se manda a la IA.</li>
        </ul>
      </Seccion>

      <Seccion id="google">
        <p>UNIQO le pide a Google solo lo necesario:</p>
        <ul>
          <li>
            <strong>Gmail, permiso de envío</strong> (<code>gmail.send</code>): para mandar desde la casilla del
            productor los correos que él aprueba (pedidos de cotización, denuncias, reclamos y avisos) y un correo de
            prueba a su propia casilla. UNIQO no lee, no guarda y no borra correos de la casilla.
          </li>
          <li>
            <strong>Google Calendar, permiso de eventos</strong> (<code>calendar.events</code>): para agregar
            vencimientos y recordatorios al calendario principal. UNIQO solo crea eventos: no lee ni modifica los que
            ya están.
          </li>
          <li>
            <strong>Identidad</strong> (<code>openid</code> y <code>email</code>): para mostrar qué cuenta quedó
            conectada.
          </li>
        </ul>
        <p>
          Guardamos únicamente la dirección de la cuenta y los permisos de acceso, cifrados. No usamos los datos de
          Google para publicidad ni para entrenar modelos de IA, no los vendemos y no los transferimos a terceros, salvo
          lo necesario para prestar estas funciones, por seguridad o para cumplir la ley. Nadie de nuestro equipo los
          lee, salvo que el productor lo pida para resolver un problema o que lo exija la ley.
        </p>
        <div className="legal-destacado">
          <p>
            El uso que UNIQO hace de la información recibida de las API de Google, y su transferencia a cualquier otra
            aplicación, se ajusta a la{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">
              Política de Datos del Usuario de los Servicios de las API de Google
            </a>
            , incluidos los requisitos de Uso Limitado.
          </p>
          {/* Google busca esta frase textual, en inglés, al verificar la app. */}
          <p lang="en">
            UNIQO&apos;s use and transfer of information received from Google APIs will adhere to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>
        <p>
          Podés desconectar Gmail o Google Calendar en cualquier momento desde Configuración, lo que borra los permisos
          guardados, o quitarle el acceso a UNIQO desde{" "}
          <a href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </Seccion>

      <Seccion id="terceros">
        <p>Para funcionar, UNIQO usa estos proveedores. Cada uno recibe solo lo que necesita para su parte:</p>
        <div className="legal-tabla-marco">
          <table className="legal-tabla">
            <thead>
              <tr>
                <th scope="col">Quién</th>
                <th scope="col">Para qué</th>
                <th scope="col">Qué recibe</th>
              </tr>
            </thead>
            <tbody>
              {PROVEEDORES.map((p) => (
                <tr key={p.nombre}>
                  <th scope="row">{p.nombre}</th>
                  <td>{p.para}</td>
                  <td>{p.recibe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Además, entregamos datos a una autoridad solo cuando una ley o una orden judicial lo exige. Nunca vendemos ni
          alquilamos datos.
        </p>
      </Seccion>

      <Seccion id="internacional">
        <p>
          Varios de estos proveedores procesan los datos en servidores fuera de la Argentina, principalmente en Estados
          Unidos. Los elegimos por sus estándares de seguridad y porque asumen compromisos de confidencialidad y
          protección de datos. Esa transferencia es necesaria para prestar el servicio.
        </p>
      </Seccion>

      <Seccion id="conservacion">
        <ul>
          <li>
            Los datos se guardan mientras la cuenta del productor esté activa. Importar una planilla nunca borra nada:
            un asegurado o una póliza que deja de aparecer queda marcado como baja, para conservar el historial.
          </li>
          <li>Los permisos de una conexión se borran al desconectarla.</li>
          <li>La sesión vence a los 30 días o al cerrarla.</li>
          <li>
            Si el productor deja de usar UNIQO, puede pedir una copia de sus datos y que se borren; lo hacemos dentro de
            los 30 días, salvo lo que debamos conservar por ley.
          </li>
          <li>Los registros técnicos del hosting se guardan por un plazo corto, según la política de ese proveedor.</li>
        </ul>
      </Seccion>

      <Seccion id="seguridad">
        <ul>
          <li>Toda la comunicación viaja cifrada (HTTPS).</li>
          <li>
            Todas las pantallas y archivos piden la sesión iniciada, salvo la página de presentación, los términos y
            esta política. La sesión va en una cookie firmada que el código de la página no puede leer.
          </li>
          <li>
            Los permisos de las conexiones y las claves de los portales se guardan cifrados (AES-256-GCM) y nunca se
            muestran en pantalla.
          </li>
          <li>Los datos de ejemplo con los que arranca la app nunca salen por una conexión real.</li>
        </ul>
        <p>
          Ningún sistema es infalible. Si ocurre un incidente que afecte tus datos, se lo informamos a los afectados y,
          cuando corresponda, a la autoridad.
        </p>
      </Seccion>

      <Seccion id="derechos">
        <p>Como titular de tus datos, podés pedir en cualquier momento:</p>
        <ul>
          <li><strong>Acceso</strong>: saber qué datos tuyos hay y de dónde salieron. Respondemos dentro de los 10 días corridos.</li>
          <li><strong>Rectificación y actualización</strong>: corregir datos inexactos o incompletos.</li>
          <li>
            <strong>Supresión</strong>: que se borren, cuando no haya una obligación legal o contractual de
            conservarlos. La rectificación y la supresión se resuelven dentro de los 5 días hábiles.
          </li>
          <li><strong>Confidencialidad y oposición</strong>: que no se usen para algo que no autorizaste, por ejemplo para contactarte comercialmente.</li>
          <li>
            <strong>Retirar tu consentimiento</strong> y desconectar cuando quieras las cuentas de Google, Mercado Pago
            o WhatsApp.
          </li>
        </ul>
        {CONTACTO ? (
          <p>
            Escribinos a <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a> con tu nombre, tu documento y lo que querés
            pedir. Si sos asegurado, también podés pedírselo directamente a tu productor.
          </p>
        ) : (
          <p>
            Si sos asegurado, pedíselo a tu productor: es el responsable de tus datos y nos traslada el pedido. Si sos
            productor, pedíselo a Spanitano Solutions por el medio de contacto que ya usás con nosotros. Indicá tu
            nombre, tu documento y lo que querés pedir.
          </p>
        )}
        <div className="legal-destacado">
          <p>
            El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma
            gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto
            conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326.
          </p>
          <p>
            La{" "}
            <a href="https://www.argentina.gob.ar/aaip">
              Agencia de Acceso a la Información Pública
            </a>
            , en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y
            reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas
            vigentes en materia de protección de datos personales.
          </p>
        </div>
      </Seccion>

      <Seccion id="cookies">
        <ul>
          <li>
            <code>radar_sesion</code> (cookie): mantiene la sesión iniciada. Dura 30 días o hasta que cerrás sesión, y
            el código de la página no la puede leer.
          </li>
          <li><code>uniqo-theme</code> (almacenamiento del navegador): recuerda si elegiste el tema claro o el oscuro.</li>
        </ul>
        <p>No usamos cookies de analítica, de publicidad ni de terceros.</p>
      </Seccion>

      <Seccion id="menores">
        <p>
          UNIQO está pensada para productores de seguros, no para menores de edad. Si una póliza o un siniestro incluye
          a un menor (por ejemplo, como beneficiario de un seguro de accidentes personales), sus datos los carga el
          productor en el marco de esa póliza, con la intervención de sus representantes legales, y se tratan con el
          mismo cuidado.
        </p>
      </Seccion>

      <Seccion id="cambios">
        <p>
          Si cambiamos esta política, actualizamos la fecha de arriba y, si el cambio es importante, lo avisamos dentro
          de UNIQO antes de que entre en vigencia.
        </p>
      </Seccion>

      <Seccion id="contacto">
        {CONTACTO ? (
          <p>
            Spanitano Solutions · <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
          </p>
        ) : (
          <p>
            Spanitano Solutions. Mientras no tengamos una casilla propia para estas consultas, los pedidos llegan a
            través de tu productor, si sos asegurado, o por el contacto que ya tenés con nosotros, si sos productor.
          </p>
        )}
      </Seccion>
    </DocumentoLegal>
  );
}
