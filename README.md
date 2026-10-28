# UNIQO · Administración de seguros

Herramienta de trabajo para un productor asesor de seguros independiente:
organiza asegurados, pólizas, vencimientos y tareas operativas. La captación de
empresas que podrían necesitar cobertura sigue disponible en una sección aparte.

**Inicio:** `/` muestra el dashboard general con cartera, prima anual,
vencimientos próximos, notificaciones, cobranza y actividad reciente. La cartera
completa está en `/asegurados`; las capturas diarias de leads reales (licitaciones
nacionales y Boletín Oficial de la Provincia) continúan en segundo plano. Los
datos de personas solo se muestran detrás del login.

## Pantallas

- **Asegurados** (`/asegurados`): cartera, filtros, selección y ficha lateral; cada
  asegurado también tiene una ficha completa en `/asegurados/[id]`.
- **Vencimientos** (`/vencimientos`): pólizas próximas, agrupadas por semana.
- **Importar cartera** (`/importar`): asistente para subir CSV/XLSX, relacionar
  columnas, revisar problemas y combinar o reemplazar pólizas sin borrar datos.
- **Cotización** (`/agentes/cotizacion`): solicitudes vinculadas a asegurados o
  leads, comparativas de precios, filtros, bitácora y desempeño.
- **Validador de pagos** (`/agentes/validador`): revisión de cuotas y comprobantes.
- **Cobranza** (`/agentes/cobranza`): borradores para aprobar y seguimiento de cuotas.
- **Siniestros** (`/agentes/siniestros`): denuncia, documentación, etapas,
  recordatorios, reclamos y cierre.
- **Conciliador** (`/agentes/conciliador`): comisiones esperadas, liquidaciones,
  depósitos, retenciones y reclamos por compañía.
- **Leads del día** (`/leads`), **Ficha del lead** (`/leads/[id]`) y **Mis sectores**
  (`/sectores`): captación, seguimiento y preferencias de fuentes.
- **Configuracion** (`/configuracion`): conexiones OAuth/API con autorizacion real y datos del productor.

Todo esta protegido con una contrasena unica (APP_PASSWORD). Los agentes usan reglas y plantillas; no llaman a modelos de IA.

Las conexiones ya no aceptan datos escritos como prueba de una conexion. Gmail, Google Calendar y Mercado Pago usan OAuth; WhatsApp valida y envia con Meta Cloud API. Sus credenciales de aplicacion deben estar configuradas en el entorno del servidor. Los tokens OAuth se cifran con SESSION_SECRET.

Bancos y portales de aseguradoras siguen pendientes: cada uno necesita un proveedor/API autorizado y sus credenciales. La app los muestra como pendientes y no los usa para enviar cotizaciones ni consultar movimientos.

## Fuentes de leads

| Fuente | Qué trae | Cómo |
|---|---|---|
| **Licitaciones nacionales** (COMPR.AR) | Empresas bonaerenses que ganaron una licitación en los últimos 6 meses, por más de $ 5 millones | CSV de datos abiertos de [datos.gob.ar](https://datos.gob.ar/dataset/sistema-de-contrataciones-electronicas) (CC BY 4.0). El domicilio sale del padrón de proveedores (SiPRO). |
| **Boletín Oficial de la Provincia** | Sociedades nuevas (SA, SRL, SAS…) y compras de fondos de comercio por una sociedad | PDF de la Sección Oficial de cada día hábil, en [boletinoficial.gba.gob.ar](https://boletinoficial.gba.gob.ar). |

**Sector, rubro y ramos** (`src/fuentes/clasificacion.ts`). El sector sale de
palabras clave del objeto social o de lo que se licitó, más la razón social.
El rubro que se muestra es la actividad que justifica ese sector (en comercio,
el rubro que trae la fuente). Transporte se separa en cuatro tipos, según la
primera actividad que menciona el texto:

| Tipo | Ramos sugeridos |
|---|---|
| Carga (fletes, logística, residuos…) | Flota, Carga, RC, ART |
| Pasajeros (remises, colectivos, transporte de personal…) | Flota, RC transporte de personas, AP, ART |
| Sanitario (ambulancias, traslados de pacientes) | Flota, RC transporte de personas, AP, ART |
| Escolar | Flota, RC transporte de personas, AP |

En una licitación se suma Caución adelante. Cada lead guarda el texto con que
se clasificó (`texto_clasificacion`, sin datos de personas). Si cambian las
reglas, `npm run db:reclasificar` muestra qué cambiaría en los leads ya
guardados y `npm run db:reclasificar -- --aplicar` lo guarda.

**Enlace al original.** En los avisos del Boletín, "Ver el edicto" abre el PDF
en la página del aviso (`#page=N`), y la ficha muestra boletín, sección y
página. COMPR.AR no tiene un enlace público por número de proceso: la ficha
abre su buscador y muestra el número de proceso y la fecha para encontrarlo.

Cada lead guarda una `clave` (empresa + evento) para no cargarse dos veces, y
la tabla `capturas` recuerda qué versión de cada fuente ya se procesó: si no
hay nada nuevo, no se descarga nada.

### Contacto en Google Maps

Después de cada captura, `src/fuentes/enriquecimiento` busca cada empresa
nueva en Google Maps (Places API, Text Search) por razón social y localidad.
La coincidencia es prudente: solo se acepta si el nombre se parece y la
dirección está en la misma localidad o partido. Queda como **contacto
verificado** (casi todo el nombre) o **posible coincidencia** (la mitad); si no,
como "sin contacto encontrado", con un enlace para buscarla a mano en Google.

- **Qué se guarda:** solo el *place ID* y el grado de coincidencia. Los términos
  de Google Maps Platform no permiten guardar el teléfono, la dirección, la
  web ni las reseñas: la ficha los pide a Google (Place Details) cada vez que
  se abre, con la atribución "Google Maps".
- **Con teléfono**, la ficha muestra "Llamar" (`tel:`) y, si es un celular,
  "WhatsApp" con el guion ya escrito.
- **Sin contacto** (no está en Google Maps ni hay teléfono por otra vía), el
  lead baja 10 puntos.
- **Costo:** `PLACES_LIMITE_DIARIO` (50 por defecto) limita las búsquedas por
  día; cada ficha abierta hace una consulta más. Una empresa con varios leads se
  busca una sola vez.
- Requiere `GOOGLE_PLACES_API_KEY`. Sin ella no busca nada y lo deja registrado
  en la tabla `capturas` (fuente `contactos-google`).

> **Antes de llamar en frío:** verificá que el número no esté inscripto en el
> [Registro Nacional No Llame](https://nollame.aaip.gob.ar) (Ley 26.951). Llamar
> con fines comerciales a un número inscripto puede generar multas.

### Teléfonos

Después de cada captura, Claude (`claude-haiku-5-5` con búsqueda web) busca
el teléfono que **la propia empresa publica** para que la contacten: su web, su
perfil de Google, sus redes o su ficha en una guía comercial. Prefiere el de
ventas y guarda el link de dónde lo sacó (en la ficha: "dónde figura"). Nunca
busca teléfonos personales de socios o empleados (Ley 25.326). Si no hay uno
confiable, el lead queda como "La empresa no lo publica" y no se vuelve a buscar.

- Se busca una vez por empresa: si gana otra licitación, se reutiliza el dato.
- Cada mañana se procesan hasta 30 empresas, las de mayor score primero. Para
  vaciar la cola de una vez: `npm run telefonos -- 400`.
- Costo estimado: unos US$ 0,03 por empresa (US$ 10 cada 1.000 búsquedas web
  más el modelo). Se paga en console.anthropic.com, aparte de la suscripción a Claude.
- Requiere `ANTHROPIC_API_KEY`. Sin ella, la búsqueda no corre y el resto
  funciona igual.
- Antes de llamar, conviene cruzar los números con el
  [Registro Nacional No Llame](https://nollame.aaip.gob.ar) (Ley 26.951).

**Lo que todavía no se captura, y por qué:**

- **COMPR.AR se publica con atraso.** El CSV se actualiza cada algunos meses
  (en octubre de 2026 la última adjudicación publicada era de julio).
- **PBAC y PBA Contrataciones** (licitaciones y obra pública de la Provincia)
  no tienen datos abiertos. Solo se consultan en su portal web, y PBAC no
  respondió desde fuera de Argentina. **CONTRAT.AR** publicó datos abiertos
  hasta 2023.
- **Habilitaciones de General Pueyrredón:** el municipio publica un CSV anual
  sin razón social, CUIT ni dirección, así que no sirve para identificar empresas.
- **Búsquedas laborales:** los portales de empleo no permiten la extracción
  automática (Computrabajo la bloquea) y no tienen datos abiertos.

**Datos personales (Ley 25.326):** de las fuentes públicas solo se guardan
datos de empresas. Las personas físicas se descartan por CUIT (20, 23, 24, 27)
y por tipo de personería. De los edictos del Boletín se guarda la razón social,
la localidad, el objeto o rubro y el CUIT de la sociedad, nunca socios, DNI ni
domicilios. La única excepción es **Mi cartera**: los clientes del propio
productor, que él decide cargar y que solo se ven detrás del login.

## Uso diario

- **En la lista**, sin entrar a la ficha: "Llamé" (pasa a Llamado), "Para
  después" (recordatorio en 14 días; el lead baja al final de la lista hasta ese
  día) y "Descartar" con motivo.
- **En la ficha**, "Cómo arrancar la conversación" propone un mensaje corto, de
  usted, según qué pasó (licitación, sociedad nueva, fondo de comercio) y el
  sector, con un botón para copiarlo y mandarlo por WhatsApp. Son plantillas,
  no IA (`src/lib/guion.ts`). Si cargás `NOMBRE_PRODUCTOR`, el saludo lo incluye.
- **Cerrar el ciclo**: al marcar "Cerrado" se cargan (opcional) los ramos
  vendidos, la prima y la comisión aproximadas; al "Descartar", el motivo.
  La página **Resultados** muestra contactados, reuniones, cierres, comisión y
  conversión por fuente y por sector.

## Cartera Y Agentes

En `/importar`, subí el CSV o XLSX que exportás de una compañía. El asistente
detecta encabezados, permite corregir el mapeo y muestra errores por fila antes
de guardar. **Combinar** actualiza por DNI/CUIT y número de póliza y suma lo
nuevo; **Reemplazar** además marca como no vigentes las pólizas de esa compañía
ausentes del archivo, sin borrarlas. Reimportar es como el productor mantiene
su cartera al día, así que nunca borra ni pisa: lo que el archivo no trae queda
como estaba, un dato de relleno o que vino mal ("Sin ramo", un DNI incompleto)
no reemplaza lo que se corrigió en la ficha, y la póliza se reconoce por
compañía y número aunque se haya corregido el documento del asegurado. Cada
importación queda en el historial y en el menú lateral.

Obligatorios: asegurado, DNI/CUIT, ramo, fin de vigencia y compañía (si el
archivo no la trae en una columna, se elige para todo el archivo). Del resto se
importa todo lo que el productor necesita ver de sus pólizas y asegurados: lo
que tiene un dato propio en UNIQO (producto, prima, premio, suma asegurada,
fecha de nacimiento, código postal…) va ahí, y lo demás se guarda como "otro
dato" de la póliza y se muestra en la ficha. **No se deja afuera ninguna póliza
ni ninguna columna con datos**: si un dato falta o viene mal (un DNI incompleto,
un ramo que UNIQO no conoce, una fecha imposible), la póliza se importa igual,
marcada para corregir, y lo que vino mal se guarda tal cual. El paso 3 cuadra
las cuentas: cuántas filas trae el archivo, cuántas pólizas resultan y por qué
alguna fila no es una póliza (certificados de otra, totales). Lo que se calcula
queda explicado en la póliza, y lo que no se puede verificar se marca "(a
confirmar)".

Mapfre no informa la prima anual sino el premio de cada factura: la prima anual
es ese premio por las facturas del año según la columna de facturación (×12
mensual, ×2 semestral, ×1 anual). Si la facturación viene vacía se supone según
la sección (combinado e integral trimestrales, autos y motos mensuales) y la
prima queda "(a confirmar)". El
premio de la factura anterior llega sin la coma decimal ("18061979.00" es
$ 180.619,79) y se ubica comparándolo con la última factura de la póliza. Su "FECHA VIG." es el fin
del período facturado (el mes, en las mensuales): la póliza sigue vigente
mientras venga en la cartera; importala con "Reemplazar" para dar de baja las
que ya no estén. Si una póliza tenía cargada como vencimiento una fecha que no
pasa del período que se está facturando (lo que guardaba una importación
anterior), al reimportar deja de contarse como vencimiento y esa fecha queda en
los otros datos como "Fin de vigencia anterior".

Los listados que exporta cada compañía con sus propios encabezados (hoy, la
cartera vigente de Mapfre y el detalle de cartera de Sancor) se reconocen solos:
columnas, compañía y códigos de ramo. Se definen en
`src/lib/formatos-cartera.ts`, donde cada columna dice a qué dato va o por qué
no se importa (el motivo se muestra al relacionar columnas). Para sumar una
compañía, agregá su formato con un test que use sus encabezados reales y datos
inventados.

La cartera vive en `asegurados`, `polizas` y tablas relacionadas; la antigua
tabla `cartera` queda sin uso para conservar la historia de migración. Los leads
que coinciden por CUIT muestran **Ya es cliente** con un enlace a su ficha.

Las acciones de los agentes que envían mensajes o reclamos pasan por una
confirmación del productor y dejan registro. El Conciliador exporta un CSV para
el contador y permite cargar una liquidación por archivo; si ya existe una
liquidación para esa compañía y período, la carga se rechaza para preservar los
datos anteriores.

## Resumen diario

A las 8 (hora argentina) `/api/cron/resumen` arma el resumen del día: los 5
mejores leads sin contactar (primero los detectados en las últimas 24 horas),
con motivo, teléfono y guion, más los recordatorios de hoy y los vencidos y, si
hay cartera cargada, las pólizas que vencen en los próximos 30 días. Los
recordatorios que se cargan en la ficha y los "Para después" entran acá.

- Se envía por email con [Resend](https://resend.com) si están
  `RESEND_API_KEY` y `RESUMEN_EMAIL_DESTINO` (uno o varios, separados por
  coma). Sin un dominio verificado en Resend, el remitente por defecto
  (`onboarding@resend.dev`) solo entrega al email de la cuenta de Resend;
  con dominio propio, cargá `RESUMEN_EMAIL_REMITENTE`.
- Sin key, el resumen solo se arma y se ve en **Resumen del día** (`/resumen`).
- Para sumar WhatsApp: otro canal que implemente `CanalResumen` en
  `src/resumen/canales.ts` (la versión en texto, `resumenEnTexto`, ya está).

## Cómo se calcula el score

Cada fuente asigna un `score_base` (0–95) según qué tan urgente es la
necesidad de seguro (ver `src/fuentes/clasificacion.ts`):

| | Base | Sector | Zona | Contrato |
|---|---|---|---|---|
| Licitación ganada | 72 | flotas/construcción +12, industria +5 | Mar del Plata +5, costa +3 | ≥ $ 20 M +3, ≥ $ 100 M o en divisas +6 |
| Sociedad nueva | 68 | flotas +14, construcción +12, industria +6, gastronomía +4, salud +2 | ídem | — |
| Compra de fondo de comercio | 66 | flotas +10, construcción +8, industria y gastronomía +6, salud +4, comercio +2 | ídem | — |

La prioridad del sector lo ajusta: **alta +5**, **media 0**, **baja −15**
(ver `src/lib/score.ts`). Alto ≥ 80, medio ≥ 65.

**Antigüedad del evento.** Cada lead guarda la fecha del evento
(`fecha_evento`: adjudicación o publicación del edicto), distinta de cuándo lo
detectó el radar. El score baja con los días que pasaron desde el evento, y se
recalcula solo cada día (`src/lib/evento.ts`):

| Evento | Hasta 7 días | 8–15 | 16–30 | 31–60 | 61–90 | Más de 90 |
|---|---|---|---|---|---|---|
| Licitación ganada | 0 | −5 | −10 | −25 | −25 | −35 |
| Sociedad nueva | 0 | 0 | 0 | −5 | −10 | −20 |
| Compra de fondo de comercio | 0 | 0 | 0 | −5 | −15 | −15 |

Pasados 30 días de una adjudicación la garantía ya se presentó: la caución deja
de ser el primer ramo sugerido y pasa al final. La lista y la ficha muestran
"Adjudicada hace X" o "Publicado hace X", y la fecha de detección como dato secundario.

**Sin contacto.** Un lead que no aparece en Google Maps y del que no hay
teléfono por otra vía baja 10 puntos (`src/lib/contacto.ts`).

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Postgres + Drizzle ORM ·
Vitest · Playwright.

## Correrlo en tu computadora

Necesitas Node 20.9+ y un Postgres (local o en Neon).

```bash
npm install
cp .env.example .env          # completa DATABASE_URL, APP_PASSWORD y SESSION_SECRET
npm run db:preparar           # crea las tablas y carga los datos iniciales
npm run dev                   # http://localhost:3000
```

## Publicarlo en Vercel (para que tu papá entre desde su computadora)

1. **Proyecto:** en Vercel, importa este repo. Cada push a `main` se publica solo.
2. **Base de datos:** en el proyecto, pestaña *Storage* → **Neon** → crear base.
   Vercel carga `DATABASE_URL` automáticamente.
3. **Variables:** en *Settings → Environment Variables* carga `APP_PASSWORD`
   (la contraseña de tu papá), `SESSION_SECRET`, `CRON_SECRET` y, para los
   teléfonos, `ANTHROPIC_API_KEY`.
4. **Redeploy.** El build aplica las migraciones y, si la base está vacía,
   carga sectores y leads de ejemplo (`scripts/preparar-db.ts`). Nunca pisa datos existentes.
   Los deploys de **preview** (ramas sin mergear) no migran: en Vercel, Preview
   usa la misma base que producción. Las migraciones se aplican al mergear a `main`.

Para generar `SESSION_SECRET` y `CRON_SECRET` (uno distinto para cada uno):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Si cambias `SESSION_SECRET`, todas las sesiones abiertas se cierran.

### Captura diaria (Vercel Cron)

`vercel.json` programa cuatro ejecuciones por día, en hora argentina:

| Hora | Endpoint |
|---|---|
| 05:00 | `/api/cron/captura/licitaciones` |
| 06:00 | `/api/cron/captura/boletin-oficial` |
| 07:00 | `/api/cron/telefonos` |
| 08:00 | `/api/cron/resumen` |

Vercel las llama con `Authorization: Bearer <CRON_SECRET>`. Sin esa clave el
endpoint responde 401. En el plan Hobby, Vercel puede correrlas en cualquier
momento dentro de esa hora. El resultado de cada ejecución (leads nuevos o
error) queda en la tabla `capturas` y en los logs del proyecto. Para correrlas
a mano: `npm run captura`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm test` | Tests unitarios (score, filtros, fechas, sesión, captura de fuentes) |
| `npm run captura` | Trae leads reales de todas las fuentes (`-- licitaciones` o `-- boletin-oficial` para una sola) |
| `npm run db:reclasificar` | Muestra cómo cambian sector, rubro, ramos y score de los leads guardados con las reglas actuales (`-- --aplicar` para guardar) |
| `npm run telefonos` | Busca el teléfono de hasta 30 empresas pendientes (`-- 3` para probar, `-- 400` para todas) |
| `npm run test:e2e` | Prueba de punta a punta de los flujos (ver abajo) |
| `npm run db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:preparar` | Migraciones + datos iniciales si la base está vacía (lo corre el build) |
| `npm run db:seed` | Carga datos iniciales y leads de ejemplo (no pisa la configuración) |
| `npm run db:seed -- --reset` | Igual, pero vuelve sectores y zonas a los valores iniciales |
| `npm run db:limpiar-ejemplos` | Borra los leads de ejemplo (la captura ya lo hace sola) |

### Prueba de punta a punta

Modifica datos, así que córrela contra una base local:

```bash
npm run db:seed -- --reset && npm run build && npm start   # en una terminal
npx playwright install chromium                              # solo la primera vez
npm run test:e2e                                             # en otra terminal
```

Revisa login → cartera, búsqueda y panel del asegurado, importación CSV en modo
combinar (con una fila inválida), leads y sectores, solicitud de cotización,
confirmación de pago, aprobación de cobranza, envío de denuncia y reclamo,
conexión configurada de WhatsApp, las pantallas principales a 390 px y cierre de
sesión. El archivo de importación está en `e2e/fixtures/`.

## Estructura

```
src/
  app/
    (app)/             pantallas privadas y Server Actions
    api/cron/          endpoint que dispara la captura (protegido con CRON_SECRET)
    login/             login y cierre de sesión
  components/          barra lateral e íconos
  db/                  esquema y conexión (Drizzle)
  fuentes/             captura de leads: una carpeta por fuente, con fixtures reales
    licitaciones/      COMPR.AR (CSV de datos abiertos)
    boletin-oficial/   Boletín Oficial de la Provincia (PDF diario)
  lib/                 lógica: score, filtros, fechas, sesión, catálogos
  telefonos/           búsqueda del teléfono de cada empresa con Claude
  proxy.ts             redirige al login si no hay sesión
scripts/               seed, captura manual y limpieza de ejemplos
drizzle/               migraciones SQL
e2e/                   prueba de punta a punta
```

## Próximos pasos

1. Licitaciones **provinciales** (PBAC y PBA Contrataciones, que incluye obra
   pública): revisar sus términos de uso o pedir los datos a la Contaduría
   General y al Ministerio de Infraestructura.
2. Licitaciones **municipales** de General Pueyrredón y la costa.
3. Habilitaciones y búsquedas laborales: buscar una fuente que publique la
   empresa (por ejemplo, pedir el dato al municipio).
