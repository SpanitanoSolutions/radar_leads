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
  leads, cotización por conexión directa o portal, comparativo, propuesta en PDF
  con el logo de la cuenta, bitácora con filtros y desempeño.
- **Validador de pagos** (`/agentes/validador`): revisión de cuotas y comprobantes.
- **Cobranza** (`/agentes/cobranza`): casos de los recibos por vencer y vencidos, el agente que le escribe al asegurado, su configuración, ejecuciones y API (ver "Agente de Cobranza v2").
- **Siniestros** (`/agentes/siniestros`): expedientes con o sin póliza, documentos,
  checklist, gastos, informes en borrador, seguimiento y archivado.
- **Conciliador** (`/agentes/conciliador`): comisiones esperadas, liquidaciones,
  depósitos, retenciones y reclamos por compañía.
- **Leads del día** (`/leads`), **Ficha del lead** (`/leads/[id]`) y **Mis sectores**
  (`/sectores`): captación, seguimiento y preferencias de fuentes.
- **Configuracion** (`/configuracion`): conexiones OAuth/API con autorizacion real y datos del productor.
- **Conexiones con las compañías** (`/configuracion/companias`): común a Cotización, Validador y Siniestros (ver "Base común de agentes").

Todo esta protegido con una contrasena unica (APP_PASSWORD). El agente de Cotizacion usa reglas y plantillas como base; la IA es opcional y requiere activacion para la organizacion.

Las conexiones ya no aceptan datos escritos como prueba de una conexion. Gmail, Google Calendar y Mercado Pago usan OAuth; WhatsApp valida y envia con Meta Cloud API. Sus credenciales de aplicacion deben estar configuradas en el entorno del servidor. Los tokens OAuth se cifran con SESSION_SECRET: si se cambia, hay que volver a autorizar cada cuenta.

- **Gmail** pide solo permiso de envio (`gmail.send`), nunca de lectura. Los correos salen con el nombre de "Mi cuenta" como remitente, y el panel de la conexion tiene "Mandar un correo de prueba" a la misma casilla. Si Google revoca la autorizacion, la conexion queda en "Hay que volver a autorizar".
- **Los mensajes de ejemplo** (`es_ejemplo`) nunca salen por una conexion real: sus telefonos y correos son inventados y pueden ser de alguien.
- Pasos para habilitar cada conexion y como se probo: `docs/progreso/conexiones.md`.

Los bancos siguen pendientes: necesitan un proveedor/API autorizado y sus credenciales. Las compañías de seguros tienen su propia pantalla, Conexiones con las compañías; sin un conector real, los agentes trabajan por correo o con carga manual.

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
- Requiere `ANTHROPIC_API_KEY` y prenderla con `TELEFONOS_IA=1`: con la clave
  sola no arranca (la clave también la usan los agentes). Sin las dos, la
  búsqueda no corre y el resto funciona igual.
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
confirmación del productor y dejan registro. El Agente de Cobranza escribe solo
únicamente si el productor apaga su modo prueba y su "Pedirme aprobación". El Conciliador exporta un CSV para
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
   (la contraseña de tu papá), `SESSION_SECRET`, `CRON_SECRET` y, para la IA,
   `ANTHROPIC_API_KEY` (la búsqueda de teléfonos además necesita `TELEFONOS_IA=1`).
4. **Redeploy.** El build aplica las migraciones y, si la base está vacía,
   carga sectores y leads de ejemplo (`scripts/preparar-db.ts`). Nunca pisa datos existentes.
   Los deploys de **preview** (ramas sin mergear) no migran: en Vercel, Preview
   usa la misma base que producción. Las migraciones se aplican al mergear a `main`.

Para generar `SESSION_SECRET` y `CRON_SECRET` (uno distinto para cada uno):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Si cambias `SESSION_SECRET`, todas las sesiones abiertas se cierran.

### Tareas programadas (Vercel Cron)

`vercel.json` programa estas ejecuciones, en hora argentina:

| Hora | Endpoint | Qué hace |
|---|---|---|
| 05:00 | `/api/cron/captura/licitaciones` | Captura de licitaciones |
| 06:00 | `/api/cron/captura/boletin-oficial` | Captura del Boletín Oficial |
| 07:00 | `/api/cron/telefonos` | Busca teléfonos de empresas nuevas |
| 08:00 | `/api/cron/resumen` | Resumen del día |
| 08:00 | `/api/cron/validador` | Validador de pagos: validación y enriquecimiento, según su Programación |
| 10:00 (lun. a vie.) | `/api/cron/cotizacion` | Seguimientos de cotización |
| 10:00 | `/api/cron/cobranza` | Agente de Cobranza, según su Horario (días permitidos y hora) |
| 11:00 | `/api/cron/ia-trabajos` | Retoma la cola de trabajos de IA |

El Validador corre cada etapa una vez por período (día, semana o mes), desde la
hora configurada en su Programación (por defecto, 07:00 la validación y 08:00 el
enriquecimiento) y solo con el agente activo. Como el cron pasa una vez por día
a las 08:00, una hora configurada más tarde recién corre en la pasada del día
siguiente; si el plan de Vercel lo permite, conviene llevar ese cron a cada hora
(`0 * * * *`): el endpoint ya decide solo si le toca.

Cobranza corre una vez por día, solo los días permitidos de su Horario, desde la
hora configurada (10:00 por defecto) y con el agente activo. Con el cron diario,
una hora posterior a las 10:00 no corre nunca: la Configuración lo avisa.

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
| `npm run evaluar:validador -- <carpeta> [--ia]` | Mide la extracción y el matching del Validador con un set de prueba (ver "Validador de pagos v2") |
| `npm run db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:preparar` | Migraciones + datos iniciales si la base está vacía (lo corre el build) |
| `npm run db:seed` | Carga datos iniciales, leads y cartera de ejemplo (no pisa la configuración) |
| `npm run db:seed -- --reset` | Igual, pero vuelve sectores y zonas a los valores iniciales |
| `npm run db:seed:cobranza` | Carga (o recarga) la demo del Agente de Cobranza: 100 recibos ficticios con su línea de tiempo |
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
el Validador (confirmar un pago; y el recorrido de la spec: importar un listado,
ver los totales, expandir un asegurado, confirmar un comprobante y enviar una
vencida a Cobranza), aprobación de cobranza, el Agente de Cobranza (KPIs,
corrida de prueba, línea de tiempo, respuesta simulada, configuración y API),
envío de denuncia y reclamo,
WhatsApp, las pantallas principales a 390 px y cierre de sesión. El archivo de
importación está en `e2e/fixtures/`.

Cobranza, Siniestros y el Conciliador solo envían con WhatsApp o Gmail
conectados de verdad: sin eso, el E2E comprueba que avisan y no sale nada. Para
probar también "Ejecutar validación" con compañías, levantá la app con
`CONECTORES_SIMULADOS=1`.

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

## Agente de Cotización v2

En `/agentes/cotizacion` podés crear solicitudes vinculadas a un asegurado o lead, configurar aseguradoras, ramos, paquetes y plantillas, cargar respuestas y comparar primas totales. El detalle de cada solicitud permite registrar contactos, adjuntar documentos, revisar eventos, exportar la lista y la comparativa a CSV o Excel y descargar una comparativa PDF o generar una propuesta PDF para el cliente.

La creación de una solicitud prepara un borrador de correo por aseguradora. Con "Aprobar y cotizar" (o con "Cotizar automáticamente" en la configuración), el agente pide la cotización por conexión directa o portal a las compañías que tienen conectores (`src/lib/conectores/`), en el orden de canales de cada una (`conector_companias`; sin fila, primero la conexión directa). Si ninguno sirve, queda el correo para aprobar, con el motivo en el registro de la solicitud. Si el portal pide un dato que falta, la compañía queda en "Requiere atención" con la pregunta; al responderla, el dato se guarda en el riesgo y se vuelve a cotizar. Los pedidos corren en la cola `ia_trabajos` (`cotizacion:cotizar_envio` y `cotizacion:consultar_cotizacion`, que consulta las cotizaciones que tardan con la estrategia de seguimiento). Ningún conector emite, acepta ni firma.

Cada correo necesita aprobación y sale por la salida común (`src/agentes/envio.ts`) con el correo de la cuenta conectado; si no está conectado, queda aprobado y sin enviar, y el detalle lo dice con un botón "Enviar ahora". Las cotizaciones cargadas por el productor quedan confirmadas; las que manda una compañía por un conector o lee la IA esperan su confirmación. La aprobación de la propuesta PDF solo habilita su descarga para compartirla manualmente.

Las pantallas (fase 4, `docs/progreso/cotizacion-v2.md`):
- **Inicio:** el checklist "Terminá de configurar tu agente de cotización" (lo que vendés, una aseguradora con contacto, los accesos de portal y la voz), cada paso con su sección. La pestaña **Bitácora** muestra todos los eventos de las solicitudes (`cotizacion_eventos`) con filtros por texto, compañía, quién, tipo y fecha. **Desempeño** mide la respuesta desde que salió el pedido (no desde el borrador) y muestra el volumen y el cierre promedio; el ranking cuenta solicitudes.
- **Nueva solicitud:** ofrece los tipos de seguro activos y marca las aseguradoras "sin paquete configurado" para el ramo. Cada envío lleva el paquete de su ramo.
- **Detalle:** Contactos con el próximo seguimiento (o la consulta programada de las que tardan), las preguntas, **Copiar** y **Excel** (`exportar/[id]?vista=contactos`); el comparativo con las filas de la spec (gastos, impuestos, daños, robo, cristales, RC y servicios), en vista compacta o detallada, con "Mejor precio" solo entre las confirmadas; la pestaña Agente con la línea de tiempo de pasos, los borradores para aprobar y el **correo al ejecutivo** (el resumen de la solicitud, al correo de Mi cuenta, por la salida común), y el panel con "Requiere atención", la persona de la configuración, los seguimientos activos y los archivos por compañía.
- **Propuesta en PDF:** A4, con el logo de Mi cuenta (PNG o JPG; un WebP no entra en el PDF y la pantalla lo avisa), los datos de la cuenta, acentos (Helvetica con `WinAnsiEncoding`), las respuestas confirmadas ordenadas por precio y las coberturas informadas. Queda en borrador hasta que la aprobás. El comparativo en PDF usa la misma marca.
- **Configuración:** el ABM de **Tipos de seguro** (la baja desactiva, no borra) y la estrategia de seguimiento, que se lee mientras se escribe ("Así la entiende el agente") y tiene **"Sugerir con IA"** (solo con la IA activa; pasa por `ejecutarIA()` y el parser valida la sugerencia antes de ofrecerla; se guarda recién con "Guardar configuración").

La configuración está en `/agentes/cotizacion/configuracion`. El orden de canales, las claves de los portales y la salud de cada compañía están en Conexiones con las compañías (ver "Base común de agentes"); el campo `canal` de las aseguradoras ya no se muestra ni decide nada. La IA pasa por `ejecutarIA()`: su interruptor está en la configuración de Cotización, y el uso y el costo quedan en `ia_uso` dentro del tope del mes. Sin `ANTHROPIC_API_KEY`, todo sigue a mano.

El cron `/api/cron/cotizacion` protegido por `CRON_SECRET` solo crea borradores de seguimiento. La programación de Vercel lo ejecuta de lunes a viernes. Con `CONECTORES_SIMULADOS=1`, cada compañía tiene una conexión directa y un portal simulados, y `CONECTORES_SIMULADOS_FORZAR` fija lo que hace cada una para probar sin azar (ver `.env.example`). Para respuestas de prueba por correo, usá el simulador de una solicitud de ejemplo fuera de producción. Los adjuntos se guardan en PostgreSQL, con un límite de 25 MB por archivo.

Las migraciones del módulo empiezan en `0014_cotizacion_v2.sql`; `0016` agrega propuestas PDF, `0017` los datos de riesgo para validación, `0029` la provincia de la cuenta y el interruptor de IA, y `0030` los canales de cada envío y `conector_companias`. Las columnas `org_id` y `producer_id` quedan nullable hasta que la aplicación incorpore identidad multi-organización persistida; las sesiones actuales no permiten asignarlas de forma segura. Los catálogos iniciales contienen aseguradoras argentinas y se pueden editar desde la configuración.

## Agente de Siniestros v2

La nueva alta de `/agentes/siniestros` permite vincular un asegurado o una póliza de forma opcional, buscar coincidencias por nombre/documento/patente/número de póliza, registrar afectados y adjuntar varios PDF/JPG/PNG (hasta 25 MB por solicitud). Los adjuntos se guardan en PostgreSQL y se descargan detrás de la sesión de la aplicación. Los requisitos existentes se copian a `siniestro_requisitos` durante la migración; los documentos físicos se guardan por separado.

En `/agentes/siniestros/configuracion` se definen requisitos bloqueantes/opcionales, orden del dossier y plazos operativos por compañía, ramo y tipo. Los valores base de 3 y 14 días son recordatorios internos, no afirmaciones legales. `/agentes/siniestros/informes` muestra resúmenes, constancias y denuncias en borrador. El dossier se habilita al completar los requisitos bloqueantes y se puede imprimir o guardar como PDF desde el navegador. El agente no envía nada sin aprobación.

Los proveedores/modelos y el scheduler de trabajos se conectarán más adelante. El registro de `src/lib/ia/registro.ts`, las tablas `ia_trabajos`, `ia_uso` e `ia_configuracion` y los estados de análisis dejan la integración desacoplada; los adjuntos nuevos quedan en “IA pendiente de configurar” y el flujo manual sigue disponible. Los informes médicos están fuera de alcance. El plan aprobado está en `docs/PLAN-siniestros-v2.md`; las migraciones nuevas van de `0018` a `0023` e incluyen el traspaso seguro del checklist anterior y campos multi-organización opcionales.

Cuando estén disponibles diez casos anonimizados con resultados esperados, `npm run evaluar:siniestros -- <archivo-json>` calcula métricas agregadas de clasificación y extracción sin mostrar valores de expedientes. Cada caso usa `clasificacionEsperada`, `clasificacionObtenida`, `camposEsperados` y `camposObtenidos`; el archivo no debe incluir nombres, documentos ni contenido real.

## Base común de agentes

- **IA (`src/lib/ia/`):** los agentes llaman a `ejecutarIA()`, que elige el modelo según la tarea (Haiku 5.5 para extraer, Sonnet 5.5 para explicar y reintentar), valida con zod, aplica la cuota y registra cada intento en `ia_uso`. La IA queda apagada hasta que haya una fila activa en `ia_configuracion` y esté `ANTHROPIC_API_KEY`.
- **Cola (`ia_trabajos`):** `encolarTrabajo()` + `despachadorTrabajos.despachar()` procesan en segundo plano. `/api/cron/ia-trabajos` retoma lo pendiente.
- **Compañías (`src/lib/conectores/`):** `ejecutarEnCompania()` prueba API → portal → archivo, aplica los permisos y audita en `conector_llamadas`. Con `CONECTORES_SIMULADOS=1` (nunca en producción) cada compañía responde con `SimuladaApi` y `SimuladaPortal`.
- **Credenciales de portales (`credenciales_portal`):** el secreto se cifra con AES-256-GCM y `CREDENCIALES_PORTAL_KEY` (si falta, se usa `COTIZACION_CREDENTIALS_KEY`). Nunca se muestra ni va a logs; solo se descifra para pasárselo a un conector.
- **Mapeos (`conector_mapeos`):** lo aprendido por compañía × ramo × operación, con versión. El listado de cobranza del Validador es la operación `importar_listado`.
- **Conexiones con las compañías (`/configuracion/companias`):** la pantalla común a los tres agentes. Por compañía muestra los canales que tiene (conexión directa, portal, archivo) con su salud (`conector_salud`) y "Probar conexión", qué puede hacer cada agente y cuándo lo hace solo, el orden de los canales (`conector_companias`: automático, uno propio o solo correo o carga manual), el usuario y la clave del portal, el correo de Cotización y la plantilla de los listados del Validador. Con `?agente=cotizacion|validador|siniestros` muestra solo lo de ese agente. Las compañías van por su nombre canónico ("Seguros Rivadavia" → "Rivadavia"), también en `ejecutarEnCompania()`, así los agentes comparten el orden, la salud y las claves.
- Spec: `docs/specs/conectores.md`. Progreso: `docs/progreso/base-comun.md`.

## Validador de pagos v2

- **Listados de cobranza:** el productor sube el Excel, CSV o PDF de cada compañía. Con un formato conocido (su plantilla en `conector_mapeos`) se lee sin IA y se actualizan las cuotas que coinciden; las demás quedan "a revisar" o "no identificadas". Un formato nuevo se propone con IA (o por sinónimos, sin IA) y el productor lo confirma una vez. Un PDF necesita la IA para transcribir la tabla.
- **Reglas puras con tests (`src/lib/validador/`):** lectura de listados, matching, estados con la gracia por compañía × ramo, programación y resumen de cada corrida.
- **Corrida:** el cron o "Ejecutar validación" consultan los conectores, cruzan, aplican los cambios y recalculan los estados. Cada corrida queda en `validador_corridas` y en Actividad.
- **Comprobantes:** la IA los lee, el matching propone el cobro con su puntaje y el productor confirma. Nunca se marcan pagados solos.
- **Cobranza** usa la gracia del Validador (`validador_gracia`) y no persigue las cuotas pagadas o canceladas por la compañía.
- **Configuración (`/agentes/validador/configuracion`):**
  - las credenciales de los portales y la plantilla de listado de cada compañía están en Conexiones con las compañías (`/configuracion/companias?agente=validador`);
  - la gracia por compañía × ramo, que marca las compañías sin gracia cargada, y la tolerancia de monto;
  - la programación, con la próxima ejecución real según el cron, que pasa una vez por día a las 08:00;
  - los avisos al productor por WhatsApp o email: un resumen diario o un aviso por evento, solo después de las corridas automáticas. A los asegurados no les escribe: eso sigue siendo un borrador de Cobranza.
- **Datos de ejemplo (`scripts/validador-ejemplo.ts`):** 6 compañías con las pólizas que devuelven los conectores simulados, unas 300 cuotas en pesos y dólares en todos los estados, un listado de Sancor ya leído, uno de La Segunda esperando que se confirmen las columnas y 5 comprobantes sueltos. Con `CONECTORES_SIMULADOS=1`, "Ejecutar validación" confirma los pagos del último mes, cancela lo anulado y deja unos pocos casos a revisar. Las fechas de los simulados dependen del mes: si cambió el mes desde que sembraste, volvé a correr `npm run db:seed`.
- **Evaluación (`npm run evaluar:validador -- <carpeta> [--ia]`):** la carpeta trae un `set.json` (la cartera, lo que tiene que salir de cada fila de cada listado y de cada comprobante) y los archivos. Mide que la extracción de monto, fecha y póliza acierte al menos el 95 % y que el matching sugiera la cuota correcta al menos el 90 %. Sin `--ia` mide el código (listados en Excel o CSV y el matching); con `--ia`, también la IA (PDF y comprobantes), y necesita `DATABASE_URL`, `ANTHROPIC_API_KEY` y la IA activa. Hay un set de demo ficticio en `scripts/evaluacion-validador/demo/`; la meta se mide con listados reales anonimizados de 3 compañías y 20 comprobantes.
- Spec: `docs/specs/validador-v2.md`. Plan: `docs/PLAN-validador-v2.md`. Progreso: `docs/progreso/validador-v2.md`.

## Agente de Cobranza v2

Reemplaza la secuencia de 5 pasos de la v1. Spec: `docs/specs/cobranza-v2.md`. Plan (con cómo se tradujo cada nombre de la spec): `docs/PLAN-cobranza-v2.md`. Progreso: `docs/progreso/cobranza-v2.md`.

- **Casos (`cobranza_casos`):** un caso por cobro (las cuotas del mismo asegurado, compañía y vencimiento), sincronizado con la cartera cada vez que se mira el tablero o corre el agente: nacen de los recibos impagos de −60 a +30 días, pasan a pagados solos, y los filtros de la configuración o la falta de teléfono y correo los mandan a sus pestañas. Todo lo que pasa queda en `cobranza_eventos` (la línea de tiempo).
- **Agente:** cada corrida (cron, "Ejecutar ahora", "Probar" o la API) toma los recibos que pasan las reglas duras (estado, máximo de intentos, días entre intentos, primer contacto, promesa con gracia, días y ventana horaria, baja), los agrupa por asegurado y la IA (Haiku 5.5, con herramientas) decide qué escribir y por dónde. Cada herramienta vuelve a pasar por las reglas. Sin IA, el mismo ejecutor escribe con plantillas por tramo. La IA entra en el tope común de USD 20 y cada turno queda en `ia_uso`.
- **Modo prueba (por defecto):** todo va a los destinos de prueba; sin destino o sin conexión real, se simula. Con el modo prueba apagado y "Pedirme aprobación" prendido (por defecto), cada mensaje espera en "Para aprobar", junto con los pedidos del Validador y las llamadas que el agente le deja al productor. En modo real, sin Gmail o WhatsApp conectados, el envío falla y queda el error: nunca se finge. Los casos de ejemplo nunca salen por una conexión real.
- **Respuestas:** `POST /api/v1/agentes/cobranza/entrantes/whatsapp` y `/email` (o "Simular respuesta" en el caso, en modo prueba). Se reconoce al asegurado por su número, su correo o la referencia `C-<id>`; el agente registra la promesa, el pago informado, la consulta, el rechazo o la baja, y contesta si hace falta.
- **API (`/api/v1/agentes/cobranza/...`):** con clave (`Authorization: Bearer uniqo_…`), que se genera en `/agentes/cobranza/api`; ahí está la referencia completa. El proxy deja pasar `/api/v1` sin sesión y cada ruta exige la clave.
- **Pantallas:** tablero con los 5 KPIs y las pestañas Activos, Sin datos de contacto, Excluidas por reglas y Para aprobar; detalle del caso; Configuración (General con 7 secciones y Canales); vista del agente con sus instrucciones, herramientas, triggers, ejecuciones, detalles y settings; Ejecuciones; API.
- **Demo:** Configuración → Demo o `npm run db:seed:cobranza`.

## Specs de producto
- Las specs de agentes están en docs/specs/. Leé solo la que corresponde a la tarea.
- docs/specs/conectores.md manda sobre las demás en todo lo relativo a compañías.
- Progreso de cada spec: docs/progreso/<spec>.md (estado, hecho, próximo paso exacto).
- Una fase por sesión. Al terminar: tests, lint, build, commit y actualizar el progreso.